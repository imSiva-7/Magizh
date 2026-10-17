import { customerAccountTrends } from "./history-card-trends";

test("account graphs use signed receipts and preserve opening balances instead of treating Paid orders as receipts", () => {
  const trends = customerAccountTrends([
    { date: "2026-10-15", totalAmount: 200, paymentStatus: "Paid" },
    { date: "2026-10-16", totalAmount: 100, paymentStatus: "Paid" },
  ], [
    { date: "2026-10-15T04:00:00Z", amount: 80 },
    { date: "2026-10-16T04:00:00Z", amount: -20 },
  ], { totalAmount: 400, totalOrders: 3, paidAmount: 90 });
  expect(trends.received.map(row => row.value)).toEqual([110, 90]);
  expect(trends.due.map(row => row.value)).toEqual([190, 310]);
  expect(trends.sales.at(-1).value).toBe(400);
  expect(trends.orders.at(-1).value).toBe(3);
});

test("receipt dates use India days and unavailable receipts do not fabricate payment graphs", () => {
  const trends = customerAccountTrends([], [{ date: "2026-10-15T20:00:00Z", amount: 0.25 }], { totalAmount: 0, totalOrders: 0, paidAmount: 0.25 });
  expect(trends.received).toEqual([{ date: "2026-10-16", value: 0.25 }]);
  expect(trends.due[0].value).toBe(-0.25);
  const unavailable = customerAccountTrends([{ date: "2026-10-16", totalAmount: 100 }], null, { totalAmount: 100, totalOrders: 1 });
  expect(unavailable.orders).toHaveLength(1);
  expect(unavailable.received).toEqual([]);
  expect(unavailable.due).toEqual([]);
});
