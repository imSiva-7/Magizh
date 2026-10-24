import { ObjectId } from "mongodb";
import { buildSupplierDocument, flattenSupplierDocument, getProcurementStore } from "./supplier-procurements.mjs";

export const HEAD_ENTRIES = "head_supplier_entries";
const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;
const asId = (id) => id instanceof ObjectId ? id : new ObjectId(id);

export function flattenHeadEntries(document) {
  if (Number(document?.schemaVersion) === 2) return flattenSupplierDocument(document);
  const entries = [];
  for (const [date, shifts] of Object.entries(document?.entries || {})) {
    for (const [time, entry] of Object.entries(shifts || {})) {
      if (entry && ObjectId.isValid(entry.procurementId)) entries.push({ ...entry, date, time });
    }
  }
  return entries;
}

export function summarizeHeadEntries(entries) {
  const totals = { entries: entries.length, milk: 0, earned: 0, paid: 0, due: 0 };
  for (const entry of entries) {
    totals.milk += Number(entry.milkQuantity);
    totals.earned += Number(entry.totalAmount);
    if (entry.paymentStatus === "Paid") totals.paid += Number(entry.totalAmount);
  }
  totals.milk = r4(totals.milk);
  totals.earned = r2(totals.earned);
  totals.paid = r2(totals.paid);
  totals.due = r2(totals.earned - totals.paid);
  return totals;
}

export function buildHeadDocument(headId, entries, previous = {}) {
  const supplierId = asId(headId);
  const records = entries.map((entry) => ({ ...entry, _id: asId(entry.procurementId), procurementId: asId(entry.procurementId), supplierId }));
  const empty = { _id: supplierId, supplierId, years: {}, entryIds: [], entryPaths: {}, overall: { count: 0, milkQuantity: 0, totalAmount: 0 }, paid: { count: 0, milkQuantity: 0, totalAmount: 0 }, unpaid: { count: 0, milkQuantity: 0, totalAmount: 0 } };
  const document = { ...previous, ...(records.length ? buildSupplierDocument(records) : empty), schemaVersion: 2, revision: Number(previous.revision || 0) + 1, totals: summarizeHeadEntries(records), createdAt: previous.createdAt || new Date(), updatedAt: new Date() };
  // Keep unresolved historical references available for investigation/recovery.
  const references = { ...previous.legacyReferences, ...previous.byProcurement };
  for (const entry of records) delete references[String(entry.procurementId)];
  document.legacyReferences = references;
  delete document.entries;
  delete document.byProcurement;
  return document;
}

export function commissionFromProcurement(procurement, previous = null, { recover = false } = {}) {
  const cut = Number(procurement.cutPercentage);
  const parent = Number(procurement.parentTsr);
  if (procurement.customRate || !Number.isFinite(cut) || !Number.isFinite(parent) || cut <= 0 || cut >= parent) return null;
  const totalSolids = Number(procurement.fatPercentage) + Number(procurement.snfPercentage);
  const now = new Date();
  return {
    ...previous,
    procurementId: procurement._id,
    childSupplierId: procurement.supplierId,
    childSupplierName: procurement.supplierName || "",
    date: procurement.date, time: procurement.time,
    parentTsr: r4(parent), cutPercentage: r4(cut), childTsr: r4(parent - cut),
    milkQuantity: Number(procurement.milkQuantity), fatPercentage: Number(procurement.fatPercentage), snfPercentage: Number(procurement.snfPercentage),
    totalSolids: r4(totalSolids), ratePerLiter: r4(totalSolids * cut / 100), totalAmount: r2(totalSolids * cut / 100 * Number(procurement.milkQuantity)),
    paymentStatus: previous?.paymentStatus || (recover ? "Not Paid" : procurement.paymentStatus),
    paymentReviewRequired: previous?.paymentReviewRequired || recover,
    comment: procurement.comment || "", actionDoneBy: procurement.actionDoneBy || "",
    createdAt: previous?.createdAt || procurement.createdAt || now, updatedAt: now,
  };
}

async function hydratedEntries(db, document) {
  const entries = flattenHeadEntries(document);
  const seen = new Set(entries.map((entry) => String(entry.procurementId)));
  const ids = Object.keys({ ...document?.legacyReferences, ...document?.byProcurement }).filter((id) => !seen.has(id) && ObjectId.isValid(id));
  if (ids.length) {
    const procurements = await getProcurementStore(db).find({ _id: { $in: ids.map(asId) } }).toArray();
    for (const procurement of procurements) {
      await findHeadEntry(db, procurement); // Reject conflicting legacy ownership.
      const entry = commissionFromProcurement(procurement, null, { recover: true });
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

export async function findHeadEntry(db, procurement) {
  const key = String(procurement._id);
  const matches = await db.collection(HEAD_ENTRIES).find({ $or: [{ entryIds: procurement._id }, { [`byProcurement.${key}`]: { $exists: true } }, { [`legacyReferences.${key}`]: { $exists: true } }, ...(procurement.headSupplierId ? [{ _id: asId(procurement.headSupplierId) }] : [])] }).toArray();
  return resolveHeadEntry(procurement, matches);
}

function resolveHeadEntry(procurement, matches) {
  const key = String(procurement._id);
  if (matches.length > 1) throw Object.assign(new Error("Commission is linked to multiple heads; review the historical references before editing"), { status: 409 });
  const document = matches[0];
  const headId = document?._id || (procurement.headSupplierId ? asId(procurement.headSupplierId) : null);
  if (!headId) return null;
  const entry = flattenHeadEntries(document).find((record) => String(record.procurementId) === key) || commissionFromProcurement(procurement, null, { recover: true });
  return { headId, document, entry };
}

export async function findHeadEntries(db, procurements) {
  if (!procurements.length) return [];
  const conditions = [{ entryIds: { $in: procurements.map(record => record._id) } }];
  for (const record of procurements) {
    const key = String(record._id);
    conditions.push({ [`byProcurement.${key}`]: { $exists: true } }, { [`legacyReferences.${key}`]: { $exists: true } });
    if (record.headSupplierId) conditions.push({ _id: asId(record.headSupplierId) });
  }
  const documents = await db.collection(HEAD_ENTRIES).find({ $or: conditions }).toArray();
  return procurements.map(record => {
    const key = String(record._id);
    const matches = documents.filter(doc => doc.entryIds?.some(id => String(id) === key)
      || Object.hasOwn(doc.byProcurement || {}, key) || Object.hasOwn(doc.legacyReferences || {}, key)
      || (record.headSupplierId && String(doc._id) === String(record.headSupplierId)));
    return resolveHeadEntry(record, matches);
  });
}

export async function mutateHeadEntry(db, headId, procurementId, entry, headName) {
  return mutateHeadEntries(db, headId, [{ procurementId, entry }], headName);
}

export async function mutateHeadEntries(db, headId, changes, headName) {
  const changedIds = new Set(changes.map(change => String(change.procurementId)));
  const collection = db.collection(HEAD_ENTRIES);
  for (let retry = 0; retry < 8; retry++) {
    const previous = await collection.findOne({ _id: asId(headId) });
    const entries = (await hydratedEntries(db, previous)).filter((record) => !changedIds.has(String(record.procurementId)));
    entries.push(...changes.map(change => change.entry).filter(Boolean));
    if (!previous && !entries.length) return;
    const next = buildHeadDocument(headId, entries, previous || {});
    for (const id of changedIds) delete next.legacyReferences[id];
    if (headName) next.headSupplierName = headName;
    if (!previous) {
      try { await collection.insertOne(next); return; }
      catch (error) { if (error.code === 11000) continue; throw error; }
    }
    // Legacy writers have no revision; compare the full snapshot during conversion.
    const filter = Number(previous.schemaVersion) === 2 ? { _id: previous._id, revision: previous.revision } : { _id: previous._id, $expr: { $eq: ["$$ROOT", { $literal: previous }] } };
    if ((await collection.replaceOne(filter, next)).matchedCount === 1) return;
  }
  throw new Error("Concurrent head commission update; please retry");
}

export { withProcurementTransaction } from "./procurement-transaction.mjs";
