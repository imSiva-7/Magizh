#!/usr/bin/env node
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import { canonicalHash } from "./migrate-supplier-procurements.mjs";
import { flattenSupplierDocument, NESTED_COLLECTION, validateEntry, summarizeEntries } from "../src/lib/supplier-procurements.mjs";
import { ENTRY_COLLECTION, SUMMARY_COLLECTION, buildFlatSummary } from "../src/lib/flat-procurements.mjs";
import { STORAGE_CONTROL, STORAGE_KEY, withProcurementTransaction } from "../src/lib/procurement-transaction.mjs";

export const BACKUP_COLLECTION = "procurements_flat_migration_backup";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const invariant = (valid, message) => { if (!valid) throw new Error(message); };
export function parseArguments(args) {
  const known = new Set(["--apply", "--verify", "--dry-run", "--activate", "--help"]);
  invariant(args.every((arg) => known.has(arg)), "Unknown migration option");
  invariant(args.filter((arg) => ["--apply", "--verify", "--dry-run", "--activate"].includes(arg)).length <= 1, "Choose one migration mode");
  return { mode: args.includes("--apply") ? "apply" : args.includes("--activate") ? "activate" : args.includes("--verify") ? "verify" : "dry-run", help: args.includes("--help") };
}
export function planMigration(nested, existing) {
  const source = nested.flatMap(flattenSupplierDocument), ids = new Set(), groups = new Map();
  for (const entry of source) {
    validateEntry(entry);
    invariant(!ids.has(String(entry._id)), "Duplicate procurement ID in nested source"); ids.add(String(entry._id));
    const key = String(entry.supplierId); if (!groups.has(key)) groups.set(key, { supplierId: entry.supplierId, entries: [] });
    groups.get(key).entries.push(entry);
  }
  // Empty suppliers still get initialized zero summaries.
  for (const document of nested) if (!groups.has(String(document._id))) groups.set(String(document._id), { supplierId: document._id, entries: [] });
  invariant(source.length > 0, "Nested source is empty; refusing to change active storage");
  const previous = new Map(existing.map((entry) => [String(entry._id), entry]));
  const replacements = source.filter((entry) => previous.has(String(entry._id)) && canonicalHash(previous.get(String(entry._id))) !== canonicalHash(entry));
  const additions = source.filter((entry) => !previous.has(String(entry._id)));
  const extras = existing.filter((entry) => !ids.has(String(entry._id)));
  return { source, groups, replacements, additions, extras, totals: summarizeEntries(source), fingerprint: canonicalHash(nested), targetFingerprint: canonicalHash(existing) };
}
function assertEntriesEqual(expected, actual) {
  const map = new Map(actual.map((entry) => [String(entry._id), entry]));
  invariant(map.size === expected.length, "Flat entry count does not match authoritative nested source");
  for (const entry of expected) invariant(canonicalHash(entry) === canonicalHash(map.get(String(entry._id))), "Full BSON procurement comparison failed");
}
function summaryContent(document) {
  const { revision: _revision, createdAt: _createdAt, updatedAt: _updatedAt, ...content } = document;
  for (const bucket of ["overall", "paid", "unpaid"]) if (content[bucket]) content[bucket] = Object.fromEntries(Object.entries(content[bucket]).map(([key, value]) => [key, Number(value)]));
  for (const key of ["schemaVersion", "activeDays", "avgMilkPerDay"]) if (content[key] != null) content[key] = Number(content[key]);
  return content;
}
export function verifySummaries(groups, summaries) {
  const map = new Map(summaries.map((summary) => [String(summary.supplierId), summary]));
  invariant(map.size === groups.size, "Supplier summary count mismatch");
  for (const { supplierId, entries } of groups.values()) {
    const expected = buildFlatSummary(supplierId, entries);
    invariant(canonicalHash(summaryContent(expected)) === canonicalHash(summaryContent(map.get(String(supplierId)) || {})), "Supplier summary verification failed");
  }
}
export async function verifyFlat(db, { compareNested = true } = {}) {
  const [nested, entries, summaries] = await Promise.all([db.collection(NESTED_COLLECTION).find({}).toArray(), db.collection(ENTRY_COLLECTION).find({}).toArray(), db.collection(SUMMARY_COLLECTION).find({}).toArray()]);
  const groups = new Map(summaries.map((summary) => [String(summary.supplierId), { supplierId: summary.supplierId, entries: [] }]));
  for (const entry of entries) {
    const key = String(entry.supplierId);
    if (!groups.has(key)) groups.set(key, { supplierId: entry.supplierId, entries: [] });
    groups.get(key).entries.push(entry);
  }
  if (compareNested) assertEntriesEqual(nested.flatMap(flattenSupplierDocument), entries);
  verifySummaries(groups, summaries);
  return { entries: entries.length, suppliers: summaries.length, totals: summarizeEntries(entries) };
}

export async function runMigration(db, options) {
  const control = db.collection(STORAGE_CONTROL);
  const state = await control.findOne({ _id: STORAGE_KEY });
  if (state?.mode === "flat") {
    invariant(options.mode !== "apply", "Flat storage already active; use --verify instead of restoring the frozen nested backup");
    if (options.mode === "activate") {
      invariant(process.env.PROCUREMENTS_STORAGE === "flat", "Set PROCUREMENTS_STORAGE=flat before releasing maintenance");
      const verification = await verifyFlat(db, { compareNested: Boolean(state.paused) });
      await control.updateOne({ _id: STORAGE_KEY, mode: "flat" }, { $set: { paused: false, activatedAt: new Date(), updatedAt: new Date() } });
      return { mode: "flat", active: true, ...verification };
    }
    return { mode: "flat", writesPaused: Boolean(state.paused), ...await verifyFlat(db, { compareNested: false }) };
  }
  invariant(options.mode !== "activate", "Apply the flat migration before activation");
  const [nested, existing] = await Promise.all([db.collection(NESTED_COLLECTION).find({}).toArray(), db.collection(ENTRY_COLLECTION).find({}).toArray()]);
  const plan = planMigration(nested, existing);
  const report = { mode: options.mode, entries: plan.source.length, suppliers: plan.groups.size, additions: plan.additions.length, replacements: plan.replacements.length, staleLegacyEntries: plan.extras.length, totals: plan.totals, sourceFingerprint: plan.fingerprint };
  if (options.mode === "dry-run") return report;
  if (options.mode === "verify") return verifyFlat(db);

  // Shared maintenance gate prevents stale local app instances writing to the
  // nested backup after cutover. Read/write conflicts on every source document
  // force concurrent pre-gate transactions to retry and observe the gate.
  await control.updateOne({ _id: STORAGE_KEY }, { $set: { paused: true, mode: "nested", migration: "flat-v1", updatedAt: new Date() } }, { upsert: true });
  const collections = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
  for (const name of [SUMMARY_COLLECTION, BACKUP_COLLECTION]) if (!collections.has(name)) await db.createCollection(name);
  await db.collection(ENTRY_COLLECTION).createIndex({ supplierId: 1, date: -1, createdAt: -1 }, { name: "supplier_date_created" });
  await db.collection(ENTRY_COLLECTION).createIndex({ date: -1, createdAt: -1 }, { name: "date_created" });
  await db.collection(ENTRY_COLLECTION).createIndex({ supplierId: 1, paymentStatus: 1, date: -1 }, { name: "supplier_payment_date" });
  await withProcurementTransaction(db, async (tx) => {
    const lockedSource = await tx.collection(NESTED_COLLECTION).find({}).toArray();
    const lockedTarget = await tx.collection(ENTRY_COLLECTION).find({}).toArray();
    invariant(canonicalHash(lockedSource) === plan.fingerprint, "Nested source changed since dry run; writes remain paused; rerun migration");
    invariant(canonicalHash(lockedTarget) === plan.targetFingerprint, "Legacy target changed since dry run; writes remain paused; rerun migration");
    for (const document of lockedSource) {
      const result = await tx.collection(NESTED_COLLECTION).updateOne({ _id: document._id, $expr: { $eq: ["$$ROOT", { $literal: document }] } }, { $inc: { revision: 1 } });
      invariant(Number(result.matchedCount) === 1, "Concurrent nested source change");
    }
    const previous = new Map(lockedTarget.map((entry) => [String(entry._id), entry]));
    const oldRecords = [...plan.replacements.map((entry) => previous.get(String(entry._id))), ...plan.extras];
    if (oldRecords.length) await tx.collection(BACKUP_COLLECTION).bulkWrite(oldRecords.map((entry) => ({ updateOne: { filter: { _id: `${entry._id}:${canonicalHash(entry)}` }, update: { $setOnInsert: { original: entry, backedUpAt: new Date() } }, upsert: true } })));
    const operations = [...plan.additions.map((entry) => ({ insertOne: { document: entry } })), ...plan.replacements.map((entry) => ({ replaceOne: { filter: { _id: entry._id }, replacement: entry } })), ...plan.extras.map((entry) => ({ deleteOne: { filter: { _id: entry._id } } }))];
    if (operations.length) await tx.collection(ENTRY_COLLECTION).bulkWrite(operations);
    const summaries = [...plan.groups.values()].map(({ supplierId, entries }) => buildFlatSummary(supplierId, entries));
    await tx.collection(SUMMARY_COLLECTION).bulkWrite(summaries.map((summary) => ({ replaceOne: { filter: { _id: summary._id }, replacement: summary, upsert: true } })));
    const stale = await tx.collection(SUMMARY_COLLECTION).find({ _id: { $nin: summaries.map((summary) => summary._id) } }).toArray();
    invariant(stale.length === 0, "Unexpected supplier summaries found; review them before migration");
    assertEntriesEqual(plan.source, await tx.collection(ENTRY_COLLECTION).find({}).toArray());
    verifySummaries(plan.groups, await tx.collection(SUMMARY_COLLECTION).find({}).toArray());
    await tx.collection(STORAGE_CONTROL).updateOne({ _id: STORAGE_KEY }, { $set: { mode: "flat", paused: true, verifiedAt: new Date(), updatedAt: new Date() } });
  }, { maintenance: true });
  return { ...report, verified: true, writesPaused: true, next: "Set PROCUREMENTS_STORAGE=flat in every app instance, then release the database maintenance gate." };
}
export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) { console.log("node scripts/migrate-flat-procurements.mjs [--dry-run|--apply|--verify|--activate]\nApply pauses writes through app_storage; preserves nested data; backs up any stale flat entries before replacing them. Keep direct Atlas/external writes stopped during migration. Activate requires PROCUREMENTS_STORAGE=flat and verified source/target equality before releasing writes."); return; }
  dotenv.config({ path: resolve(root, ".env.local"), quiet: true });
  invariant(Boolean(process.env.MONGODB_URI), "MONGODB_URI is missing");
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, promoteValues: false });
  try { await client.connect(); console.log(JSON.stringify(await runMigration(client.db(process.env.MONGODB_DB || "production"), options), null, 2)); }
  finally { await client.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(`Migration failed: ${error.message?.includes("URI") ? "Database configuration error" : error.name === "MongoServerError" ? "Database rejected the operation; maintenance gate remains paused. Inspect privately." : error.message}`); process.exitCode = 1; });
