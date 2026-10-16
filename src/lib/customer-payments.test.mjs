import test from "node:test";
import assert from "node:assert/strict";
import { accountStatus, moneyCents, paymentBalance } from "./customer-payments.mjs";

test("partial payments, settlement and credit derive from amounts", () => {
  assert.deepEqual(paymentBalance(1000, 0, "300"), { paidAmount: 300, dueAmount: 700 });
  assert.deepEqual(paymentBalance(1000, 300, "200"), { paidAmount: 500, dueAmount: 500 });
  assert.equal(accountStatus(1000, 300), "Part paid");
  assert.equal(accountStatus(1000, 0), "Unpaid");
  assert.equal(accountStatus(1000, 1000), "Settled");
  assert.equal(accountStatus(1000, 1100), "Credit");
  assert.deepEqual(paymentBalance(1000, 1100, "-200"), { paidAmount: 900, dueAmount: 100 });
});

test("money uses cents, rejects malformed values and prevents negative total receipts", () => {
  assert.deepEqual(paymentBalance(0.3, 0.1, "0.20"), { paidAmount: 0.3, dueAmount: 0 });
  for (const value of ["", "Infinity", "12abc", "0.001", "1e3"]) assert.throws(() => moneyCents(value));
  assert.throws(() => paymentBalance(100, 20, "-21"), /cannot be negative/);
});
