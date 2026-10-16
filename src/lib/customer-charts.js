import { supplierChartSeries } from "./supplier-charts";
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function customerDaily(records = []) {
  const days = new Map();
  for (const order of records) {
    const date = String(order.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!days.has(date)) days.set(date, { date, orders: 0, amount: 0, paid: 0, due: 0 });
    const row = days.get(date), amount = numeric(order.totalAmount);
    row.orders++;
    row.amount += amount;
    row[order.paymentStatus === "Paid" ? "paid" : "due"] += amount;
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function customerChartSeries(daily = [], filters = {}) {
  const { rows, monthly } = supplierChartSeries(daily.map(row => ({ ...row, milk: row.orders })), filters);
  return { monthly, rows: rows.map(({ date, milk, amount, paid, due }) => ({ date, orders: milk, amount, paid, due })) };
}
