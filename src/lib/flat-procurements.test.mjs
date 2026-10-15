import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId, Decimal128 } from "mongodb";
import { buildFlatSummary, emptyMetrics, entryMetrics, combineMetrics, scaledInteger, summaryUpdatePipeline } from "./flat-procurements.mjs";
import { planMigration, verifySummaries, parseArguments } from "../../scripts/migrate-flat-procurements.mjs";
import { buildSupplierDocument } from "./supplier-procurements.mjs";
const supplierId = new ObjectId();
const entry = (values = {}) => ({ _id: new ObjectId(), supplierId, date: "2026-10-15", time: "AM", milkQuantity: 10, fatPercentage: 4, snfPercentage: 8, totalAmount: 400, paymentStatus: "Not Paid", ...values });

test("supplier summaries calculate weighted quality, active-day milk, rate and payment buckets", () => {
  const rows = [entry(), entry({ date: "2026-10-16", milkQuantity: "30", fatPercentage: "5", snfPercentage: "9", totalAmount: "1500", paymentStatus: "Paid" })];
  const summary = buildFlatSummary(supplierId, rows);
  assert.deepEqual(summary.overall, { count: 2, milkQuantity: 40, totalAmount: 1900, avgFat: 4.75, avgSnf: 8.75, avgRate: 47.5 });
  assert.equal(summary.paid.totalAmount, 1500); assert.equal(summary.unpaid.totalAmount, 400);
  assert.equal(summary.activeDays, 2); assert.equal(summary.avgMilkPerDay, 20);
  assert.equal(summary._metrics.overall.fatMilkUnits.toString(), "19000000000");
});
test("payment transitions, repeated requests and reversal preserve overall counters exactly", () => {
  const original = entry({ milkQuantity: .1, totalAmount: .1 });
  const paid = { ...original, paymentStatus: "Paid" };
  const totals = entryMetrics(original);
  for (let i = 0; i < 10000; i++) {
    combineMetrics(totals, entryMetrics(original), -1n); combineMetrics(totals, entryMetrics(paid));
    combineMetrics(totals, entryMetrics(paid), -1n); combineMetrics(totals, entryMetrics(original));
  }
  assert.deepEqual(totals, entryMetrics(original));
  assert.deepEqual(combineMetrics(entryMetrics(paid), entryMetrics(paid), -1n), emptyMetrics());
});
test("fixed-point counters retain precision beyond JavaScript's safe integer range", () => {
  const metrics = entryMetrics(entry({ milkQuantity: 90000000, fatPercentage: 12.3456 }));
  assert.equal(metrics.overall.fatMilkUnits, 900000000000n * 123456n);
  assert.equal(Decimal128.fromString(String(metrics.overall.fatMilkUnits)).toString(), "111110400000000000");
  assert.equal(scaledInteger("0.0001", 4), 1n);
  assert.throws(() => scaledInteger("invalid", 4));
});
test("empty and final-entry deletion have zero averages and no division errors", () => {
  const summary = buildFlatSummary(supplierId, []);
  assert.equal(summary.activeDays, 0); assert.equal(summary.avgMilkPerDay, 0);
  assert.deepEqual(summary.overall, { count: 0, milkQuantity: 0, totalAmount: 0, avgFat: 0, avgSnf: 0, avgRate: 0 });
});
test("delta update pipeline contains no history lookup, unwind, replacement or full-record list", () => {
  const pipeline = summaryUpdatePipeline(supplierId, entryMetrics(entry()), 1);
  assert.equal(pipeline.length, 2);
  assert.ok(pipeline[0].$set["_metrics.overall.milkUnits"]);
  assert.ok(pipeline[1].$set.overall.avgFat);
  assert.doesNotMatch(JSON.stringify(pipeline), /\$lookup|\$unwind|entries|years|months/);
});
test("migration treats nested entries as authoritative and plans backups of stale legacy records", () => {
  const current = entry({ comment: "latest" }), old = { ...current, comment: "old" }, stale = entry();
  const plan = planMigration([buildSupplierDocument([current])], [old, stale]);
  assert.equal(plan.replacements.length, 1); assert.equal(plan.extras.length, 1);
  assert.equal(plan.source[0].comment, "latest");
  const summary = buildFlatSummary(supplierId, [current]);
  verifySummaries(plan.groups, [summary]);
  assert.throws(() => verifySummaries(plan.groups, [{ ...summary, paid: { ...summary.paid, totalAmount: 5 } }]), /verification failed/);
});
test("migration refuses empty or duplicate source and invalid flags", () => {
  assert.throws(() => planMigration([], []), /empty/);
  const record = entry(), document = buildSupplierDocument([record]);
  assert.throws(() => planMigration([document, document], []), /Duplicate/);
  assert.equal(parseArguments([]).mode, "dry-run");
  assert.throws(() => parseArguments(["--apply", "--verify"]));
});
