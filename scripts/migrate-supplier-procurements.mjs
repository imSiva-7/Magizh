#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BSON, MongoClient } from "mongodb";
import {
  buildSupplierDocument,
  MAX_DOCUMENT_BYTES,
  NESTED_COLLECTION,
  summarizeEntries,
} from "../src/lib/supplier-procurements.mjs";

const SOURCE_COLLECTION = "procurements";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_METADATA = new Set(["createdAt", "updatedAt", "revision"]);

class MigrationError extends Error {}

const HELP = `Supplier procurement migration (default: read-only dry run)

  node scripts/migrate-supplier-procurements.mjs
  node scripts/migrate-supplier-procurements.mjs --apply --writes-paused
  node scripts/migrate-supplier-procurements.mjs --verify

--dry-run        Validate source and compare the proposed target without writing.
--apply          Insert validated supplier documents; never overwrite existing data.
--writes-paused  Confirm ALL procurement writes are stopped for the entire migration.
--verify         Independently verify every source entry, target entry and summary.
--help           Show this help without connecting to MongoDB.

Reads MONGODB_URI from the environment or project .env.local (never printed).
Database: MONGODB_DB, default production.
Source: ${SOURCE_COLLECTION}; target: ${NESTED_COLLECTION}.
Keep the source frozen through apply, verification and the storage cutover.
`;

export function parseArguments(args) {
  const allowed = new Set(["--dry-run", "--apply", "--writes-paused", "--verify", "--help"]);
  if (args.some((arg) => !allowed.has(arg))) {
    throw new MigrationError("Unknown argument. Use --help for supported options.");
  }
  const modes = ["--dry-run", "--apply", "--verify"].filter((flag) => args.includes(flag));
  if (modes.length > 1) {
    throw new MigrationError("Choose one of --dry-run, --apply or --verify.");
  }
  const mode = modes[0]?.slice(2) || "dry-run";
  const writesPaused = args.includes("--writes-paused");
  if (mode === "apply" && !writesPaused && !args.includes("--help")) {
    throw new MigrationError("Apply requires --writes-paused after stopping ALL procurement writes.");
  }
  return { mode, writesPaused, help: args.includes("--help") };
}

// Canonical Extended JSON retains BSON values; sorting keys avoids relying on
// BSON field order. Entry timestamps remain part of every content comparison.
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]),
  );
}

export function canonicalHash(value) {
  const encoded = JSON.stringify(sortKeys(BSON.EJSON.serialize(value, { relaxed: false })));
  return createHash("sha256").update(encoded ?? "undefined").digest("hex");
}

export function documentContentHash(document) {
  return canonicalHash(Object.fromEntries(
    Object.entries(document).filter(([key]) => !ROOT_METADATA.has(key)),
  ));
}

function objectIdKey(value) {
  if (value?._bsontype !== "ObjectId" || typeof value.toHexString !== "function") {
    throw new MigrationError("Invalid BSON ID in procurement data; expected ObjectId. No data was printed.");
  }
  return value.toHexString();
}

function requireEqual(actual, expected, message) {
  if (canonicalHash(actual) !== canonicalHash(expected)) throw new MigrationError(message);
}

function checkSummaries(container, records, level) {
  const expected = summarizeEntries(records);
  for (const category of ["overall", "paid", "unpaid"]) {
    requireEqual(container[category], expected[category], `Verification failed: ${level} ${category} summary mismatch.`);
  }
}

/** Check source content, paths, summaries and reverse indexes without trusting
 * the builder's proposed document or previously recorded migration totals. */
export function verifyDocuments(sourceRecords, targetDocuments) {
  const source = new Map();
  const sourceSuppliers = new Set();
  const entriesBySupplier = new Map();
  for (const entry of sourceRecords) {
    const key = objectIdKey(entry._id);
    if (source.has(key)) throw new MigrationError("Verification failed: duplicate source entry ID.");
    source.set(key, entry);
    const supplierKey = objectIdKey(entry.supplierId);
    sourceSuppliers.add(supplierKey);
    if (!entriesBySupplier.has(supplierKey)) entriesBySupplier.set(supplierKey, []);
    entriesBySupplier.get(supplierKey).push(entry);
  }

  const seen = new Set();
  const targetSuppliers = new Set();
  for (const document of targetDocuments) {
    const supplierKey = objectIdKey(document._id);
    if (targetSuppliers.has(supplierKey)) throw new MigrationError("Verification failed: duplicate supplier document.");
    targetSuppliers.add(supplierKey);
    if (objectIdKey(document.supplierId) !== supplierKey || !sourceSuppliers.has(supplierKey)) {
      throw new MigrationError("Verification failed: target supplier does not match the source.");
    }
    const entryPaths = {};
    if (!document.years || typeof document.years !== "object" || Array.isArray(document.years)) {
      throw new MigrationError("Verification failed: invalid years structure.");
    }
    for (const [yearKey, year] of Object.entries(document.years)) {
      const yearEntries = [];
      if (!year?.months || typeof year.months !== "object" || Array.isArray(year.months)) {
        throw new MigrationError("Verification failed: invalid months structure.");
      }
      for (const [monthKey, month] of Object.entries(year.months)) {
        const monthEntries = [];
        if (!month?.days || typeof month.days !== "object" || Array.isArray(month.days)) {
          throw new MigrationError("Verification failed: invalid days structure.");
        }
        for (const [dayKey, day] of Object.entries(month.days)) {
          if (!day?.entries || typeof day.entries !== "object" || Array.isArray(day.entries)) {
            throw new MigrationError("Verification failed: invalid entries structure.");
          }
          const dayEntries = Object.values(day.entries);
          for (const [key, entry] of Object.entries(day.entries)) {
            if (key !== objectIdKey(entry._id) || seen.has(key) || !source.has(key)) {
              throw new MigrationError("Verification failed: missing, duplicate or unexpected target entry ID.");
            }
            if (objectIdKey(entry.supplierId) !== supplierKey || entry.date !== `${yearKey}-${monthKey}-${dayKey}`) {
              throw new MigrationError("Verification failed: target entry is under the wrong supplier or date.");
            }
            requireEqual(entry, source.get(key), "Verification failed: full source and target entry content differs.");
            seen.add(key);
            entryPaths[key] = `years.${yearKey}.months.${monthKey}.days.${dayKey}.entries.${key}`;
          }
          checkSummaries(day, dayEntries, "day");
          monthEntries.push(...dayEntries);
        }
        checkSummaries(month, monthEntries, "month");
        yearEntries.push(...monthEntries);
      }
      checkSummaries(year, yearEntries, "year");
    }
    checkSummaries(document, entriesBySupplier.get(supplierKey), "supplier");
    requireEqual(document.entryPaths, entryPaths, "Verification failed: entry path index mismatch.");
    if (!Array.isArray(document.entryIds)) throw new MigrationError("Verification failed: missing entry ID index.");
    const indexedIds = document.entryIds.map(objectIdKey).sort();
    requireEqual(indexedIds, Object.keys(entryPaths).sort(), "Verification failed: entry ID index mismatch.");
    if (BSON.calculateObjectSize(document) > MAX_DOCUMENT_BYTES) {
      throw new MigrationError("Verification failed: a supplier document exceeds the safe size limit.");
    }
  }
  if (seen.size !== source.size || targetSuppliers.size !== sourceSuppliers.size) {
    throw new MigrationError("Verification failed: source and target entry/supplier counts differ.");
  }
  return { suppliers: targetSuppliers.size, entries: seen.size, ...summarizeEntries(sourceRecords) };
}

async function readSource(collection, retainRecords = true) {
  const records = [];
  let count = 0;
  const hash = createHash("sha256");
  // Stable ordering plus a complete BSON-aware content hash detects inserts,
  // updates and deletions, including changes that leave count/totals unchanged.
  for await (const record of collection.find({}).sort({ _id: 1 })) {
    hash.update(canonicalHash(record));
    count += 1;
    if (retainRecords) records.push(record);
  }
  return { records, fingerprint: hash.digest("hex"), count };
}

async function confirmSourceUnchanged(collection, baseline) {
  const latest = await readSource(collection, false);
  if (latest.count !== baseline.count || latest.fingerprint !== baseline.fingerprint) {
    throw new MigrationError("Source changed during migration. Keep writes paused, inspect the target and rerun validation before cutover.");
  }
  return latest;
}

function buildExpectedDocuments(records) {
  const groups = new Map();
  for (const record of records) {
    const supplierKey = objectIdKey(record.supplierId);
    if (!groups.has(supplierKey)) groups.set(supplierKey, []);
    groups.get(supplierKey).push(record);
  }
  try {
    return [...groups.values()].map((entries) => buildSupplierDocument(entries));
  } catch {
    throw new MigrationError("Source validation failed. Check required fields, BSON IDs, valid dates, numeric values and supplier document sizes. No records were printed or changed.");
  }
}

export function planMigration(expectedDocuments, existingDocuments) {
  const expected = new Map(expectedDocuments.map((document) => [objectIdKey(document._id), document]));
  const existing = new Map();
  for (const document of existingDocuments) {
    const key = objectIdKey(document._id);
    if (existing.has(key) || !expected.has(key)) {
      throw new MigrationError("Target has unexpected supplier documents. Inspect them before migration; nothing will be overwritten.");
    }
    if (documentContentHash(document) !== documentContentHash(expected.get(key))) {
      throw new MigrationError("An existing target document differs from the source. Migration refuses to overwrite it; do not replay stale legacy data after cutover.");
    }
    existing.set(key, document);
  }
  return {
    insert: expectedDocuments.filter((document) => !existing.has(objectIdKey(document._id))),
    skipped: existing.size,
  };
}

function printTotals(label, result) {
  console.log(`${label}: ${result.suppliers} supplier document(s), ${result.entries} entry/entries.`);
  for (const category of ["overall", "paid", "unpaid"]) {
    const total = result[category];
    console.log(`  ${category}: ${total.count} entry/entries; milk ${total.milkQuantity}; amount ${total.totalAmount}`);
  }
}

export async function runMigration(db, options) {
  if (!["dry-run", "apply", "verify"].includes(options.mode)) {
    throw new MigrationError("Choose an explicit valid migration mode.");
  }
  if (options.mode === "apply" && !options.writesPaused) {
    throw new MigrationError("Apply requires confirmation that ALL procurement writes are paused.");
  }
  const source = db.collection(SOURCE_COLLECTION);
  const target = db.collection(NESTED_COLLECTION);
  const baseline = await readSource(source);
  const expectedDocuments = buildExpectedDocuments(baseline.records);
  const expectedTotals = verifyDocuments(baseline.records, expectedDocuments);
  const existingDocuments = await target.find({}).toArray();
  console.log(`Mode: ${options.mode}. Source collection is preserved.`);
  printTotals("Validated source", expectedTotals);

  if (options.mode === "verify") {
    const result = verifyDocuments(baseline.records, existingDocuments);
    // Check the complete structure/schema as well as independently verified data.
    planMigration(expectedDocuments, existingDocuments);
    await confirmSourceUnchanged(source, baseline);
    printTotals("Verification passed", result);
    console.log("Every source ID, full entry, date path, index and summary matches.");
    return result;
  }

  const plan = planMigration(expectedDocuments, existingDocuments);
  console.log(`Plan: insert ${plan.insert.length}; skip ${plan.skipped} identical existing document(s).`);
  await confirmSourceUnchanged(source, baseline);
  if (options.mode === "dry-run") {
    console.log("Dry run passed. No collection, index or record was created or changed.");
    return expectedTotals;
  }
  await target.createIndexes([
    { key: { supplierId: 1 }, name: "supplierId_unique", unique: true },
    { key: { entryIds: 1 }, name: "entryIds_unique", unique: true },
  ]);
  let inserted = 0;
  let skipped = plan.skipped;
  for (const document of plan.insert) {
    try {
      await target.insertOne(document);
      inserted += 1;
    } catch (error) {
      // A concurrent or interrupted prior run can insert the same supplier.
      // Read and compare it; never replace or upsert over an existing document.
      if (error.code !== 11000) throw error;
      const existing = await target.findOne({ _id: document._id });
      if (!existing || documentContentHash(existing) !== documentContentHash(document)) {
        throw new MigrationError("A target conflict appeared during migration. No existing data was overwritten; keep writes paused and inspect before continuing.");
      }
      skipped += 1;
    }
  }
  await confirmSourceUnchanged(source, baseline);
  const stored = await target.find({}).toArray();
  const result = verifyDocuments(baseline.records, stored);
  planMigration(expectedDocuments, stored);
  await confirmSourceUnchanged(source, baseline);
  console.log(`Apply complete: inserted ${inserted}; skipped ${skipped} identical document(s).`);
  printTotals("Verification passed", result);
  console.log("Keep writes paused; run --verify independently before changing PROCUREMENTS_STORAGE to nested.");
  return result;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) {
    console.log(HELP);
    return;
  }
  const require = createRequire(import.meta.url);
  require("dotenv").config({ path: resolve(projectRoot, ".env.local"), quiet: true });
  if (!process.env.MONGODB_URI) throw new MigrationError("MONGODB_URI is missing. Set it in the environment or project .env.local.");
  if (process.env.PROCUREMENTS_STORAGE && !["legacy", "nested"].includes(process.env.PROCUREMENTS_STORAGE)) {
    throw new MigrationError("PROCUREMENTS_STORAGE must be legacy or nested.");
  }
  if (options.mode === "apply" && process.env.PROCUREMENTS_STORAGE === "nested") {
    throw new MigrationError("Nested storage is already enabled. Do not migrate stale legacy records after cutover; restore legacy mode only as part of a reviewed rollback.");
  }
  const client = new MongoClient(process.env.MONGODB_URI, {
    maxPoolSize: 2,
    serverSelectionTimeoutMS: 15000,
    // Preserve raw BSON numeric wrappers inside copied legacy entries.
    promoteValues: false,
  });
  try {
    await client.connect();
    await runMigration(client.db(process.env.MONGODB_DB || "production"), options);
  } finally {
    await client.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Database driver errors can contain hostnames, credentials or record data.
    // Only controlled validation messages are suitable for terminal output.
    const message = error instanceof MigrationError
      ? error.message
      : "Database operation failed. Check connectivity, permissions and indexes privately. The source was preserved; a partial target can be rerun after validation.";
    console.error(`Migration failed: ${message}`);
    process.exitCode = 1;
  });
}
