import assert from "node:assert/strict";
import test from "node:test";
import { BSON, ObjectId } from "mongodb";
import {
  buildSupplierDocument,
  flattenSupplierDocument,
  getProcurementStore,
  MAX_DOCUMENT_BYTES,
  NESTED_COLLECTION,
  procurementWritePaused,
  summarizeEntries,
  validateEntry,
} from "./supplier-procurements.mjs";

const copy = (value) => BSON.deserialize(BSON.serialize(value));
const oid = () => new ObjectId();
const summary = (count, milkQuantity, totalAmount) => ({ count, milkQuantity, totalAmount });
const empty = () => summary(0, 0, 0);
function entry(supplierId, values = {}) {
  return {
    _id: oid(), supplierId, date: "2026-10-15", time: "AM",
    milkQuantity: 10, totalAmount: 400, paymentStatus: "Not Paid",
    createdAt: new Date("2026-10-15T04:00:00Z"),
    updatedAt: new Date("2026-10-15T04:30:00Z"),
    ...values,
  };
}

function equal(a, b) {
  if (a instanceof ObjectId || b instanceof ObjectId) return String(a) === String(b);
  if (a instanceof Date || b instanceof Date) return Number(a) === Number(b);
  return a === b;
}
function at(value, path) { return path.split(".").reduce((part, key) => part?.[key], value); }
function matches(value, query) {
  return Object.entries(query).every(([key, condition]) => {
    if (key === "$and") return condition.every((part) => matches(value, part));
    if (key === "$or") return condition.some((part) => matches(value, part));
    const actual = at(value, key);
    const one = (expected) => Array.isArray(actual) ? actual.some((part) => equal(part, expected)) : equal(actual, expected);
    if (condition && typeof condition === "object" && !(condition instanceof ObjectId) && !(condition instanceof Date)) {
      return Object.entries(condition).every(([operator, expected]) => {
        if (operator === "$in") return expected.some(one);
        if (operator === "$exists") return (actual !== undefined) === expected;
        if (operator === "$gte") return actual >= expected;
        if (operator === "$lte") return actual <= expected;
        if (operator === "$ne") return !one(expected);
        throw new Error(`Unsupported mock match operator: ${operator}`);
      });
    }
    return one(condition);
  });
}
function project(value, fields) {
  if (Object.values(fields).some((flag) => flag === 1)) {
    const projected = {};
    if (fields._id !== 0 && value._id !== undefined) projected._id = value._id;
    for (const [key, flag] of Object.entries(fields)) if (flag === 1 && value[key] !== undefined) projected[key] = value[key];
    return projected;
  }
  const projected = { ...value };
  for (const [key, flag] of Object.entries(fields)) if (flag === 0) delete projected[key];
  return projected;
}

// This mock models persisted BSON snapshots and revision-checked replacement.
// Await boundaries deliberately let simultaneous writes read the same revision.
class MemoryCollection {
  constructor(documents = []) {
    this.documents = new Map(documents.map((document) => [String(document._id), copy(document)]));
    this.replacementConflicts = 0;
    this.insertionConflicts = 0;
    this.rejectReplacements = false;
  }
  async findOne(query) {
    const found = [...this.documents.values()].find((document) => matches(document, query));
    return found ? copy(found) : null;
  }
  async insertOne(document) {
    const key = String(document._id);
    if (this.documents.has(key)) {
      this.insertionConflicts++;
      const error = new Error("Duplicate key"); error.code = 11000; throw error;
    }
    this.documents.set(key, copy(document));
    return { acknowledged: true, insertedId: document._id };
  }
  async replaceOne(query, document) {
    const current = this.documents.get(String(query._id));
    if (this.rejectReplacements || !current || !matches(current, query)) {
      this.replacementConflicts++;
      return { matchedCount: 0, modifiedCount: 0 };
    }
    this.documents.set(String(document._id), copy(document));
    return { matchedCount: 1, modifiedCount: 1 };
  }
  aggregate(pipeline) {
    return { toArray: async () => {
      let rows = [...this.documents.values()].map(copy);
      let flattened = false;
      for (const stage of pipeline) {
        if (stage.$replaceRoot) {
          rows = rows.flatMap(flattenSupplierDocument);
          flattened = true;
        } else if (stage.$match) rows = rows.filter((row) => matches(row, stage.$match));
        else if (stage.$project && flattened) rows = rows.map((row) => project(row, stage.$project));
        else if (stage.$sort) rows.sort((a, b) => {
          for (const [key, direction] of Object.entries(stage.$sort)) {
            if (!equal(at(a, key), at(b, key))) return (at(a, key) > at(b, key) ? 1 : -1) * direction;
          }
          return 0;
        });
        else if (stage.$limit !== undefined) rows = rows.slice(0, stage.$limit);
        else if (stage.$count) rows = rows.length ? [{ [stage.$count]: rows.length }] : [];
        else if (stage.$group) {
          const groups = new Map();
          for (const row of rows) {
            const key = typeof stage.$group._id === "string" ? at(row, stage.$group._id.slice(1)) : stage.$group._id;
            const group = groups.get(String(key)) || { _id: key };
            for (const [field, expression] of Object.entries(stage.$group)) {
              if (field === "_id") continue;
              assert.ok("$sum" in expression, "Mock only supports summation groups");
              const amount = typeof expression.$sum === "string" ? at(row, expression.$sum.slice(1)) : expression.$sum;
              group[field] = (group[field] || 0) + Number(amount);
            }
            groups.set(String(key), group);
          }
          rows = [...groups.values()];
        } else if (!stage.$project && !stage.$unwind) throw new Error(`Unsupported mock stage ${Object.keys(stage)[0]}`);
      }
      return rows.map(copy);
    } };
  }
}

function nestedStore(t, records = []) {
  const previous = process.env.PROCUREMENTS_STORAGE;
  process.env.PROCUREMENTS_STORAGE = "nested";
  t.after(() => { if (previous === undefined) delete process.env.PROCUREMENTS_STORAGE; else process.env.PROCUREMENTS_STORAGE = previous; });
  const groups = new Map();
  for (const record of records) {
    const key = String(record.supplierId);
    groups.set(key, [...(groups.get(key) || []), record]);
  }
  const collection = new MemoryCollection([...groups.values()].map(buildSupplierDocument));
  const store = getProcurementStore({ collection(name) { assert.equal(name, NESTED_COLLECTION); return collection; } });
  return { store, collection, document: async (supplierId) => collection.findOne({ _id: supplierId }) };
}

function assertSummary(bucket, overall, paid, unpaid) {
  assert.deepEqual(bucket.overall, overall);
  assert.deepEqual(bucket.paid, paid);
  assert.deepEqual(bucket.unpaid, unpaid);
}

test("migration builds supplier/year/month/day buckets without losing same-session entries or BSON fields", () => {
  const supplierId = oid();
  const records = [
    entry(supplierId, { date: "2024-12-31", milkQuantity: 10.125, totalAmount: 450.75, paymentStatus: "Paid", createdAt: new Date("2024-12-31T04:00:00Z"), externalId: oid(), notes: { source: "original", importedAt: new Date("2024-12-31T05:00:00Z") } }),
    entry(supplierId, { date: "2024-12-31", milkQuantity: 2.375, totalAmount: 111.25 }),
    entry(supplierId, { date: "2025-01-01", milkQuantity: 5, totalAmount: 210, paymentStatus: "paid" }),
    entry(supplierId, { date: "2025-01-02", milkQuantity: 1.5, totalAmount: 60, paymentStatus: undefined }),
  ];
  delete records[3].paymentStatus;
  const document = copy(buildSupplierDocument(records));
  assert.ok(document._id.equals(supplierId));
  assert.ok(document.supplierId.equals(supplierId));
  assert.equal(document.schemaVersion, 1);
  assert.deepEqual(flattenSupplierDocument(document), records);
  assert.deepEqual(document.entryIds.map(String).sort(), records.map((record) => String(record._id)).sort());
  for (const record of records) assert.deepEqual(at(document, document.entryPaths[String(record._id)]), record);
  assert.equal(Object.keys(document.years["2024"].months["12"].days["31"].entries).length, 2);
  assertSummary(document, summary(4, 19, 832), summary(1, 10.125, 450.75), summary(3, 8.875, 381.25));
  for (const bucket of [document.years["2024"], document.years["2024"].months["12"], document.years["2024"].months["12"].days["31"]]) {
    assertSummary(bucket, summary(2, 12.5, 562), summary(1, 10.125, 450.75), summary(1, 2.375, 111.25));
  }
  for (const bucket of [document.years["2025"], document.years["2025"].months["01"]]) assertSummary(bucket, summary(2, 6.5, 270), empty(), summary(2, 6.5, 270));
  assertSummary(document.years["2025"].months["01"].days["01"], summary(1, 5, 210), empty(), summary(1, 5, 210));
  assertSummary(document.years["2025"].months["01"].days["02"], summary(1, 1.5, 60), empty(), summary(1, 1.5, 60));
  assert.deepEqual(document.createdAt, records[0].createdAt);
  assert.deepEqual(document.updatedAt, records[0].updatedAt);
});

test("summaries use only exact Paid status and add numeric legacy strings before rounding", () => {
  const supplierId = oid();
  const records = [
    entry(supplierId, { milkQuantity: "0.10001", totalAmount: "0.10", paymentStatus: "Paid" }),
    entry(supplierId, { milkQuantity: "0.20001", totalAmount: "0.20", paymentStatus: "paid" }),
    entry(supplierId, { milkQuantity: "0.00002", totalAmount: "0.01", paymentStatus: null }),
  ];
  assert.deepEqual(summarizeEntries(records), {
    overall: summary(3, 0.3, 0.31), paid: summary(1, 0.1, 0.1), unpaid: summary(2, 0.2, 0.21),
  });
});

test("validation rejects invalid IDs, impossible calendar dates, and nonnumeric or missing financial values", () => {
  const supplierId = oid();
  for (const change of [
    { _id: String(oid()) }, { supplierId: String(supplierId) }, { _id: null },
    ...["2025-02-29", "2024-02-30", "2026-13-01", "2026-00-01", "2026-10-00", "2026-1-1", "2026-10-15T00:00:00Z", ""].map((date) => ({ date })),
    ...[null, undefined, "", "   ", "NaN", "Infinity", "not an amount", NaN, Infinity].flatMap((value) => [{ milkQuantity: value }, { totalAmount: value }]),
  ]) assert.throws(() => validateEntry(entry(supplierId, change)), undefined, `Accepted invalid entry: ${JSON.stringify(change)}`);
  assert.doesNotThrow(() => validateEntry(entry(supplierId, { date: "2024-02-29", milkQuantity: "1.25", totalAmount: "42.50" })));
});

test("migration rejects duplicate IDs, mixed suppliers, empty input, and documents above Mongo safety limit", () => {
  const record = entry(oid());
  assert.throws(() => buildSupplierDocument([]), /empty/i);
  assert.throws(() => buildSupplierDocument([record, { ...record }]), /duplicate/i);
  assert.throws(() => buildSupplierDocument([record, entry(oid())]), /mix suppliers/i);
  assert.throws(() => buildSupplierDocument([{ ...record, notes: "x".repeat(MAX_DOCUMENT_BYTES) }]), /safety limit/i);
});

test("legacy storage remains the default and write pause requires explicit true", (t) => {
  const previousStorage = process.env.PROCUREMENTS_STORAGE;
  const previousPause = process.env.PROCUREMENTS_WRITES_PAUSED;
  t.after(() => {
    if (previousStorage === undefined) delete process.env.PROCUREMENTS_STORAGE; else process.env.PROCUREMENTS_STORAGE = previousStorage;
    if (previousPause === undefined) delete process.env.PROCUREMENTS_WRITES_PAUSED; else process.env.PROCUREMENTS_WRITES_PAUSED = previousPause;
  });
  const legacyCollection = {};
  const db = { collection(name) { assert.equal(name, "procurements"); return legacyCollection; } };
  delete process.env.PROCUREMENTS_STORAGE;
  assert.equal(getProcurementStore(db), legacyCollection);
  process.env.PROCUREMENTS_STORAGE = "legacy";
  assert.equal(getProcurementStore(db), legacyCollection);
  delete process.env.PROCUREMENTS_WRITES_PAUSED;
  assert.equal(procurementWritePaused(), false);
  process.env.PROCUREMENTS_WRITES_PAUSED = "false";
  assert.equal(procurementWritePaused(), false);
  process.env.PROCUREMENTS_WRITES_PAUSED = "true";
  assert.equal(procurementWritePaused(), true);
});

test("nested reads preserve legacy find, projection, sorting, pagination, count, and analytics grouping", async (t) => {
  const supplierId = oid();
  const records = [
    entry(supplierId, { date: "2026-10-01", totalAmount: 100 }),
    entry(supplierId, { date: "2026-10-02", totalAmount: 200, paymentStatus: "Paid" }),
    entry(supplierId, { date: "2026-10-03", totalAmount: 300, paymentStatus: "Paid" }),
    entry(oid(), { date: "2026-10-02", totalAmount: 900 }),
  ];
  const { store } = nestedStore(t, records);
  assert.deepEqual(await store.findOne({ _id: records[1]._id }), records[1]);
  assert.equal(await store.findOne({ _id: oid() }), null);
  const filtered = await store.find({ supplierId, date: { $gte: "2026-10-02", $lte: "2026-10-03" } }, { projection: { date: 1, totalAmount: 1 } }).sort({ date: -1 }).limit(1).toArray();
  assert.deepEqual(filtered, [{ _id: records[2]._id, date: "2026-10-03", totalAmount: 300 }]);
  assert.deepEqual(await store.find({ _id: { $in: [records[0]._id, records[3]._id] } }).toArray(), [records[0], records[3]]);
  assert.equal(await store.countDocuments({ supplierId, paymentStatus: "Paid" }), 2);
  assert.equal(await store.countDocuments({ supplierId: oid() }), 0);
  const analytics = await store.aggregate([{ $match: { supplierId } }, { $group: { _id: "$paymentStatus", count: { $sum: 1 }, totalAmount: { $sum: "$totalAmount" }, milkQuantity: { $sum: "$milkQuantity" } } }, { $sort: { _id: 1 } }]).toArray();
  assert.deepEqual(analytics, [{ _id: "Not Paid", count: 1, totalAmount: 100, milkQuantity: 10 }, { _id: "Paid", count: 2, totalAmount: 500, milkQuantity: 20 }]);
});

test("concurrent first uploads retain both entries and prevent duplicate insertion", async (t) => {
  const supplierId = oid();
  const records = [entry(supplierId, { milkQuantity: 2.5, totalAmount: 100 }), entry(supplierId, { milkQuantity: 3.5, totalAmount: 150, paymentStatus: "Paid" })];
  const { store, collection, document } = nestedStore(t);
  const results = await Promise.all(records.map((record) => store.insertOne(record)));
  assert.deepEqual(results.map((result) => result.insertedId), records.map((record) => record._id));
  assert.ok(collection.insertionConflicts > 0, "The test must exercise a simultaneous first-document insertion");
  assert.equal(collection.documents.size, 1);
  assertSummary(await document(supplierId), summary(2, 6, 250), summary(1, 3.5, 150), summary(1, 2.5, 100));
  await assert.rejects(store.insertOne(records[0]), { code: 11000 });
  assert.equal((await document(supplierId)).overall.count, 2);
});

test("simultaneous duplicate submissions with distinct IDs create only one procurement", async (t) => {
  const supplierId = oid();
  const original = entry(supplierId, { fatPercentage: 4.2, snfPercentage: 8.5 });
  const duplicate = { ...original, _id: oid() };
  const { store, document } = nestedStore(t);
  const results = await Promise.allSettled([store.insertOne(original), store.insertOne(duplicate)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "PROCUREMENT_DUPLICATE");
  assertSummary(await document(supplierId), summary(1, 10, 400), empty(), summary(1, 10, 400));
});

test("insert without an ID creates a stable ObjectId without dropping existing supplier entries", async (t) => {
  const supplierId = oid();
  const old = entry(supplierId);
  const { store, document } = nestedStore(t, [old]);
  const input = entry(supplierId, { date: "2026-11-01" }); delete input._id;
  const result = await store.insertOne(input);
  assert.ok(result.insertedId instanceof ObjectId);
  assert.deepEqual(await store.findOne({ _id: old._id }), old);
  assert.ok((await document(supplierId)).entryIds.some((id) => id.equals(result.insertedId)));
  assert.equal((await document(supplierId)).overall.totalAmount, 800);
});

test("concurrent edits retry revision conflicts without losing another entry's amount or payment change", async (t) => {
  const supplierId = oid();
  const records = [entry(supplierId, { totalAmount: 100 }), entry(supplierId, { totalAmount: 200 })];
  const { store, collection, document } = nestedStore(t, records);
  await Promise.all([
    store.updateOne({ _id: records[0]._id }, { $set: { totalAmount: 175, milkQuantity: 4.5 } }),
    store.updateOne({ _id: records[1]._id }, { $set: { paymentStatus: "Paid" } }),
  ]);
  assert.ok(collection.replacementConflicts > 0, "The test must exercise an optimistic-lock conflict");
  const updated = await document(supplierId);
  assertSummary(updated, summary(2, 14.5, 375), summary(1, 10, 200), summary(1, 4.5, 175));
  assert.equal((await store.findOne({ _id: records[0]._id })).totalAmount, 175);
  assert.equal((await store.findOne({ _id: records[1]._id })).paymentStatus, "Paid");
});

test("payment transitions and repeated bulk status requests keep totals stable across suppliers", async (t) => {
  const supplierId = oid(); const secondSupplierId = oid();
  const records = [entry(supplierId, { totalAmount: 100 }), entry(supplierId, { totalAmount: 200, paymentStatus: "Paid" }), entry(secondSupplierId, { totalAmount: 300 })];
  const { store, document } = nestedStore(t, records);
  const query = { _id: { $in: records.map((record) => record._id) } };
  assert.deepEqual(await store.updateMany(query, { $set: { paymentStatus: "Paid" } }), { matchedCount: 3, modifiedCount: 2 });
  assertSummary(await document(supplierId), summary(2, 20, 300), summary(2, 20, 300), empty());
  assertSummary(await document(secondSupplierId), summary(1, 10, 300), summary(1, 10, 300), empty());
  const revision = (await document(supplierId)).revision;
  assert.deepEqual(await store.updateMany(query, { $set: { paymentStatus: "Paid" } }), { matchedCount: 3, modifiedCount: 0 });
  assert.equal((await document(supplierId)).revision, revision);
  assert.deepEqual(await store.updateOne({ _id: records[1]._id }, { $set: { paymentStatus: "Not Paid" } }), { matchedCount: 1, modifiedCount: 1 });
  assertSummary(await document(supplierId), summary(2, 20, 300), summary(1, 10, 100), summary(1, 10, 200));
  assert.deepEqual(await store.updateOne({ _id: records[1]._id }, { $set: { paymentStatus: "Not Paid" } }), { matchedCount: 1, modifiedCount: 0 });
});

test("moving an entry across year/month/day preserves its ID and removes stale paths and summaries", async (t) => {
  const supplierId = oid();
  const moving = entry(supplierId, { date: "2025-12-31", totalAmount: 175, paymentStatus: "Paid" });
  const staying = entry(supplierId, { date: "2026-01-02", totalAmount: 225 });
  const { store, document } = nestedStore(t, [moving, staying]);
  const before = await document(supplierId);
  const oldPath = before.entryPaths[String(moving._id)];
  await store.updateOne({ _id: moving._id }, { $set: { date: "2027-02-03", time: "PM" } });
  const updated = await document(supplierId);
  assert.equal(updated.years["2025"], undefined);
  assert.equal(at(updated, oldPath), undefined);
  assert.equal(updated.entryPaths[String(moving._id)], `years.2027.months.02.days.03.entries.${moving._id}`);
  assert.deepEqual(updated.entryIds, before.entryIds);
  assert.deepEqual(await store.findOne({ _id: moving._id }), { ...moving, date: "2027-02-03", time: "PM" });
  assertSummary(updated, summary(2, 20, 400), summary(1, 10, 175), summary(1, 10, 225));
  for (const bucket of [updated.years["2027"], updated.years["2027"].months["02"], updated.years["2027"].months["02"].days["03"]]) assertSummary(bucket, summary(1, 10, 175), summary(1, 10, 175), empty());
});

test("deleting entries cleans ID/path indexes, empty days/months/years, and final supplier totals", async (t) => {
  const supplierId = oid();
  const records = [entry(supplierId, { date: "2025-12-31", totalAmount: 125, paymentStatus: "Paid" }), entry(supplierId, { date: "2026-01-01", totalAmount: 275 })];
  const { store, document } = nestedStore(t, records);
  assert.deepEqual(await store.deleteOne({ _id: records[0]._id }), { deletedCount: 1 });
  const remaining = await document(supplierId);
  assert.equal(remaining.years["2025"], undefined);
  assert.equal(remaining.entryPaths[String(records[0]._id)], undefined);
  assert.deepEqual(remaining.entryIds, [records[1]._id]);
  assertSummary(remaining, summary(1, 10, 275), empty(), summary(1, 10, 275));
  assert.deepEqual(await store.findOne({ _id: records[1]._id }), records[1]);
  assert.deepEqual(await store.deleteOne({ _id: records[0]._id }), { deletedCount: 0 });
  assert.deepEqual(await store.deleteOne({ _id: records[1]._id }), { deletedCount: 1 });
  const cleared = await document(supplierId);
  assert.deepEqual(cleared.years, {});
  assert.deepEqual(cleared.entryIds, []);
  assert.deepEqual(cleared.entryPaths, {});
  assertSummary(cleared, empty(), empty(), empty());
  assert.equal(await store.countDocuments({ supplierId }), 0);
});

test("invalid updates and identity changes leave persisted amounts and original IDs intact", async (t) => {
  const original = entry(oid());
  const { store, document } = nestedStore(t, [original]);
  const before = await document(original.supplierId);
  for (const change of [{ supplierId: oid() }, { _id: oid() }, { date: "2026-02-30" }, { milkQuantity: NaN }, { totalAmount: "invalid" }]) {
    await assert.rejects(store.updateOne({ _id: original._id }, { $set: change }));
    assert.deepEqual(await document(original.supplierId), before);
  }
  await assert.rejects(store.updateMany({ supplierId: original.supplierId }, { $set: { supplierId: oid() } }), /identity/i);
  assert.deepEqual(await document(original.supplierId), before);
  assert.deepEqual(await store.updateOne({ _id: oid() }, { $set: { totalAmount: 0 } }), { matchedCount: 0, modifiedCount: 0 });
});

test("exhausted concurrency retries report failure rather than acknowledging a lost update", async (t) => {
  const original = entry(oid());
  const { store, collection, document } = nestedStore(t, [original]);
  const before = await document(original.supplierId);
  collection.rejectReplacements = true;
  await assert.rejects(store.updateOne({ _id: original._id }, { $set: { paymentStatus: "Paid" } }), /concurrent.*retry/i);
  assert.deepEqual(await document(original.supplierId), before);
});
