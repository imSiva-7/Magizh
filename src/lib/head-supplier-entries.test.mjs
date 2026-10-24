import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { buildHeadDocument, findHeadEntries, mutateHeadEntries, flattenHeadEntries } from "./head-supplier-entries.mjs";

test("bulk payment resolves heads once and rebuilds a shared head once", async () => {
  const headId = new ObjectId();
  const entries = Array.from({ length: 3 }, (_, i) => ({ procurementId: new ObjectId(), date: `2026-10-0${i + 1}`, time: "AM", milkQuantity: 10, totalAmount: 100, paymentStatus: "Not Paid" }));
  let document = buildHeadDocument(headId, entries);
  let reads = 0, writes = 0, lookups = 0;
  const db = { collection: () => ({
    find: () => { lookups++; return { toArray: async () => [document] }; },
    findOne: async () => { reads++; return document; },
    replaceOne: async (filter, next) => { assert.equal(filter.revision, document.revision); writes++; document = next; return { matchedCount: 1 }; },
  }) };
  const records = entries.slice(0, 2).map(e => ({ _id: e.procurementId, headSupplierId: headId }));
  const heads = await findHeadEntries(db, records);
  await mutateHeadEntries(db, headId, heads.map((head, i) => ({ procurementId: records[i]._id, entry: { ...head.entry, paymentStatus: "Paid" } })));
  assert.equal(lookups, 1);
  assert.equal(reads, 1);
  assert.equal(writes, 1);
  assert.equal(document.totals.paid, 200);
  assert.equal(document.totals.due, 100);
  assert.equal(flattenHeadEntries(document).length, 3);
});

test("bulk resolution rejects conflicting legacy head ownership", async () => {
  const id = new ObjectId();
  const db = { collection: () => ({ find: () => ({ toArray: async () => [
    { _id: new ObjectId(), entryIds: [id] },
    { _id: new ObjectId(), byProcurement: { [String(id)]: null } },
  ] }) }) };
  await assert.rejects(findHeadEntries(db, [{ _id: id }]), /multiple heads/);
});
