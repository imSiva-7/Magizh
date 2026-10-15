import { BSON, ObjectId } from "mongodb";
import { getFlatProcurementStore } from "./flat-procurements.mjs";

export const NESTED_COLLECTION = "supplier_procurements";
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const round = (value, digits) => Number(value.toFixed(digits));
const zero = () => ({ count: 0, milkQuantity: 0, totalAmount: 0 });
const emptySummaries = () => ({ overall: zero(), paid: zero(), unpaid: zero() });

export function validateEntry(entry) {
  if (!entry?._id?.toHexString || !entry?.supplierId?.toHexString) throw new Error("Procurement IDs must be ObjectIds");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date || "")) throw new Error("Invalid procurement date");
  const date = new Date(`${entry.date}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== entry.date) throw new Error("Invalid procurement calendar date");
  for (const field of ["milkQuantity", "totalAmount"]) {
    if (entry[field] === null || entry[field] === undefined || String(entry[field]).trim() === "" || !Number.isFinite(Number(entry[field]))) throw new Error(`Invalid procurement ${field}`);
  }
}

export function summarizeEntries(records) {
  // Sum once, then round. Paid/unpaid are computed independently to avoid drift
  // after payment status changes or deleting an old entry.
  const result = emptySummaries();
  for (const record of records) {
    validateEntry(record);
    for (const bucket of [result.overall, record.paymentStatus === "Paid" ? result.paid : result.unpaid]) {
      bucket.count++;
      bucket.milkQuantity += Number(record.milkQuantity);
      bucket.totalAmount += Number(record.totalAmount);
    }
  }
  for (const bucket of Object.values(result)) {
    bucket.milkQuantity = round(bucket.milkQuantity, 4);
    bucket.totalAmount = round(bucket.totalAmount, 2);
  }
  return result;
}

export function flattenSupplierDocument(document) {
  const records = [];
  for (const year of Object.values(document?.years || {})) {
    for (const month of Object.values(year.months || {})) {
      for (const day of Object.values(month.days || {})) records.push(...Object.values(day.entries || {}));
    }
  }
  return records;
}

export function buildSupplierDocument(records) {
  if (!records.length) throw new Error("Cannot build an empty supplier document");
  const supplierId = records[0].supplierId;
  const document = { _id: supplierId, supplierId, schemaVersion: 1, revision: 0, years: {}, ...emptySummaries(), entryIds: [], entryPaths: {} };
  const seen = new Set();
  for (const record of records) {
    validateEntry(record);
    if (String(record.supplierId) !== String(supplierId)) throw new Error("Cannot mix suppliers in one document");
    const id = record._id.toHexString();
    if (seen.has(id)) throw new Error("Duplicate procurement ID");
    seen.add(id);
    const [year, month, day] = record.date.split("-");
    const yearBucket = document.years[year] ||= { months: {}, ...emptySummaries() };
    const monthBucket = yearBucket.months[month] ||= { days: {}, ...emptySummaries() };
    const dayBucket = monthBucket.days[day] ||= { entries: {}, ...emptySummaries() };
    dayBucket.entries[id] = record;
    document.entryIds.push(record._id);
    document.entryPaths[id] = `years.${year}.months.${month}.days.${day}.entries.${id}`;
  }
  for (const year of Object.values(document.years)) {
    const yearRecords = [];
    for (const month of Object.values(year.months)) {
      const monthRecords = [];
      for (const day of Object.values(month.days)) {
        const entries = Object.values(day.entries);
        Object.assign(day, summarizeEntries(entries));
        monthRecords.push(...entries);
      }
      Object.assign(month, summarizeEntries(monthRecords));
      yearRecords.push(...monthRecords);
    }
    Object.assign(year, summarizeEntries(yearRecords));
  }
  Object.assign(document, summarizeEntries(records));
  document.entryIds.sort((a, b) => String(a).localeCompare(String(b)));
  const dates = records.flatMap((entry) => [entry.createdAt, entry.updatedAt]).filter((date) => date instanceof Date && Number.isFinite(date.getTime())).sort((a, b) => a - b);
  document.createdAt = dates[0] || new Date(0);
  document.updatedAt = dates.at(-1) || new Date(0);
  if (BSON.calculateObjectSize(document) > MAX_DOCUMENT_BYTES) throw new Error("Supplier procurement document exceeds the 15 MiB safety limit; use yearly buckets before migrating");
  return document;
}

export function flattenPipeline(query = {}) {
  const pipeline = [];
  if (query.supplierId && typeof query.supplierId.toHexString === "function") pipeline.push({ $match: { supplierId: query.supplierId } });
  if (query._id?.toHexString) pipeline.push({ $match: { entryIds: query._id } });
  else if (Array.isArray(query._id?.$in)) pipeline.push({ $match: { entryIds: { $in: query._id.$in } } });
  pipeline.push(
    { $project: { years: { $objectToArray: "$years" } } },
    { $unwind: "$years" },
    { $project: { months: { $objectToArray: "$years.v.months" } } },
    { $unwind: "$months" },
    { $project: { days: { $objectToArray: "$months.v.days" } } },
    { $unwind: "$days" },
    { $project: { entries: { $objectToArray: "$days.v.entries" } } },
    { $unwind: "$entries" },
    { $replaceRoot: { newRoot: "$entries.v" } },
    { $match: query },
  );
  return pipeline;
}

function nestedCursor(collection, query, projection) {
  const pipeline = flattenPipeline(query);
  if (projection) pipeline.push({ $project: projection });
  const cursor = {
    sort(value) { pipeline.push({ $sort: value }); return cursor; },
    limit(value) { pipeline.push({ $limit: value }); return cursor; },
    toArray() { return collection.aggregate(pipeline).toArray(); },
  };
  return cursor;
}

async function mutateSupplier(collection, supplierId, transform) {
  for (let retry = 0; retry < 8; retry++) {
    const previous = await collection.findOne({ _id: supplierId });
    const result = transform(previous ? flattenSupplierDocument(previous) : []);
    if (!result.changed) return result;
    const next = result.records.length ? buildSupplierDocument(result.records) : {
      _id: supplierId, supplierId, schemaVersion: 1, revision: 0, years: {}, ...emptySummaries(), entryIds: [], entryPaths: {}, createdAt: previous?.createdAt || new Date(), updatedAt: new Date(),
    };
    next.createdAt = previous?.createdAt || next.createdAt;
    next.updatedAt = new Date();
    next.revision = (previous?.revision || 0) + 1;
    if (!previous) {
      try { await collection.insertOne(next); return result; }
      catch (error) { if (error.code === 11000) continue; throw error; }
    }
    const updated = await collection.replaceOne({ _id: supplierId, revision: previous.revision === undefined ? { $exists: false } : previous.revision }, next);
    if (updated.matchedCount === 1) return result;
  }
  throw new Error("Concurrent procurement update; please retry");
}

export function getProcurementStore(db) {
  if (process.env.PROCUREMENTS_STORAGE && !["legacy", "nested", "flat"].includes(process.env.PROCUREMENTS_STORAGE)) throw new Error("PROCUREMENTS_STORAGE must be legacy, nested or flat");
  if (process.env.PROCUREMENTS_STORAGE === "flat") return getFlatProcurementStore(db);
  if (process.env.PROCUREMENTS_STORAGE !== "nested") return db.collection("procurements");
  const collection = db.collection(NESTED_COLLECTION);
  const store = {
    find(query = {}, options = {}) { return nestedCursor(collection, query, options.projection); },
    async findOne(query, options = {}) { return (await store.find(query, options).limit(1).toArray())[0] || null; },
    aggregate(pipeline) { return collection.aggregate([...flattenPipeline(pipeline[0]?.$match || {}), ...pipeline]); },
    async countDocuments(query) { return (await collection.aggregate([...flattenPipeline(query), { $count: "count" }]).toArray())[0]?.count || 0; },
    async insertOne(input) {
      const entry = { ...input, _id: input._id || new ObjectId() };
      validateEntry(entry);
      await mutateSupplier(collection, entry.supplierId, (records) => {
        if (records.some((record) => String(record._id) === String(entry._id))) { const error = new Error("Duplicate procurement ID"); error.code = 11000; throw error; }
        const duplicate = records.find((record) => record.date === entry.date && record.time === entry.time && ["milkQuantity", "fatPercentage", "snfPercentage"].every((field) => Number(record[field]) === Number(entry[field])));
        if (duplicate) {
          const error = new Error("Duplicate procurement");
          error.code = "PROCUREMENT_DUPLICATE";
          error.duplicateId = duplicate._id;
          throw error;
        }
        return { changed: true, records: [...records, entry] };
      });
      return { acknowledged: true, insertedId: entry._id };
    },
    async updateOne(query, update) {
      const entry = await store.findOne(query);
      if (!entry) return { matchedCount: 0, modifiedCount: 0 };
      const result = await mutateSupplier(collection, entry.supplierId, (records) => {
        const index = records.findIndex((record) => String(record._id) === String(entry._id));
        if (index < 0) return { changed: false, records, matchedCount: 0 };
        const next = { ...records[index], ...update.$set };
        if (String(next.supplierId) !== String(entry.supplierId) || String(next._id) !== String(entry._id)) throw new Error("Procurement identity cannot change");
        validateEntry(next);
        const changed = !BSON.serialize(records[index]).equals(BSON.serialize(next));
        records[index] = next;
        return { changed, records, matchedCount: 1 };
      });
      return { matchedCount: result.matchedCount, modifiedCount: Number(result.changed) };
    },
    async updateMany(query, update) {
      const entries = await store.find(query).toArray();
      const bySupplier = new Map();
      for (const entry of entries) {
        const key = String(entry.supplierId);
        if (!bySupplier.has(key)) bySupplier.set(key, { supplierId: entry.supplierId, ids: new Set() });
        bySupplier.get(key).ids.add(String(entry._id));
      }
      let matchedCount = 0;
      let modifiedCount = 0;
      for (const group of bySupplier.values()) {
        const result = await mutateSupplier(collection, group.supplierId, (records) => {
          let matched = 0;
          let modified = 0;
          const next = records.map((record) => {
            if (!group.ids.has(String(record._id))) return record;
            matched++;
            const updated = { ...record, ...update.$set };
            if (String(updated.supplierId) !== String(record.supplierId) || String(updated._id) !== String(record._id)) throw new Error("Procurement identity cannot change");
            validateEntry(updated);
            if (!BSON.serialize(updated).equals(BSON.serialize(record))) modified++;
            return updated;
          });
          return { records: next, changed: modified > 0, matched, modified };
        });
        matchedCount += result.matched;
        modifiedCount += result.modified;
      }
      return { matchedCount, modifiedCount };
    },
    async deleteOne(query) {
      const entry = await store.findOne(query);
      if (!entry) return { deletedCount: 0 };
      const result = await mutateSupplier(collection, entry.supplierId, (records) => {
        const remaining = records.filter((record) => String(record._id) !== String(entry._id));
        return { changed: remaining.length !== records.length, records: remaining };
      });
      return { deletedCount: Number(result.changed) };
    },
  };
  return store;
}

export function procurementWritePaused() { return process.env.PROCUREMENTS_WRITES_PAUSED === "true"; }
