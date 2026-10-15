import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { BSON, ObjectId } from "mongodb";
import { HEAD_ENTRIES, buildHeadDocument, flattenHeadEntries } from "../src/lib/head-supplier-entries.mjs";
import {
  BACKUP_COLLECTION, canonicalHash, createRepairPlan, parseArguments,
  recoverCommission, runRepair, sourceFingerprint,
} from "./repair-head-supplier-entries.mjs";

const originalStorage = process.env.PROCUREMENTS_STORAGE;
before(() => { process.env.PROCUREMENTS_STORAGE = "legacy"; });
after(() => { if (originalStorage === undefined) delete process.env.PROCUREMENTS_STORAGE; else process.env.PROCUREMENTS_STORAGE = originalStorage; });
const clone = (value) => value == null ? value : BSON.deserialize(BSON.serialize(value), { promoteValues: false });
const oid = (value) => new ObjectId(value.toString(16).padStart(24, "0"));

function fixture() {
  const source = {
    _id: oid(10), supplierId: oid(2), supplierName: "Child supplier",
    date: "2026-10-15", time: "AM", milkQuantity: 10, fatPercentage: 4, snfPercentage: 8,
    parentTsr: 300, cutPercentage: 5, supplierTSRate: 295, customRate: false,
    totalAmount: 354, paymentStatus: "Paid", comment: "Historical note",
    createdAt: new Date("2026-10-15T00:00:00Z"), updatedAt: new Date("2026-10-15T01:00:00Z"),
  };
  const commission = { ...recoverCommission(source), paymentStatus: "Paid", paymentReviewRequired: false };
  delete commission.paymentReviewReason;
  delete commission.recoveredFromProcurement;
  delete commission.date;
  delete commission.time;
  const document = {
    _id: oid(1), headSupplierName: "Historical head", customMetadata: { keep: new BSON.Int32(17) },
    entries: { "2026-10-15": { AM: commission } }, byProcurement: { [source._id]: "2026-10-15|AM" },
    totals: { entries: 999, milk: 999, earned: 999, paid: 999, due: 999 },
    createdAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-10-15T01:00:00Z"),
  };
  return { source, document };
}

function fakeDb(documents, procurements, hooks = {}) {
  const state = { heads: documents.map(clone), procurements: procurements.map(clone), backups: [], replaces: 0, inserts: 0, sourceReads: 0 };
  const db = {
    state,
    collection(name) {
      if (name === "procurements") return {
        find(query) {
          state.sourceReads++;
          hooks.onSourceRead?.(state);
          const wanted = new Set(query._id.$in.map(String));
          return { async toArray() { return state.procurements.filter((row) => wanted.has(String(row._id))).map(clone); } };
        },
      };
      if (name === HEAD_ENTRIES) return {
        find() { return { async toArray() { return state.heads.map(clone); } }; },
        async findOne(query) { return clone(state.heads.find((row) => String(row._id) === String(query._id)) || null); },
        async replaceOne(query, next) {
          hooks.beforeReplace?.(state);
          const index = state.heads.findIndex((row) => String(row._id) === String(query._id));
          assert.ok(query.$expr?.$eq, "repair must compare the entire original BSON document");
          if (index === -1 || canonicalHash(state.heads[index]) !== canonicalHash(query.$expr.$eq[1].$literal)) return { matchedCount: 0 };
          state.replaces++;
          state.heads[index] = clone(next);
          return { matchedCount: 1 };
        },
      };
      assert.equal(name, BACKUP_COLLECTION);
      return {
        async findOne(query) { return clone(state.backups.find((row) => row._id === query._id) || null); },
        async insertOne(document) {
          hooks.beforeBackup?.(state, document);
          state.inserts++;
          state.backups.push(clone(document));
        },
      };
    },
  };
  return db;
}

test("repair CLI is read-only by default and binds apply to a reviewed source fingerprint", () => {
  assert.equal(parseArguments([]).mode, "dry-run");
  assert.throws(() => parseArguments(["--apply"]), /writes-paused/);
  assert.throws(() => parseArguments(["--apply", "--writes-paused"]), /fingerprint/);
  assert.throws(() => parseArguments(["--apply", "--dry-run"]), /Choose either/);
  assert.throws(() => parseArguments(["--expected-fingerprint", "bad"]), /valid dry-run fingerprint/);
  assert.throws(() => parseArguments(["--unknown"]), /Unknown argument/);
  assert.equal(parseArguments(["--apply", "--writes-paused", "--expected-fingerprint", "a".repeat(64)]).mode, "apply");
});

test("normalization preserves original commission status and unrelated BSON metadata, while recomputing totals", () => {
  const { source, document } = fixture();
  const plan = createRepairPlan([document], [source]);
  assert.equal(plan.report.updates, 1);
  const next = plan.updates[0].next;
  assert.equal(next.entries, undefined);
  assert.equal(next.byProcurement, undefined);
  assert.equal(canonicalHash(next.customMetadata), canonicalHash(document.customMetadata));
  const [row] = flattenHeadEntries(next);
  assert.equal(row.paymentStatus, "Paid");
  assert.equal(row.paymentReviewRequired, false);
  assert.equal(row.comment, "Historical note");
  assert.equal(next.totals.earned, 6);
  assert.equal(next.totals.paid, 6);
  assert.equal(next.totals.due, 0);
});

test("overwritten entries recover from historical snapshots and are flagged unpaid for explicit payment review", () => {
  const { source, document } = fixture();
  const overwritten = { ...source, _id: oid(11), milkQuantity: 20, cutPercentage: 7 };
  document.byProcurement[String(overwritten._id)] = "2026-10-15|AM";
  const plan = createRepairPlan([document], [source, overwritten]);
  assert.equal(plan.report.recoveredEntries, 1);
  assert.equal(plan.report.pendingPaymentReview, 1);
  const rows = flattenHeadEntries(plan.updates[0].next);
  assert.equal(rows.length, 2, "two children in the same AM slot must survive separately");
  const row = rows.find((entry) => String(entry.procurementId) === String(overwritten._id));
  assert.equal(row.paymentStatus, "Not Paid", "the child payment is not evidence that its missing commission was paid");
  assert.equal(row.paymentReviewRequired, true);
  assert.equal(row.totalAmount, 16.8);
  assert.equal(row.createdAt.getTime(), overwritten.createdAt.getTime());
  assert.equal(plan.updates[0].next.totals.earned, 22.8);
  assert.equal(plan.updates[0].next.totals.paid, 6);
});

test("orphan surviving rows stay intact and references to deleted procurements remain available for investigation", () => {
  const { document } = fixture();
  const deletedId = oid(99);
  document.byProcurement[String(deletedId)] = "2025-01-01|PM";
  const plan = createRepairPlan([document], []);
  assert.equal(plan.report.orphanSurvivingEntries, 1);
  assert.equal(plan.report.absentReferencedProcurements, 2);
  assert.equal(plan.report.recoveredEntries, 0);
  assert.equal(plan.updates[0].next.legacyReferences[String(deletedId)], "2025-01-01|PM");
  assert.equal(flattenHeadEntries(plan.updates[0].next)[0].paymentStatus, "Paid");
});

test("unsafe historical snapshots are rejected instead of guessing a commission", () => {
  const { source } = fixture();
  assert.equal(recoverCommission({ ...source, cutPercentage: undefined }), null);
  assert.equal(recoverCommission({ ...source, customRate: true }), null);
  assert.equal(recoverCommission({ ...source, cutPercentage: 300 }), null);
  assert.equal(recoverCommission({ ...source, milkQuantity: Infinity }), null);
  assert.equal(recoverCommission({ ...source, date: "2026-02-30" }), null);
  assert.equal(recoverCommission({ ...source, time: "morning" }), null);
});

test("malformed surviving legacy commissions stop repair rather than disappearing during flattening", () => {
  const { source, document } = fixture();
  document.entries["2026-10-15"].PM = { procurementId: "invalid", totalAmount: 10, milkQuantity: 10 };
  assert.throws(() => createRepairPlan([document], [source]), /surviving legacy commission/);
});

test("read-only dry run writes nothing; apply backs up exact source BSON and is idempotent", async () => {
  const { source, document } = fixture();
  const db = fakeDb([document], [source]);
  const dryRun = await runRepair(db);
  assert.equal(db.state.inserts, 0);
  assert.equal(db.state.replaces, 0);
  const applied = await runRepair(db, { mode: "apply", writesPaused: true, expectedFingerprint: dryRun.fingerprint });
  assert.equal(applied.verified, true);
  assert.equal(db.state.inserts, 1);
  assert.equal(db.state.replaces, 1);
  assert.equal(canonicalHash(db.state.backups[0].document), canonicalHash(clone(document)));
  const second = await runRepair(db);
  assert.equal(second.updates, 0);
  await runRepair(db, { mode: "apply", writesPaused: true, expectedFingerprint: second.fingerprint });
  assert.equal(db.state.inserts, 1);
  assert.equal(db.state.replaces, 1);
});

test("changed reviewed fingerprints or a pre-apply source race prevent every database write", async () => {
  const { source, document } = fixture();
  const db = fakeDb([document], [source]);
  await assert.rejects(runRepair(db, { mode: "apply", writesPaused: true, expectedFingerprint: "a".repeat(64) }), /Source changed/);
  assert.equal(db.state.inserts, 0);
  const racing = fakeDb([document], [source], { onSourceRead(state) { if (state.sourceReads === 2) state.procurements[0].comment = "Changed concurrently"; } });
  const expectedFingerprint = sourceFingerprint(racing.state.heads, racing.state.procurements);
  await assert.rejects(runRepair(racing, { mode: "apply", writesPaused: true, expectedFingerprint }), /Source changed before apply/);
  assert.equal(racing.state.inserts, 0);
  assert.equal(racing.state.replaces, 0);
});

test("exact BSON CAS protects a concurrent legacy writer even when the revision does not change", async () => {
  const { source, document } = fixture();
  const db = fakeDb([document], [source], { beforeReplace(state) { state.heads[0].entries["2026-10-15"].AM.paymentStatus = "Not Paid"; } });
  const dryRun = await runRepair(db);
  await assert.rejects(runRepair(db, { mode: "apply", writesPaused: true, expectedFingerprint: dryRun.fingerprint }), /head changed during repair/);
  assert.equal(db.state.replaces, 0);
  assert.equal(db.state.backups.length, 1);
  assert.equal(db.state.heads[0].entries["2026-10-15"].AM.paymentStatus, "Not Paid");
});

test("ambiguous head ownership and invalid recoverable snapshots block apply before backups or replacements", async () => {
  const { source, document } = fixture();
  const secondHead = { _id: oid(3), entries: {}, byProcurement: { [source._id]: "2026-10-15|AM" } };
  const db = fakeDb([document, secondHead], [source]);
  const dryRun = await runRepair(db);
  assert.equal(dryRun.ambiguousReferences, 1);
  await assert.rejects(runRepair(db, { mode: "apply", writesPaused: true, expectedFingerprint: dryRun.fingerprint }), /Ambiguous references/);
  assert.equal(db.state.inserts, 0);
  const invalid = fakeDb([{ ...document, entries: {} }], [{ ...source, cutPercentage: undefined }]);
  const invalidRun = await runRepair(invalid);
  assert.equal(invalidRun.invalidSnapshots, 1);
  await assert.rejects(runRepair(invalid, { mode: "apply", writesPaused: true, expectedFingerprint: invalidRun.fingerprint }), /invalid snapshots/);
  assert.equal(invalid.state.inserts, 0);
});

test("conflicting immutable backups prevent replacement and are never overwritten", async () => {
  const { source, document } = fixture();
  const db = fakeDb([document], [source]);
  const original = db.state.heads[0];
  const fingerprint = canonicalHash(original);
  db.state.backups.push({ _id: `${original._id}:${fingerprint}`, sourceFingerprint: fingerprint, document: { ...original, headSupplierName: "Conflicting backup" } });
  const dryRun = await runRepair(db);
  await assert.rejects(runRepair(db, { mode: "apply", writesPaused: true, expectedFingerprint: dryRun.fingerprint }), /backup conflicts/);
  assert.equal(db.state.inserts, 0);
  assert.equal(db.state.replaces, 0);
});

test("fingerprints compare full BSON content independent of document ordering", () => {
  const { source, document } = fixture();
  assert.equal(canonicalHash({ b: 2, a: 1 }), canonicalHash({ a: 1, b: 2 }));
  assert.notEqual(canonicalHash(new BSON.Int32(1)), canonicalHash(new BSON.Double(1)));
  assert.notEqual(sourceFingerprint([document], [source]), sourceFingerprint([document], [{ ...source, comment: "Changed" }]));
  const nested = buildHeadDocument(document._id, flattenHeadEntries(document), document);
  assert.equal(createRepairPlan([nested], [source]).report.updates, 0);
});
