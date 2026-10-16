import { customerDaily, customerChartSeries } from "./customer-charts";

test("groups multiple orders and treats every non-Paid status as due", () => {
  const daily = customerDaily([
    { date: "2026-10-01", totalAmount: "100", paymentStatus: "Paid" },
    { date: "2026-10-01", totalAmount: 250, paymentStatus: "Pending" },
    { date: "2026-10-03", totalAmount: 50, paymentStatus: "Not Paid" },
  ]);
  const { rows } = customerChartSeries(daily, { startDate: "2026-10-01", endDate: "2026-10-03" });
  expect(rows).toEqual([
    { date: "2026-10-01", orders: 2, amount: 350, paid: 100, due: 250 },
    { date: "2026-10-02", orders: 0, amount: 0, paid: 0, due: 0 },
    { date: "2026-10-03", orders: 1, amount: 50, paid: 0, due: 50 },
  ]);
});

test("long periods group by month and preserve totals", () => {
  const { rows, monthly } = customerChartSeries([{ date: "2026-01-01", orders: 2, amount: 100 }, { date: "2026-03-01", orders: 3, amount: 200 }], { startDate: "2026-01-01", endDate: "2026-03-31" });
  expect(monthly).toBe(true);
  expect(rows.map(row => row.orders)).toEqual([2, 0, 3]);
  expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(300);
  expect(customerChartSeries([], {}).rows).toEqual([]);
});
