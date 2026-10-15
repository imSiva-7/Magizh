import { procurementDaily, supplierChartSeries } from "./supplier-charts";

test("chart data groups AM/PM entries, numeric strings, payments and weighted quality", () => {
  const daily = procurementDaily([
    { date: "2026-10-15", milkQuantity: "10", totalAmount: "400", fatPercentage: 4, snfPercentage: 8, paymentStatus: "Not Paid" },
    { date: "2026-10-15", milkQuantity: 30, totalAmount: 1500, fatPercentage: 5, snfPercentage: 9, paymentStatus: "Paid" },
  ]);
  const { rows } = supplierChartSeries(daily);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ milk: 40, amount: 1900, paid: 1500, due: 400, avgFat: 4.75, avgSnf: 8.75 });
});
test("date filters exclude other records and missing days have no fabricated quality reading", () => {
  const { rows } = supplierChartSeries([
    { date: "2026-10-01", milk: 10, amount: 100, avgFat: 4, avgSnf: 8 },
    { date: "2026-10-03", milk: 20, amount: 200, avgFat: 5, avgSnf: 9 },
    { date: "2026-11-01", milk: 90, amount: 999 },
  ], { startDate: "2026-10-01", endDate: "2026-10-03" });
  expect(rows).toHaveLength(3);
  expect(rows[1]).toMatchObject({ milk: 0, amount: 0, avgFat: null, avgSnf: null });
  expect(rows.reduce((sum, row) => sum + row.milk, 0)).toBe(30);
});
test("long ranges use monthly buckets and weight quality by litres across days", () => {
  const { rows, monthly } = supplierChartSeries([
    { date: "2026-01-01", milk: 10, amount: 100, paid: 100, avgFat: 4, avgSnf: 8 },
    { date: "2026-01-02", milk: 30, amount: 300, due: 300, avgFat: 5, avgSnf: 9 },
    { date: "2026-03-01", milk: 5, amount: 50, paid: 50, avgFat: 6, avgSnf: 9.5 },
  ], { startDate: "2026-01-01", endDate: "2026-03-31" });
  expect(monthly).toBe(true); expect(rows).toHaveLength(3);
  expect(rows[0]).toMatchObject({ date: "2026-01", milk: 40, amount: 400, paid: 100, due: 300, avgFat: 4.75, avgSnf: 8.75 });
  expect(rows[1].avgFat).toBeNull();
});
test("empty and out-of-range inputs return an honest empty state", () => {
  expect(supplierChartSeries([]).rows).toEqual([]);
  expect(supplierChartSeries([{ date: "2025-01-01", milk: 10 }], { startDate: "2026-01-01" }).rows).toEqual([]);
});
