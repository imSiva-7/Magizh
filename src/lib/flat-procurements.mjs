import { BSON, Decimal128, ObjectId } from "mongodb";
import { withProcurementTransaction } from "./procurement-transaction.mjs";

export const ENTRY_COLLECTION = "procurements";
export const SUMMARY_COLLECTION = "supplier_summaries";
export const SUMMARY_VERSION = 1;
const fields = ["count", "milkUnits", "amountCents", "fatMilkUnits", "snfMilkUnits"];
const buckets = ["overall", "paid", "unpaid"];
const zero = () => Object.fromEntries(fields.map((field) => [field, 0n]));
export const emptyMetrics = () => Object.fromEntries(buckets.map((bucket) => [bucket, zero()]));
const decimal = (value) => Decimal128.fromString(String(value));

// Integer fixed-point counters avoid cumulative floating-point drift. Decimal128
// holds those integers without JavaScript's safe-integer size restriction.
export function scaledInteger(value, places) {
  if (value === null || value === undefined || String(value).trim() === "" || !Number.isFinite(Number(value))) throw new Error("Invalid summary number");
  const text = Number(value).toFixed(places);
  return BigInt(text.replace(".", ""));
}
export function entryMetrics(entry) {
  if (!entry?._id?.toHexString || !entry?.supplierId?.toHexString) throw new Error("Procurement IDs must be ObjectIds");
  const result = emptyMetrics();
  const milkUnits = scaledInteger(entry.milkQuantity, 4), amountCents = scaledInteger(entry.totalAmount, 2);
  const fat = entry.fatPercentage == null ? 0n : scaledInteger(entry.fatPercentage, 4);
  const snf = entry.snfPercentage == null ? 0n : scaledInteger(entry.snfPercentage, 4);
  const contribution = { count: 1n, milkUnits, amountCents, fatMilkUnits: milkUnits * fat, snfMilkUnits: milkUnits * snf };
  for (const bucket of ["overall", entry.paymentStatus === "Paid" ? "paid" : "unpaid"]) result[bucket] = { ...contribution };
  return result;
}
export function combineMetrics(target, metrics, sign = 1n) {
  for (const bucket of buckets) for (const field of fields) target[bucket][field] += metrics[bucket][field] * sign;
  return target;
}
function roundedRatio(numerator, denominator, digits) {
  if (!denominator) return 0;
  const scale = 10n ** BigInt(digits);
  const quotient = numerator * scale / denominator, remainder = numerator * scale % denominator;
  const rounded = remainder * 2n > denominator || (remainder * 2n === denominator && quotient % 2n !== 0n) ? quotient + 1n : quotient;
  return Number(rounded) / Number(scale);
}
function publicBucket(metrics) {
  return { count: Number(metrics.count), milkQuantity: Number(metrics.milkUnits) / 10000, totalAmount: Number(metrics.amountCents) / 100, avgFat: roundedRatio(metrics.fatMilkUnits, metrics.milkUnits * 10000n, 4), avgSnf: roundedRatio(metrics.snfMilkUnits, metrics.milkUnits * 10000n, 4), avgRate: roundedRatio(metrics.amountCents * 100n, metrics.milkUnits, 4) };
}
export function buildFlatSummary(supplierId, entries, previous = {}) {
  const metrics = emptyMetrics(), dates = new Set();
  for (const entry of entries) {
    if (String(entry.supplierId) !== String(supplierId)) throw new Error("Cannot mix suppliers in a summary");
    combineMetrics(metrics, entryMetrics(entry)); dates.add(entry.date);
  }
  return { _id: supplierId, supplierId, schemaVersion: SUMMARY_VERSION, revision: Number(previous.revision || 0) + 1, activeDays: dates.size,
    _metrics: Object.fromEntries(buckets.map((bucket) => [bucket, Object.fromEntries(fields.map((field) => [field, decimal(metrics[bucket][field])]))])),
    ...Object.fromEntries(buckets.map((bucket) => [bucket, publicBucket(metrics[bucket])])),
    avgMilkPerDay: roundedRatio(metrics.overall.milkUnits, BigInt(dates.size) * 10000n, 4),
    createdAt: previous.createdAt || new Date(), updatedAt: new Date(),
  };
}
export function summaryUpdatePipeline(supplierId, delta, activeDayDelta = 0) {
  const changes = { supplierId: { $literal: supplierId }, schemaVersion: SUMMARY_VERSION, revision: { $add: [{ $ifNull: ["$revision", 0] }, 1] }, activeDays: { $add: [{ $ifNull: ["$activeDays", 0] }, activeDayDelta] }, createdAt: { $ifNull: ["$createdAt", "$$NOW"] }, updatedAt: "$$NOW" };
  for (const bucket of buckets) for (const field of fields) changes[`_metrics.${bucket}.${field}`] = { $add: [{ $ifNull: [`$_metrics.${bucket}.${field}`, { $literal: decimal(0) }] }, { $literal: decimal(delta[bucket][field]) }] };
  const divide = (a, b, places = 4) => ({ $convert: { input: { $cond: [{ $gt: [b, 0] }, { $round: [{ $divide: [a, b] }, places] }, 0] }, to: "double" } });
  const views = {};
  for (const bucket of buckets) {
    const metric = (field) => `$_metrics.${bucket}.${field}`;
    views[bucket] = {
      count: { $convert: { input: metric("count"), to: "int" } },
      milkQuantity: divide(metric("milkUnits"), 10000), totalAmount: divide(metric("amountCents"), 100, 2),
      avgFat: divide(metric("fatMilkUnits"), { $multiply: [metric("milkUnits"), 10000] }),
      avgSnf: divide(metric("snfMilkUnits"), { $multiply: [metric("milkUnits"), 10000] }),
      avgRate: divide({ $multiply: [metric("amountCents"), 100] }, metric("milkUnits")),
    };
  }
  views.avgMilkPerDay = divide("$_metrics.overall.milkUnits", { $multiply: ["$activeDays", 10000] });
  return [{ $set: changes }, { $set: views }];
}

export function getFlatProcurementStore(db) {
  const collection = db.collection(ENTRY_COLLECTION);
  const write = (name, args, action) => db.transactionSession ? action() : withProcurementTransaction(db, (tx) => getFlatProcurementStore(tx)[name](...args));
  const apply = async (supplierId, delta, days) => {
    // Migration must initialize every existing supplier; never silently add a
    // delta to a missing or incompatible summary and present incomplete totals.
    const summaries = db.collection(SUMMARY_COLLECTION);
    const result = await summaries.updateOne({ _id: supplierId, schemaVersion: SUMMARY_VERSION }, summaryUpdatePipeline(supplierId, delta, days));
    if (result.matchedCount !== 1) {
      const count = await collection.countDocuments({ supplierId });
      if (count > 1 || await summaries.findOne({ _id: supplierId })) throw new Error("Supplier summary is missing or incompatible; rebuild summaries before writing");
      const current = await collection.find({ supplierId }).toArray();
      await summaries.insertOne(buildFlatSummary(supplierId, current));
    }
  };
  const identity = (before, after) => {
    if (String(before._id) !== String(after._id) || String(before.supplierId) !== String(after.supplierId)) throw new Error("Procurement identity cannot change");
    entryMetrics(after);
  };
  return {
    find: (...args) => collection.find(...args), findOne: (...args) => collection.findOne(...args), aggregate: (...args) => collection.aggregate(...args), countDocuments: (...args) => collection.countDocuments(...args),
    insertOne(input) { return write("insertOne", [input], async () => {
      const entry = { ...input, _id: input._id || new ObjectId() }; const delta = entryMetrics(entry);
      const duplicate = await collection.findOne({ supplierId: entry.supplierId, date: entry.date, time: entry.time, milkQuantity: Number(entry.milkQuantity), fatPercentage: Number(entry.fatPercentage), snfPercentage: Number(entry.snfPercentage) });
      if (duplicate) throw Object.assign(new Error("Duplicate procurement"), { code: "PROCUREMENT_DUPLICATE", duplicateId: duplicate._id });
      const existingDay = await collection.findOne({ supplierId: entry.supplierId, date: entry.date }, { projection: { _id: 1 } });
      const result = await collection.insertOne(entry);
      await apply(entry.supplierId, delta, existingDay ? 0 : 1); return result;
    }); },
    updateOne(query, update) { return write("updateOne", [query, update], async () => {
      if (Object.keys(update).some((key) => key !== "$set")) throw new Error("Only explicit procurement field updates are supported");
      const before = await collection.findOne(query); if (!before) return { matchedCount: 0, modifiedCount: 0 };
      const after = { ...before, ...update.$set }; identity(before, after);
      if (BSON.serialize(before).equals(BSON.serialize(after))) return { matchedCount: 1, modifiedCount: 0 };
      const destinationExists = before.date !== after.date && await collection.findOne({ supplierId: before.supplierId, date: after.date }, { projection: { _id: 1 } });
      const result = await collection.updateOne({ _id: before._id }, update);
      let dayDelta = 0;
      if (before.date !== after.date) {
        if (!destinationExists) dayDelta++;
        if (!await collection.findOne({ supplierId: before.supplierId, date: before.date }, { projection: { _id: 1 } })) dayDelta--;
      }
      const delta = combineMetrics(entryMetrics(after), entryMetrics(before), -1n);
      await apply(before.supplierId, delta, dayDelta); return result;
    }); },
    updateMany(query, update) { return write("updateMany", [query, update], async () => {
      const allowed = new Set(["paymentStatus", "paymentUpdatedOn", "paymentRecordDoneBy", "updatedAt"]);
      if (Object.keys(update).some((key) => key !== "$set") || Object.keys(update.$set || {}).some((key) => !allowed.has(key))) throw new Error("Bulk updates support payment fields only");
      const entries = await collection.find(query).toArray(), groups = new Map();
      for (const before of entries) {
        const after = { ...before, ...update.$set }; identity(before, after);
        const key = String(before.supplierId);
        if (!groups.has(key)) groups.set(key, { supplierId: before.supplierId, delta: emptyMetrics() });
        combineMetrics(groups.get(key).delta, entryMetrics(after)); combineMetrics(groups.get(key).delta, entryMetrics(before), -1n);
      }
      const result = await collection.updateMany(query, update);
      for (const group of groups.values()) await apply(group.supplierId, group.delta, 0);
      return result;
    }); },
    deleteOne(query) { return write("deleteOne", [query], async () => {
      const before = await collection.findOne(query); if (!before) return { deletedCount: 0 };
      const result = await collection.deleteOne({ _id: before._id });
      const remains = await collection.findOne({ supplierId: before.supplierId, date: before.date }, { projection: { _id: 1 } });
      await apply(before.supplierId, combineMetrics(emptyMetrics(), entryMetrics(before), -1n), remains ? 0 : -1); return result;
    }); },
  };
}

export async function getAllTimeProcurementTotals(db) {
  const asNumber = (field, scale, places) => ({ $convert: { input: { $round: [{ $divide: [field, scale] }, places] }, to: "double" } });
  const [totals] = await db.collection(SUMMARY_COLLECTION).aggregate([
    { $group: { _id: null, milkUnits: { $sum: "$_metrics.overall.milkUnits" }, amountCents: { $sum: "$_metrics.overall.amountCents" }, totalRecords: { $sum: "$overall.count" }, paidCents: { $sum: "$_metrics.paid.amountCents" }, dueCents: { $sum: "$_metrics.unpaid.amountCents" } } },
    { $project: { _id: 0, totalMilk: asNumber("$milkUnits", 10000, 4), totalAmount: asNumber("$amountCents", 100, 2), totalRecords: 1, paidAmount: asNumber("$paidCents", 100, 2), dueAmount: asNumber("$dueCents", 100, 2) } },
  ]).toArray();
  return totals || { totalMilk: 0, totalAmount: 0, totalRecords: 0, paidAmount: 0, dueAmount: 0 };
}
