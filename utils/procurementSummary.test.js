import { getProcurementSummary, getProcurementPaymentSummary } from "./procurementSummary";

test("quality is weighted by milk volume, while milk and amount are averaged over active dates", () => {
  const rows = [
    { date: "2026-10-01", milkQuantity: "10", totalAmount: "400", fatPercentage: "6", snfPercentage: "9" },
    { date: "2026-10-01T12:00:00.000Z", milkQuantity: 90, totalAmount: 2700, fatPercentage: 3, snfPercentage: 8 },
    { date: "2026-10-03", milkQuantity: 100, totalAmount: 3500, fatPercentage: 4, snfPercentage: 8.5 },
  ];
  expect(getProcurementSummary(rows)).toEqual({
    milk: 200, amount: 6600, count: 3, avgRate: "33.0", avgRateDaily: "3300", avgMilkDaily: "100.00", avgFat: "3.65", avgSnf: "8.30", daysWithData: 2,
  });
});

test("empty and missing inputs return complete finite zero summaries", () => {
  const empty = { milk: 0, amount: 0, count: 0, avgRate: "0.0", avgRateDaily: "0", avgMilkDaily: "0.00", avgFat: "0.00", avgSnf: "0.00", daysWithData: 0 };
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
  expect(summary).toMatchObject({ milk: 10, amount: 300, avgRate: "30.0", avgMilkDaily: "10.00", avgFat: "4.00", avgSnf: "8.50", daysWithData: 1 });
});

test("zero milk and absent dates never divide by zero", () => {
  expect(getProcurementSummary([{ milkQuantity: 0, totalAmount: 0 }])).toMatchObject({ avgRate: "0.0", avgMilkDaily: "0.00", avgRateDaily: "0", avgFat: "0.00", avgSnf: "0.00", daysWithData: 0 });
});

test("summary amounts use truncated calculated rates for legacy procurement entries", () => {
  const summary = getProcurementSummary([
    {
      date: "2026-10-01",
      milkQuantity: 10,
      rate: 44.98,
      totalAmount: 449.8,
      customRate: false,
    },
  ]);
  expect(summary).toMatchObject({
    amount: 449,
    avgRate: "44.9",
    avgRateDaily: "449",
  });
});

test("average rate truncates instead of rounding", () => {
  const summary = getProcurementSummary([
    { date: "2026-10-01", milkQuantity: 10, totalAmount: 442.9 },
  ]);
  expect(summary.avgRate).toBe("44.2");
});

test("summary total uses truncated aggregate average rate times total milk", () => {
  const summary = getProcurementSummary([
    { date: "2026-10-01", milkQuantity: 1, rate: 44.2, totalAmount: 44.2 },
    { date: "2026-10-01", milkQuantity: 1, rate: 44.3, totalAmount: 44.3 },
  ]);
  expect(summary.avgRate).toBe("44.2");
  expect(summary.amount).toBe(88.4);
});

test("payment summaries share weighted quality and expose the average-rate adjustment separately", () => {
  const paid = { milkQuantity: "10", fatPercentage: "4.25", snfPercentage: "8.56", rate: "44.98", paymentStatus: "Paid" };
  const due = { milkQuantity: 90, fatPercentage: 3.75, snfPercentage: 8.10, rate: 45.67, paymentStatus: "Not Paid" };
  expect(getProcurementPaymentSummary([paid, due])).toEqual({
    totalMilk: 100, totalAmount: 4550, avgFat: "3.80", avgSnf: "8.15", avgRate: "45.5",
    paidAmount: 449, dueAmount: 4104, collectionAmount: 4553, rateAdjustment: 3,
  });
  expect(getProcurementPaymentSummary([paid])).toMatchObject({ totalAmount: 449, avgFat: "4.25", avgSnf: "8.56", paidAmount: 449, dueAmount: 0 });
  expect(getProcurementPaymentSummary([])).toMatchObject({ totalAmount: 0, avgFat: "0.00", avgSnf: "0.00", rateAdjustment: 0 });
});
