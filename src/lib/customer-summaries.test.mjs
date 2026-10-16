import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { buildCustomerSummary, updateCustomerSummaries } from "./customer-summaries.mjs";
import { withCustomerTransaction } from "./customer-transaction.mjs";

test("summaries keep product units separate and sum repeated products without rounding drift", () => {
  const id = new ObjectId();
  const summary = buildCustomerSummary(id, [
    { customerId: id, totalAmount: 0.1, paymentStatus: "Paid", items: [{ product: "Milk", quantity: 1.2345 }, { product: "Milk", quantity: 2 }, { product: "Butter", quantity: 3 }] },
    { customerId: id, totalAmount: 0.2, items: [] },
  ]);
  assert.equal(summary.totalAmount, 0.3);
  assert.equal(summary.orderPaidAmount, 0.1);
  assert.equal(summary.orderDueAmount, 0.2);
  assert.equal(summary.quantities.milk, 3.2345);
  assert.equal(summary.quantities.butter, 3);
  assert.equal(summary.totalItems, 3);
});

test("edits, status changes and final deletion apply old/new deltas", async () => {
  const id = new ObjectId();
  const before = { customerId: id, totalAmount: 100, paymentStatus: "Not Paid", items: [{ product: "Milk", quantity: 2 }] };
  const after = { ...before, totalAmount: 150, paymentStatus: "Paid" };
  let stored = buildCustomerSummary(id, [before]);
  const db = { collection() { return { findOne: async () => stored, replaceOne: async (_, value) => { stored = value; } }; } };
  await updateCustomerSummaries(db, [before], [after]);
  assert.equal(stored.totalAmount, 150);
  assert.equal(stored.orderPaidAmount, 150);
  assert.equal(stored.orderDueAmount, 0);
  await updateCustomerSummaries(db, [after], []);
  assert.equal(stored.totalOrders, 0);
  assert.equal(stored.quantities.milk, 0);
  assert.equal(stored.totalAmount, 0);
});

test("missing summary bootstraps post-write orders without adding the mutation twice", async () => {
  const id = new ObjectId(), order = { customerId: id, totalAmount: 30, items: [] };
  let stored;
  const db = { collection(name) { return name === "orders" ? { find: () => ({ toArray: async () => [order] }) } : { findOne: async () => null, replaceOne: async (_, value) => { stored = value; } }; } };
  await updateCustomerSummaries(db, [], [order]);
  assert.equal(stored.totalOrders, 1);
  assert.equal(stored.totalAmount, 30);
});

test("validation responses abort the transaction and all operations receive the session", async () => {
  let aborted = false, ended = false;
  const session = { withTransaction: async action => { try { return await action(); } catch (error) { aborted = true; throw error; } }, endSession: async () => { ended = true; } };
  const db = { client: { startSession: () => session }, collection: () => ({ insertMany: async (_, options) => assert.equal(options.session, session) }) };
  const response = { status: 400 };
  assert.equal(await withCustomerTransaction(db, async scoped => { await scoped.collection("stock_ledger").insertMany([]); return response; }), response);
  assert.ok(aborted && ended);
});
