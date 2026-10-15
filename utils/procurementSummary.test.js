import { getProcurementSummary } from "./procurementSummary";

test("quality is weighted by milk volume, while milk and amount are averaged over active dates", () => {
  const rows = [
    { date: "2026-10-01", milkQuantity: "10", totalAmount: "400", fatPercentage: "6", snfPercentage: "9" },
    { date: "2026-10-01T12:00:00.000Z", milkQuantity: 90, totalAmount: 2700, fatPercentage: 3, snfPercentage: 8 },
    { date: "2026-10-03", milkQuantity: 100, totalAmount: 3500, fatPercentage: 4, snfPercentage: 8.5 },
  ];
  expect(getProcurementSummary(rows)).toEqual({
    milk: 200, amount: 6600, count: 3, avgRate: "33.00", avgRateDaily: "3300", avgMilkDaily: "100.00", avgFat: "3.7", avgSnf: "8.3", daysWithData: 2,
  });
});

test("empty and missing inputs return complete finite zero summaries", () => {
  const empty = { milk: 0, amount: 0, count: 0, avgRate: "0.00", avgRateDaily: "0", avgMilkDaily: "0.00", avgFat: "0.0", avgSnf: "0.0", daysWithData: 0 };
  expect(getProcurementSummary([])).toEqual(empty);
  expect(getProcurementSummary()).toEqual(empty);
  expect(getProcurementSummary(null)).toEqual(empty);
});

test("invalid and non-finite numeric values cannot poison totals or quality averages", () => {
  const summary = getProcurementSummary([
    { date: "2026-10-01", milkQuantity: 10, totalAmount: 300, fatPercentage: 4, snfPercentage: 8.5 },
    { date: "2026-02-30", milkQuantity: "invalid", totalAmount: Infinity, fatPercentage: NaN, snfPercentage: undefined },
    { date: "bad-date", milkQuantity: -10, totalAmount: -300, fatPercentage: true, snfPercentage: "8oops" },
  ]);
  expect(summary).toMatchObject({ milk: 10, amount: 300, avgRate: "30.00", avgMilkDaily: "10.00", avgFat: "4.0", avgSnf: "8.5", daysWithData: 1 });
});

test("zero milk and absent dates never divide by zero", () => {
  expect(getProcurementSummary([{ milkQuantity: 0, totalAmount: 0 }])).toMatchObject({ avgRate: "0.00", avgMilkDaily: "0.00", avgRateDaily: "0", avgFat: "0.0", avgSnf: "0.0", daysWithData: 0 });
});
