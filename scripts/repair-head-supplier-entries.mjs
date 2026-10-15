#!/usr/bin/env node

import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { BSON, MongoClient, ObjectId } from "mongodb";
import { HEAD_ENTRIES, buildHeadDocument, flattenHeadEntries } from "../src/lib/head-supplier-entries.mjs";
import { getProcurementStore } from "../src/lib/supplier-procurements.mjs";

export const BACKUP_COLLECTION = "head_supplier_entries_backup";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANAGED_METADATA = new Set(["revision", "updatedAt"]);
class RepairError extends Error {}

const HELP = `Head supplier commission repair (default: read-only dry run)

  node scripts/repair-head-supplier-entries.mjs
  node scripts/repair-head-supplier-entries.mjs --apply --writes-paused --expected-fingerprint <dry-run fingerprint>

--dry-run               Inspect and validate without writing (the default).
--apply                 Back up original documents, then replace using exact BSON compare-and-swap.
--writes-paused         Confirm all procurement, supplier relationship and commission writes are stopped.
--expected-fingerprint  Require the exact fingerprint printed by the reviewed dry run.
--help                  Print this help without connecting to MongoDB.

Reads MONGODB_URI and PROCUREMENTS_STORAGE from the environment or .env.local.
Uses MONGODB_DB, default production. Connection details and record contents are never printed.
Backups: ${BACKUP_COLLECTION}. Missing commission payment statuses are never inferred as paid.
`;

export function parseArguments(args) {
  const options = { mode: "dry-run", writesPaused: false, expectedFingerprint: null, help: false };
  let explicitMode = null;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help") options.help = true;
    else if (arg === "--writes-paused") options.writesPaused = true;
    else if (arg === "--apply" || arg === "--dry-run") {
      if (explicitMode && explicitMode !== arg) throw new RepairError("Choose either --dry-run or --apply.");
      explicitMode = arg;
      options.mode = arg.slice(2);
    } else if (arg === "--expected-fingerprint") {
      const value = args[++index];
      if (!/^[a-f0-9]{64}$/.test(value || "")) throw new RepairError("Provide a valid dry-run fingerprint.");
      options.expectedFingerprint = value;
    } else throw new RepairError("Unknown argument. Use --help for supported options.");
  }
  if (options.mode === "apply" && !options.help && (!options.writesPaused || !options.expectedFingerprint)) {
    throw new RepairError("Apply requires --writes-paused and --expected-fingerprint from the reviewed dry run.");
  }
  return options;
}

function sortedKeys(value) {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedKeys(value[key])]));
}

export function canonicalHash(value) {
  return createHash("sha256").update(JSON.stringify(sortedKeys(BSON.EJSON.serialize(value, { relaxed: false })))).digest("hex");
}

function idKey(value) {
  return value && ObjectId.isValid(value) ? String(value) : null;
}

function reverseReferences(document) {
  return { ...(document.byProcurement || {}), ...(document.legacyReferences || {}) };
}

function contentHash(document) {
  return canonicalHash(Object.fromEntries(Object.entries(document).filter(([key]) => !MANAGED_METADATA.has(key))));
}

export function sourceFingerprint(heads, procurements) {
  const ordered = (records) => records.map((record) => [String(record._id), canonicalHash(record)]).sort(([a], [b]) => a.localeCompare(b));
  return canonicalHash({ heads: ordered(heads), procurements: ordered(procurements) });
}

/** Historical prices and the reverse reference establish the amount and owner.
 * The overwritten row's payment history cannot be reconstructed, so review is mandatory. */
export function recoverCommission(procurement) {
  const procurementId = idKey(procurement?._id);
  const childSupplierId = idKey(procurement?.supplierId);
  const cut = Number(procurement?.cutPercentage);
  const parent = Number(procurement?.parentTsr);
  const quantity = Number(procurement?.milkQuantity);
  const fat = Number(procurement?.fatPercentage);
  const snf = Number(procurement?.snfPercentage);
  const date = procurement?.date;
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? new Date(`${date}T00:00:00Z`) : null;
  if (!procurementId || !childSupplierId || procurement.customRate || !Number.isFinite(cut) || !Number.isFinite(parent)
    || cut <= 0 || cut >= parent || ![quantity, fat, snf].every((number) => Number.isFinite(number) && number > 0)
    || !parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date
    || !["AM", "PM"].includes(procurement.time)) return null;
  const round = (number, decimals) => Math.round(number * 10 ** decimals) / 10 ** decimals;
  const totalSolids = fat + snf;
  const rate = totalSolids * cut / 100;
  return {
    procurementId: new ObjectId(procurementId),
    childSupplierId: new ObjectId(childSupplierId),
    childSupplierName: procurement.supplierName || "",
    date, time: procurement.time,
    parentTsr: round(parent, 4), cutPercentage: round(cut, 4), childTsr: round(parent - cut, 4),
    milkQuantity: quantity, fatPercentage: fat, snfPercentage: snf,
    totalSolids: round(totalSolids, 4), ratePerLiter: round(rate, 4), totalAmount: round(rate * quantity, 2),
    paymentStatus: "Not Paid", paymentReviewRequired: true,
    paymentReviewReason: "The legacy commission entry was overwritten; its historical payment status is unknown.",
    recoveredFromProcurement: true,
    comment: procurement.comment || "", actionDoneBy: procurement.actionDoneBy || "",
    createdAt: procurement.createdAt || new Date(0), updatedAt: procurement.updatedAt || procurement.createdAt || new Date(0),
  };
}

export function createRepairPlan(heads, procurements) {
  const sources = new Map(procurements.map((entry) => [idKey(entry._id), entry]));
  if (sources.size !== procurements.length || sources.has(null)) throw new RepairError("Invalid or duplicate procurement IDs in source data.");
  const owners = new Map();
  const rowsByHead = new Map();
  const report = {
    headDocuments: heads.length, legacyHeads: 0, nestedHeads: 0, survivingEntries: 0,
    reverseReferences: 0, referencedProcurements: 0, absentReferencedProcurements: 0,
    orphanSurvivingEntries: 0, recoveredEntries: 0, paymentStatuses: {},
    ambiguousReferences: 0, invalidSnapshots: 0, invalidReferences: 0,
    pendingPaymentReview: 0, updates: 0, unchanged: 0,
  };
  for (const document of heads) {
    if (!idKey(document._id)) throw new RepairError("A head document has an invalid ID.");
    if (rowsByHead.has(String(document._id))) throw new RepairError("Duplicate head documents cannot be safely normalized.");
    if (Number(document.schemaVersion) !== 2) {
      // The application flattener skips malformed legacy rows. A repair must
      // stop instead of allowing that convenience to silently discard data.
      for (const shifts of Object.values(document.entries || {})) {
        for (const entry of Object.values(shifts || {})) {
          if (!entry || !idKey(entry.procurementId)) throw new RepairError("A surviving legacy commission has an invalid procurement ID. Nothing was written.");
        }
      }
    }
    const rows = flattenHeadEntries(document);
    const seen = new Set();
    for (const row of rows) {
      const key = idKey(row.procurementId || row._id);
      if (!key || seen.has(key)) throw new RepairError("A head document has invalid or duplicate surviving commission IDs.");
      if (!["AM", "PM"].includes(row.time)) throw new RepairError("A surviving commission has an invalid AM/PM period. Nothing was written.");
      seen.add(key);
    }
    rowsByHead.set(String(document._id), rows);
    if (Number(document.schemaVersion) === 2) report.nestedHeads++; else report.legacyHeads++;
    report.survivingEntries += rows.length;
    report.reverseReferences += Object.keys(reverseReferences(document)).length;
    for (const key of new Set([...seen, ...Object.keys(reverseReferences(document))])) {
      if (!idKey(key)) { report.invalidReferences++; continue; }
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key).add(String(document._id));
    }
    for (const row of rows) {
      const status = row.paymentStatus || "(missing)";
      report.paymentStatuses[status] = (report.paymentStatuses[status] || 0) + 1;
      if (!sources.has(idKey(row.procurementId || row._id))) report.orphanSurvivingEntries++;
    }
  }
  report.referencedProcurements = owners.size;
  report.absentReferencedProcurements = [...owners.keys()].filter((key) => !sources.has(key)).length;
  report.ambiguousReferences = [...owners.values()].filter((headIds) => headIds.size !== 1).length;
  const updates = [];
  for (const previous of heads) {
    const rows = [...rowsByHead.get(String(previous._id))];
    const present = new Set(rows.map((entry) => idKey(entry.procurementId || entry._id)));
    for (const key of Object.keys(reverseReferences(previous))) {
      if (present.has(key) || owners.get(key)?.size !== 1 || !sources.has(key)) continue;
      const recovered = recoverCommission(sources.get(key));
      if (!recovered) { report.invalidSnapshots++; continue; }
      rows.push(recovered);
      present.add(key);
      report.recoveredEntries++;
    }
    report.pendingPaymentReview += rows.filter((entry) => entry.paymentReviewRequired).length;
    let next;
    try { next = buildHeadDocument(previous._id, rows, previous); }
    catch { throw new RepairError("A head document could not be safely normalized. Inspect the source privately."); }
    if (contentHash(previous) === contentHash(next)) { report.unchanged++; continue; }
    updates.push({ previous, next, fingerprint: canonicalHash(previous) });
  }
  report.updates = updates.length;
  return { fingerprint: sourceFingerprint(heads, procurements), report, updates };
}

async function readSnapshot(db) {
  const heads = await db.collection(HEAD_ENTRIES).find({}).toArray();
  const ids = new Set();
  for (const document of heads) {
    for (const key of Object.keys(reverseReferences(document))) if (idKey(key)) ids.add(key);
    for (const row of flattenHeadEntries(document)) {
      const key = idKey(row.procurementId || row._id);
      if (key) ids.add(key);
    }
  }
  const procurements = ids.size ? await getProcurementStore(db).find({ _id: { $in: [...ids].map((key) => new ObjectId(key)) } }).toArray() : [];
  return { heads, procurements };
}

async function saveImmutableBackup(collection, previous, fingerprint) {
  const _id = `${previous._id}:${fingerprint}`;
  const existing = await collection.findOne({ _id });
  if (existing) {
    if (existing.sourceFingerprint !== fingerprint || canonicalHash(existing.document) !== fingerprint) throw new RepairError("An existing backup conflicts with the source. No head document was replaced.");
    return false;
  }
  try {
    await collection.insertOne({ _id, sourceCollection: HEAD_ENTRIES, sourceId: previous._id, sourceFingerprint: fingerprint, backedUpAt: new Date(), document: previous });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const raced = await collection.findOne({ _id });
    if (!raced || canonicalHash(raced.document) !== fingerprint) throw new RepairError("A backup conflict appeared. No head document was replaced.");
    return false;
  }
  return true;
}

export async function runRepair(db, options = parseArguments([])) {
  const snapshot = await readSnapshot(db);
  const plan = createRepairPlan(snapshot.heads, snapshot.procurements);
  if (options.mode !== "apply") return { fingerprint: plan.fingerprint, ...plan.report, mode: "dry-run", databaseWrites: 0 };
  if (!options.writesPaused || !options.expectedFingerprint) throw new RepairError("Apply requires a confirmed write pause and reviewed fingerprint.");
  if (options.expectedFingerprint !== plan.fingerprint) throw new RepairError("Source changed since the reviewed dry run. Nothing was written; run another dry run.");
  if (plan.report.ambiguousReferences || plan.report.invalidSnapshots || plan.report.invalidReferences) throw new RepairError("Ambiguous references or invalid snapshots block apply. Nothing was written; resolve the source privately.");
  const recheck = await readSnapshot(db);
  if (sourceFingerprint(recheck.heads, recheck.procurements) !== plan.fingerprint) throw new RepairError("Source changed before apply. Nothing was written; keep writes paused and inspect.");
  const heads = db.collection(HEAD_ENTRIES);
  const backup = db.collection(BACKUP_COLLECTION);
  let backupsCreated = 0;
  for (const item of plan.updates) {
    if (await saveImmutableBackup(backup, item.previous, item.fingerprint)) backupsCreated++;
    // Exact original BSON equality catches legacy writers that do not increment revision.
    const result = await heads.replaceOne({ _id: item.previous._id, $expr: { $eq: ["$$ROOT", { $literal: item.previous }] } }, item.next);
    if (result.matchedCount !== 1) throw new RepairError("A head changed during repair. Its backup is preserved; keep writes paused and run another dry run.");
    const stored = await heads.findOne({ _id: item.previous._id });
    if (!stored || canonicalHash(stored) !== canonicalHash(item.next)) throw new RepairError("Stored head verification failed. Its backup is preserved; keep writes paused and inspect.");
  }
  const after = await readSnapshot(db);
  if (canonicalHash(after.procurements.map((row) => [String(row._id), canonicalHash(row)]).sort()) !== canonicalHash(snapshot.procurements.map((row) => [String(row._id), canonicalHash(row)]).sort())) throw new RepairError("Procurements changed during repair. Backups are preserved; keep writes paused and inspect.");
  if (after.heads.length !== snapshot.heads.length) throw new RepairError("The head document count changed during repair. Keep writes paused and inspect.");
  for (const before of snapshot.heads) {
    const expected = plan.updates.find((item) => String(item.previous._id) === String(before._id))?.next || before;
    const stored = after.heads.find((row) => String(row._id) === String(before._id));
    if (!stored || canonicalHash(stored) !== canonicalHash(expected)) throw new RepairError("A head changed before final verification. Keep writes paused and inspect.");
  }
  return { fingerprint: plan.fingerprint, ...plan.report, mode: "apply", verified: true, headReplacements: plan.updates.length, backupsCreated, databaseWrites: plan.updates.length + backupsCreated };
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) { console.log(HELP); return; }
  dotenv.config({ path: resolve(projectRoot, ".env.local"), quiet: true });
  if (!process.env.MONGODB_URI) throw new RepairError("MONGODB_URI is missing. Connection details were not printed.");
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, maxPoolSize: 2, promoteValues: false });
  try {
    await client.connect();
    console.log(JSON.stringify(await runRepair(client.db(process.env.MONGODB_DB || "production"), options), null, 2));
  } finally { await client.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof RepairError ? error.message : "Head repair failed. Check connectivity and source data privately; connection details were withheld. Preserve backups and inspect before retrying apply.");
    process.exitCode = 1;
  });
}
