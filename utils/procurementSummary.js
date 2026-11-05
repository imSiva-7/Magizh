import {
  procurementAggregatePricing,
  procurementPricing,
} from "../src/lib/procurement-pricing.mjs";

const validNumber = (value) => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return 0;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

// Milk-quality averages reflect the blend collected, so larger collections carry
// proportionally more weight. Daily averages use dates with collection records.
export function getProcurementSummary(records = []) {
  const rows = Array.isArray(records) ? records : [];
  const dates = new Set();
  let milk = 0, amount = 0, weightedFat = 0, weightedSnf = 0;
  for (const record of rows) {
    const quantity = validNumber(record?.milkQuantity);
    milk += quantity;
    amount += validNumber(procurementPricing(record).totalAmount);
    weightedFat += quantity * validNumber(record?.fatPercentage);
    weightedSnf += quantity * validNumber(record?.snfPercentage);
    const date = typeof record?.date === "string" ? record.date.slice(0, 10) : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date) dates.add(date);
  }
  const daysWithData = dates.size;
  const aggregatePricing = procurementAggregatePricing(amount, milk);
  amount = aggregatePricing.totalAmount;
  return {
    milk,
    amount,
    count: rows.length,
    avgRate: aggregatePricing.avgRate.toFixed(1),
    avgRateDaily: (daysWithData ? amount / daysWithData : 0).toFixed(0),
    avgMilkDaily: (daysWithData ? milk / daysWithData : 0).toFixed(2),
    avgFat: (milk ? weightedFat / milk : 0).toFixed(2),
    avgSnf: (milk ? weightedSnf / milk : 0).toFixed(2),
    daysWithData,
  };
}

// Payment status refers to individual collections; the summary's average-rate
// adjustment is reported separately and never changes a recorded payment.
export function getProcurementPaymentSummary(records = []) {
  const rows = Array.isArray(records) ? records : [];
  const summary = getProcurementSummary(rows);
  let paidAmount = 0, dueAmount = 0;
  for (const row of rows) {
    const amount = procurementPricing(row).totalAmount;
    if (row.paymentStatus === "Paid") paidAmount += amount;
    else dueAmount += amount;
  }
  const round = value => Math.round(value * 100) / 100;
  return {
    totalMilk: summary.milk,
    totalAmount: summary.amount,
    avgFat: summary.avgFat,
    avgSnf: summary.avgSnf,
    avgRate: summary.avgRate,
    paidAmount: round(paidAmount),
    dueAmount: round(dueAmount),
    collectionAmount: round(paidAmount + dueAmount),
    rateAdjustment: round(paidAmount + dueAmount - summary.amount),
  };
}
