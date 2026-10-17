import { rankCustomerSales } from "./customer-rankings";

test("customer ranks use exact sales amounts, share ties, and ignore receipts-only and empty accounts", () => {
  const ranks = rankCustomerSales([
    { customerId: "b", totalOrders: 2, totalAmount: 100.25, receivedAmount: 0 },
    { customerId: "a", totalOrders: 1, totalAmount: "100.25", receivedAmount: 9999 },
    { customerId: "c", totalOrders: 8, totalAmount: 100.24 },
    { customerId: "d", totalOrders: 0, totalAmount: 0, receivedAmount: 50000 },
    { customerId: "e", totalOrders: 1, totalAmount: -1 },
  ], [{ _id: "a", customerName: "Current name" }], [{ customerId: "a", customerName: "Old name" }, { customerId: "b", customerName: "Shop B" }]);
  expect(ranks.map(row => [row.customerId, row.rank, row.tied, row.totalAmount])).toEqual([
    ["a", 1, true, 100.25], ["b", 1, true, 100.25], ["c", 3, false, 100.24],
  ]);
  expect(ranks[0].name).toBe("Current name");
  expect(ranks[1].name).toBe("Shop B");
  expect(rankCustomerSales([])).toEqual([]);
});
