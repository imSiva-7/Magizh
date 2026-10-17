import { procurementDaily } from "./supplier-charts";
import { paymentCardTrends } from "./customer-payment-period.mjs";
import { customerDaily } from "./customer-charts";

export function procurementCardTrends(records) {
  const days = procurementDaily(records);
  const values = {
    milk: row => row.milk,
    amount: row => row.amount,
    quality: row => row.milk ? row.fatMilk / row.milk : 0,
    rate: row => row.milk ? row.amount / row.milk : 0,
  };
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, days.map(row => ({ date: row.date, value: value(row) }))]));
}

export function orderCardTrends(customers) {
  const trends = paymentCardTrends(customers);
  const orders = new Map(trends.totalOrders.map(point => [point.date, point.value]));
  trends.averageOrder = trends.totalAmount.map(point => ({ date: point.date, value: orders.get(point.date) ? point.value / orders.get(point.date) : 0 }));
  const counts = new Map();
  for (const customer of customers) for (const row of customer.receiptsDaily || []) {
    counts.set(row.date, (counts.get(row.date) || 0) + (row.receiptCount || 0));
  }
  trends.receiptCount = [...counts].map(([date, value]) => ({ date, value }));
  return trends;
}

export function customerAccountTrends(records, payments, balance) {
  const days = new Map(customerDaily(records).map(row => [row.date, { ...row, received: 0 }]));
  const knownPayments = Array.isArray(payments);
  for (const payment of payments || []) {
    const date = new Date(payment.date);
    if (!Number.isFinite(date.getTime()) || !Number.isFinite(Number(payment.amount))) continue;
    const key = date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    if (!days.has(key)) days.set(key, { date: key, orders: 0, amount: 0, received: 0 });
    days.get(key).received += Math.round(Number(payment.amount) * 100);
  }
  const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const cents = value => Math.round((Number(value) || 0) * 100);
  // Preserve earlier opening amounts that have no dated entries in the ledger.
  let sales = cents(balance?.totalAmount) - rows.reduce((sum, row) => sum + cents(row.amount), 0);
  let received = cents(balance?.paidAmount) - rows.reduce((sum, row) => sum + row.received, 0);
  let count = (balance?.totalOrders || 0) - rows.reduce((sum, row) => sum + row.orders, 0);
  const trends = { orders: [], sales: [], received: [], due: [] };
  for (const row of rows) {
    sales += cents(row.amount); received += row.received; count += row.orders;
    trends.orders.push({ date: row.date, value: count });
    trends.sales.push({ date: row.date, value: sales / 100 });
    if (knownPayments) {
      trends.received.push({ date: row.date, value: received / 100 });
      trends.due.push({ date: row.date, value: (sales - received) / 100 });
    }
  }
  return trends;
}
