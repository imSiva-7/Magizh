import test from "node:test";
import assert from "node:assert/strict";
import {
  paymentPeriodRange,
  combinePaymentPeriod,
  sumPaymentPeriod,
  matchesPeriodActivity,
} from "./customer-payment-period.mjs";

test("payment-date bounds include the full selected day in India", () => {
  const { orderMatch, receiptMatch } = paymentPeriodRange(
    "2026-10-15",
    "2026-10-15",
  );
  assert.deepEqual(orderMatch, {
    date: { $gte: "2026-10-15", $lte: "2026-10-15" },
  });
  assert.equal(
    receiptMatch.__paymentDate.$gte.toISOString(),
    "2026-10-14T18:30:00.000Z",
  );
  assert.equal(
    receiptMatch.__paymentDate.$lt.toISOString(),
    "2026-10-15T18:30:00.000Z",
  );
});
test("invalid dates and reversed ranges are rejected; open-ended ranges work", () => {
  assert.throws(() => paymentPeriodRange("2026-02-30", null));
  assert.throws(() => paymentPeriodRange("2026-10-16", "2026-10-01"));
  assert.deepEqual(paymentPeriodRange(null, null), {
    orderMatch: {},
    receiptMatch: {},
  });
  assert.ok(
    paymentPeriodRange(null, "2026-10-16").receiptMatch.__paymentDate.$lt,
  );
});
test("period activity merges sales and actual receipts without using order payment status or lifetime balances", () => {
  const result = combinePaymentPeriod(
    [{ _id: "a", totalOrders: 2, totalAmount: 1000 }],
    [
      { _id: "a", receiptCount: 2, receivedAmount: 250 },
      { _id: "b", receiptCount: 1, receivedAmount: 400 },
    ],
  );
  assert.deepEqual(result.overall, {
    totalOrders: 2,
    receiptCount: 3,
    totalAmount: 1000,
    receivedAmount: 650,
    netChange: 350,
  });
  assert.equal(
    result.customers.find((row) => row.customerId === "b").netChange,
    -400,
  );
  assert.equal(
    result.customers.find((row) => row.customerId === "b").totalOrders,
    0,
  );
});
test("signed corrections and searched subsets retain exact cent totals", () => {
  const { customers } = combinePaymentPeriod(
    [{ _id: "a", totalOrders: 1, totalAmount: 0.3 }],
    [
      { _id: "a", receiptCount: 1, receivedAmount: 0.1 },
      { _id: "a", receiptCount: 1, receivedAmount: -0.05 },
      { _id: "b", receiptCount: 1, receivedAmount: 100 },
    ],
  );
  assert.deepEqual(
    sumPaymentPeriod(customers.filter((row) => row.customerId === "a")),
    {
      totalOrders: 1,
      receiptCount: 2,
      totalAmount: 0.3,
      receivedAmount: 0.05,
      netChange: 0.25,
    },
  );
});
test("activity filters include receipt-only and correction-only customers and omit empty accounts", () => {
  assert.equal(
    matchesPeriodActivity(
      { totalOrders: 0, receiptCount: 1, netChange: -500 },
      "receipts",
    ),
    true,
  );
  assert.equal(
    matchesPeriodActivity(
      { totalOrders: 0, receiptCount: 1, netChange: 100 },
      "increase",
    ),
    true,
  );
  assert.equal(
    matchesPeriodActivity(
      { totalOrders: 1, receiptCount: 0, netChange: 500 },
      "sales-only",
    ),
    true,
  );
  assert.equal(
    matchesPeriodActivity({ totalOrders: 0, receiptCount: 0 }, ""),
    false,
  );
});
