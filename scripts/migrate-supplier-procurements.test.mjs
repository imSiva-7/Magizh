import assert from "node:assert/strict";
import test from "node:test";
import { BSON, ObjectId } from "mongodb";
import { buildSupplierDocument, NESTED_COLLECTION } from "../src/lib/supplier-procurements.mjs";
import {
  canonicalHash,
  documentContentHash,
  parseArguments,
  planMigration,
  runMigration,
  verifyDocuments,
} from "./migrate-supplier-procurements.mjs";

const clone = (value) => BSON.deserialize(BSON.serialize(value), { promoteValues: false });
function fixtures() {
  const supplierId = new ObjectId("000000000000000000000001");
  return [
    {
      _id: new ObjectId("000000000000000000000010"), supplierId,
      date: "2026-10-15", time: "AM", paymentStatus: "Paid",
      milkQuantity: new BSON.Double(10.5), totalAmount: new BSON.Double(420.25),
      createdAt: new Date("2026-10-15T00:00:00.000Z"),
      updatedAt: new Date("2026-10-15T01:00:00.000Z"),
      extraField: { retained: new BSON.Int32(8) },
    },
    {
      _id: new ObjectId("000000000000000000000011"), supplierId,
      date: "2026-09-14", time: "AM", paymentStatus: "Not Paid",
      milkQuantity: new BSON.Int32(20), totalAmount: BSON.Long.fromNumber(800),
      createdAt: new Date("2026-09-14T00:00:00.000Z"),
    },
  ];
}

function fakeDb(records, documents = [], changeSourceAtRead = Infinity) {
  const state = { sourceReads: 0, indexWrites: 0, inserts: 0, documents: documents.map(clone) };
  return {
    state,
    collection(name) {
      if (name === "procurements") return {
        find() {
          state.sourceReads += 1;
          const current = records.map(clone);
          if (state.sourceReads >= changeSourceAtRead) current[0].totalAmount = new BSON.Double(999);
          return {
            sort() { return this; },
            async *[Symbol.asyncIterator]() { for (const record of current) yield record; },
          };
        },
      };
      assert.equal(name, NESTED_COLLECTION);
      return {
        find() { return { async toArray() { return state.documents.map(clone); } }; },
        async createIndexes(indexes) {
          assert.deepEqual(indexes.map((index) => index.key), [{ supplierId: 1 }, { entryIds: 1 }]);
          assert.ok(indexes.every((index) => index.unique));
          state.indexWrites += 1;
        },
        async insertOne(document) { state.inserts += 1; state.documents.push(clone(document)); },
      };
    },
  };
}

test("CLI defaults to dry-run and requires a confirmed write pause for apply", () => {
  assert.deepEqual(parseArguments([]), { mode: "dry-run", writesPaused: false, help: false });
  assert.equal(parseArguments(["--apply", "--writes-paused"]).mode, "apply");
  assert.equal(parseArguments(["--verify"]).mode, "verify");
  assert.throws(() => parseArguments(["--apply"]), /writes-paused/);
  assert.throws(() => parseArguments(["--apply", "--verify"]), /Choose one/);
  assert.throws(() => parseArguments(["--unknown"]), /Unknown argument/);
});

test("canonical hashes ignore key ordering and retain BSON numeric types", () => {
  assert.equal(canonicalHash({ a: 1, b: 2 }), canonicalHash({ b: 2, a: 1 }));
  assert.notEqual(canonicalHash(new BSON.Double(3)), canonicalHash(new BSON.Int32(3)));
});

test("idempotency ignores only root metadata and refuses entry timestamp changes", () => {
  const expected = buildSupplierDocument(fixtures());
  const existing = clone(expected);
  existing.createdAt = new Date();
  existing.updatedAt = new Date();
  existing.revision = new BSON.Int32(9);
  assert.equal(documentContentHash(existing), documentContentHash(expected));
  assert.deepEqual(planMigration([expected], [existing]), { insert: [], skipped: 1 });
  const entry = existing.years["2026"].months["10"].days["15"].entries["000000000000000000000010"];
  entry.updatedAt = new Date("2026-10-16T00:00:00Z");
  assert.throws(() => planMigration([expected], [existing]), /differs/);
});

test("verification compares complete BSON entries, summaries and reverse indexes", () => {
  const records = fixtures();
  const document = clone(buildSupplierDocument(records));
  const result = verifyDocuments(records, [document]);
  assert.equal(result.entries, 2);
  assert.equal(result.overall.totalAmount, 1220.25);
  assert.equal(result.paid.milkQuantity, 10.5);
  document.years["2026"].months["10"].days["15"].overall.totalAmount = new BSON.Double(1);
  assert.throws(() => verifyDocuments(records, [document]), /day overall summary/);
  const brokenIndex = clone(buildSupplierDocument(records));
  brokenIndex.entryPaths["000000000000000000000010"] = "wrong";
  assert.throws(() => verifyDocuments(records, [brokenIndex]), /entry path index/);
  const missingSummary = clone(buildSupplierDocument(records));
  delete missingSummary.overall;
  assert.throws(() => verifyDocuments(records, [missingSummary]), /supplier overall summary/);
  assert.throws(() => verifyDocuments(records, []), /counts differ/);
});

test("verification detects changed unknown fields and extra suppliers", () => {
  const records = fixtures();
  const changed = clone(buildSupplierDocument(records));
  changed.years["2026"].months["10"].days["15"].entries["000000000000000000000010"].extraField.retained = new BSON.Int32(9);
  assert.throws(() => verifyDocuments(records, [changed]), /full source and target/);
  const extra = clone(buildSupplierDocument(records));
  extra._id = new ObjectId("000000000000000000000099");
  extra.supplierId = extra._id;
  assert.throws(() => planMigration([buildSupplierDocument(records)], [extra]), /unexpected supplier/);
});

test("dry-run performs no writes and apply is rerunnable against stored BSON", async (t) => {
  t.mock.method(console, "log", () => {});
  const db = fakeDb(fixtures());
  await runMigration(db, parseArguments([]));
  assert.equal(db.state.indexWrites, 0);
  assert.equal(db.state.inserts, 0);
  await runMigration(db, parseArguments(["--apply", "--writes-paused"]));
  assert.equal(db.state.inserts, 1);
  await runMigration(db, parseArguments(["--apply", "--writes-paused"]));
  assert.equal(db.state.inserts, 1);
  const indexWrites = db.state.indexWrites;
  await runMigration(db, parseArguments(["--verify"]));
  assert.equal(db.state.indexWrites, indexWrites);
  assert.equal(db.state.inserts, 1);
});

test("source content changes block apply before any index or document writes", async (t) => {
  t.mock.method(console, "log", () => {});
  const db = fakeDb(fixtures(), [], 2);
  await assert.rejects(runMigration(db, parseArguments(["--apply", "--writes-paused"])), /Source changed/);
  assert.equal(db.state.indexWrites, 0);
  assert.equal(db.state.inserts, 0);
});

test("post-apply source changes fail the run instead of reporting verified cutover", async (t) => {
  t.mock.method(console, "log", () => {});
  const db = fakeDb(fixtures(), [], 3);
  await assert.rejects(runMigration(db, parseArguments(["--apply", "--writes-paused"])), /Source changed/);
  assert.equal(db.state.inserts, 1);
  assert.equal(db.state.documents.length, 1);
});

test("migration entry point cannot write with an unknown mode or missing pause confirmation", async () => {
  const db = fakeDb(fixtures());
  await assert.rejects(runMigration(db, { mode: "invalid", writesPaused: true }), /valid migration mode/);
  await assert.rejects(runMigration(db, { mode: "apply", writesPaused: false }), /writes are paused/);
  assert.equal(db.state.sourceReads, 0);
  assert.equal(db.state.indexWrites, 0);
  assert.equal(db.state.inserts, 0);
});

test("differing target records block apply without overwriting or creating indexes", async (t) => {
  t.mock.method(console, "log", () => {});
  const expected = buildSupplierDocument(fixtures());
  expected.overall.totalAmount += 1;
  const db = fakeDb(fixtures(), [expected]);
  await assert.rejects(runMigration(db, parseArguments(["--apply", "--writes-paused"])), /differs/);
  assert.equal(db.state.indexWrites, 0);
  assert.equal(db.state.inserts, 0);
});
