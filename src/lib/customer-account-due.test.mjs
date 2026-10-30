import test from "node:test";
import assert from "node:assert/strict";
import { customerAccountDue, totalCustomerDue, summarizeCustomerAccounts } from "./customer-account-due.mjs";

test("due uses account sales and partial payments, including opening debt", () => {
  // Period sales of 500 and receipts of 700 would produce -200 net change,
  // but the account still owes 800 from its 1,500 total sales.
  assert.equal(customerAccountDue({ totalAmount: 1500, paidAmount: 700 }), 800);
});

test("credits are not negative unpaid amounts and do not offset another customer's debt", () => {
  assert.equal(totalCustomerDue([
    { currentDue: customerAccountDue({ totalAmount: 100, paidAmount: 150 }) },
    { currentDue: customerAccountDue({ totalAmount: 300, paidAmount: 100 }) },
  ]), 200);
});

test("fully paid accounts owe zero and amounts are calculated in cents", () => {
  assert.equal(customerAccountDue({ totalAmount: 50, paidAmount: 50 }), 0);
  assert.equal(customerAccountDue({ totalAmount: 10.1, paidAmount: 0.2 }), 9.9);
  assert.equal(totalCustomerDue([{ currentDue: 0.1 }, { currentDue: 0.2 }]), 0.3);
});

test("overall balances include older accounts and partial payments without counting the global total twice", () => {
  const summary = summarizeCustomerAccounts([
    { _id: "old", totalAmount: 1500, paidAmount: 700, customerName: "Old name" },
    { _id: "credit", totalAmount: 100, paidAmount: 150 },
    { _id: "global", totalAmount: 1600, paidAmount: 850 },
  ], [{ _id: "old", customerName: "Updated name" }]);
  assert.equal(summary.totalAmount, 1600);
  assert.equal(summary.paidAmount, 850);
  assert.equal(summary.dueAmount, 800);
  assert.deepEqual(summary.customers, [
    { id: "old", name: "Updated name", totalAmount: 1500, paidAmount: 700, currentDue: 800 },
  ]);
});

test("overall paid reflects corrected account balances and sums cents accurately", () => {
  const summary = summarizeCustomerAccounts([
    { _id: "a", totalAmount: 0.5, paidAmount: "0.10" },
    { _id: "b", totalAmount: 0.5, paidAmount: 0.2 },
  ]);
  assert.equal(summary.paidAmount, 0.3);
  assert.equal(summary.dueAmount, 0.7);
  assert.deepEqual(summarizeCustomerAccounts([]), { totalAmount: 0, paidAmount: 0, dueAmount: 0, customers: [] });
});
