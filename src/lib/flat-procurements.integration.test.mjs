import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import { getFlatProcurementStore, ENTRY_COLLECTION, SUMMARY_COLLECTION, buildFlatSummary, getAllTimeProcurementTotals } from "./flat-procurements.mjs";
import { withProcurementTransaction, STORAGE_CONTROL, STORAGE_KEY } from "./procurement-transaction.mjs";
import { canonicalHash } from "../../scripts/migrate-supplier-procurements.mjs";
import { verifySummaries, runMigration } from "../../scripts/migrate-flat-procurements.mjs";
import { buildSupplierDocument } from "./supplier-procurements.mjs";
import { commissionFromProcurement, mutateHeadEntry, findHeadEntry, flattenHeadEntries } from "./head-supplier-entries.mjs";

test("real MongoDB transactions keep flat entries and summaries correct through all mutations and rollback", { skip: process.env.RUN_MONGO_INTEGRATION !== "true", timeout: 120000 }, async (t) => {
  dotenv.config({ path: ".env.local", quiet: true });
  const priorMode = process.env.PROCUREMENTS_STORAGE;
  process.env.PROCUREMENTS_STORAGE = "flat";
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const databaseName = `codex_proc_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const db = client.db(databaseName), supplierId = new ObjectId();
  const entry = (fields = {}) => ({ _id: new ObjectId(), supplierId, date: "2026-10-15", time: "AM", milkQuantity: 10, fatPercentage: 4, snfPercentage: 8, totalAmount: 400, paymentStatus: "Not Paid", ...fields });
  const store = getFlatProcurementStore(db);
  const verify = async () => {
    const rows = await db.collection(ENTRY_COLLECTION).find({ supplierId }).toArray();
    const summary = await db.collection(SUMMARY_COLLECTION).findOne({ _id: supplierId });
    verifySummaries(new Map([[String(supplierId), { supplierId, entries: rows }]]), [summary]);
    return summary;
  };
  try {
    await client.connect();
    for (const name of [ENTRY_COLLECTION, SUMMARY_COLLECTION, STORAGE_CONTROL, "head_supplier_entries"]) await db.createCollection(name);
    const first = entry(), second = entry({ date: "2026-10-16", milkQuantity: 30, fatPercentage: 5, snfPercentage: 9, totalAmount: 1500, paymentStatus: "Paid" });
    await t.test("first and subsequent inserts initialize exact weighted totals", async () => {
      await store.insertOne(first); await store.insertOne(second);
      assert.deepEqual((await verify()).overall, buildFlatSummary(supplierId, [first, second]).overall);
      assert.equal((await getAllTimeProcurementTotals(db)).dueAmount, 400);
    });
    await t.test("edits update amounts, quality and active collection dates", async () => {
      await store.updateOne({ _id: first._id }, { $set: { date: second.date, milkQuantity: 12.25, fatPercentage: 4.3, totalAmount: 504.75 } });
      assert.equal((await verify()).activeDays, 1);
      await store.updateOne({ _id: first._id }, { $set: { date: "2027-01-01" } });
      assert.equal((await verify()).activeDays, 2);
    });
    await t.test("bulk paid, repeated paid and unpaid reversal keep sums stable", async () => {
      await store.updateMany({ supplierId }, { $set: { paymentStatus: "Paid" } });
      assert.equal((await verify()).unpaid.totalAmount, 0);
      await store.updateMany({ supplierId }, { $set: { paymentStatus: "Paid" } });
      assert.equal((await verify()).unpaid.count, 0);
      await store.updateOne({ _id: first._id }, { $set: { paymentStatus: "Not Paid" } });
      assert.equal((await verify()).unpaid.totalAmount, 504.75);
    });
    await t.test("a failed linked operation rolls back both entry and summary", async () => {
      const snapshot = canonicalHash(await db.collection(SUMMARY_COLLECTION).findOne({ _id: supplierId }));
      const pending = entry({ milkQuantity: 999 });
      await assert.rejects(() => withProcurementTransaction(db, async (tx) => {
        await getFlatProcurementStore(tx).insertOne(pending); throw new Error("Simulated commission failure");
      }), /Simulated/);
      assert.equal(await store.findOne({ _id: pending._id }), null);
      assert.equal(canonicalHash(await db.collection(SUMMARY_COLLECTION).findOne({ _id: supplierId })), snapshot);
    });
    await t.test("concurrent inserts retain every entry and concurrent duplicates produce one", async () => {
      await Promise.all(Array.from({ length: 6 }, (_, i) => store.insertOne(entry({ milkQuantity: 20 + i, totalAmount: 800 + i }))));
      assert.equal((await verify()).overall.count, 8);
      const results = await Promise.allSettled([store.insertOne(entry({ milkQuantity: 77 })), store.insertOne(entry({ milkQuantity: 77 }))]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(results.find((result) => result.status === "rejected").reason.code, "PROCUREMENT_DUPLICATE");
      await verify();
    });
    await t.test("head cuts create, edit and delete independently for same-shift entries and roll back together", async () => {
      const headId = new ObjectId();
      const firstCut = entry({ milkQuantity: 11, fatPercentage: 4, snfPercentage: 8.5, parentTsr: 300, cutPercentage: 10, supplierTSRate: 290, totalAmount: 398.75, headSupplierId: headId });
      const secondCut = { ...firstCut, _id: new ObjectId(), milkQuantity: 12, totalAmount: 435 };
      for (const record of [firstCut, secondCut]) await withProcurementTransaction(db, async (tx) => {
        await getFlatProcurementStore(tx).insertOne(record);
        await mutateHeadEntry(tx, headId, record._id, commissionFromProcurement(record));
      });
      let head = await db.collection("head_supplier_entries").findOne({ _id: headId });
      assert.equal(head.totals.entries, 2); assert.equal(head.totals.earned, 28.75);
      await withProcurementTransaction(db, async (tx) => {
        const owner = await findHeadEntry(tx, firstCut);
        const changed = { ...firstCut, milkQuantity: 20, totalAmount: 725 };
        await getFlatProcurementStore(tx).updateOne({ _id: firstCut._id }, { $set: { milkQuantity: 20, totalAmount: 725 } });
        await mutateHeadEntry(tx, owner.headId, firstCut._id, commissionFromProcurement(changed, owner.entry));
      });
      head = await db.collection("head_supplier_entries").findOne({ _id: headId });
      assert.equal(head.totals.earned, 40);
      const beforeFailure = canonicalHash(head);
      await assert.rejects(() => withProcurementTransaction(db, async (tx) => {
        const owner = await findHeadEntry(tx, secondCut);
        await getFlatProcurementStore(tx).deleteOne({ _id: secondCut._id });
        await mutateHeadEntry(tx, owner.headId, secondCut._id, null);
        throw new Error("Linked head operation failed");
      }), /Linked head/);
      assert.ok(await store.findOne({ _id: secondCut._id }));
      assert.equal(canonicalHash(await db.collection("head_supplier_entries").findOne({ _id: headId })), beforeFailure);
      for (const record of [firstCut, secondCut]) {
        await withProcurementTransaction(db, async (tx) => {
          const owner = await findHeadEntry(tx, record);
          await mutateHeadEntry(tx, owner.headId, record._id, null);
          await getFlatProcurementStore(tx).deleteOne({ _id: record._id });
        });
        const remaining = flattenHeadEntries(await db.collection("head_supplier_entries").findOne({ _id: headId }));
        assert.equal(remaining.length, record === firstCut ? 1 : 0);
        if (remaining.length) assert.equal(String(remaining[0].procurementId), String(secondCut._id));
        await verify();
      }
    });
    await t.test("maintenance and stale storage modes reject writes without changes", async () => {
      await db.collection(STORAGE_CONTROL).insertOne({ _id: STORAGE_KEY, mode: "nested", paused: true });
      await assert.rejects(() => store.insertOne(entry({ milkQuantity: 88 })), /being updated/);
      await db.collection(STORAGE_CONTROL).updateOne({ _id: STORAGE_KEY }, { $set: { paused: false } });
      await assert.rejects(() => store.insertOne(entry({ milkQuantity: 88 })), /being updated/);
      await db.collection(STORAGE_CONTROL).updateOne({ _id: STORAGE_KEY }, { $set: { mode: "flat" } });
      await verify();
    });
    await t.test("deleting the final entries leaves zero summaries and zero active days", async () => {
      for (const record of await store.find({ supplierId }).toArray()) { await store.deleteOne({ _id: record._id }); await verify(); }
      const summary = await verify(); assert.equal(summary.overall.count, 0); assert.equal(summary.activeDays, 0); assert.equal(summary.avgMilkPerDay, 0);
    });
    await t.test("migration backs up stale target rows, preserves BSON, verifies, and blocks stale reapply", async () => {
      await db.collection(STORAGE_CONTROL).deleteOne({ _id: STORAGE_KEY });
      const authoritative = entry({ comment: "current authoritative value", external: { unknown: true }, createdAt: new Date() });
      await db.collection("supplier_procurements").insertOne(buildSupplierDocument([authoritative]));
      await db.collection(ENTRY_COLLECTION).insertOne({ ...authoritative, comment: "old value" });
      const extra = entry({ milkQuantity: 8 }); await db.collection(ENTRY_COLLECTION).insertOne(extra);
      const rawClient = new MongoClient(process.env.MONGODB_URI, { promoteValues: false });
      try {
        await rawClient.connect();
        const rawDb = rawClient.db(databaseName);
        const dry = await runMigration(rawDb, { mode: "dry-run" }); assert.equal(dry.replacements, 1); assert.equal(dry.staleLegacyEntries, 1);
        const result = await runMigration(rawDb, { mode: "apply" }); assert.equal(result.verified, true);
      } finally { await rawClient.close(); }
      assert.equal(canonicalHash(await store.findOne({ _id: authoritative._id })), canonicalHash(authoritative));
      assert.equal(await store.findOne({ _id: extra._id }), null);
      assert.equal(await db.collection("procurements_flat_migration_backup").countDocuments({}), 2);
      await assert.rejects(() => runMigration(db, { mode: "apply" }), /already active/);
      const check = await runMigration(db, { mode: "verify" }); assert.equal(check.entries, 1); await verify();
      process.env.PROCUREMENTS_STORAGE = "nested";
      await assert.rejects(() => runMigration(db, { mode: "activate" }), /Set PROCUREMENTS_STORAGE/);
      process.env.PROCUREMENTS_STORAGE = "flat";
      assert.equal((await runMigration(db, { mode: "activate" })).active, true);
      assert.equal((await db.collection(STORAGE_CONTROL).findOne({ _id: STORAGE_KEY })).paused, false);
      await store.insertOne(entry({ milkQuantity: 123 }));
      assert.equal((await runMigration(db, { mode: "verify" })).entries, 2);
      await verify();
    });
  } finally {
    try {
      assert.match(databaseName, /^codex_proc_test_[a-f0-9]{16}$/);
      for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) await db.collection(name).drop();
    }
    finally { await client.close(); if (priorMode === undefined) delete process.env.PROCUREMENTS_STORAGE; else process.env.PROCUREMENTS_STORAGE = priorMode; }
  }
});
