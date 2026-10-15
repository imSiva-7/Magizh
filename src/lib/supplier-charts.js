const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
export function procurementDaily(records = []) {
  const days = new Map();
  for (const record of records) {
    const date = String(record.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!days.has(date)) days.set(date, { date, milk: 0, amount: 0, paid: 0, due: 0, fatMilk: 0, snfMilk: 0 });
    const row = days.get(date), milk = numeric(record.milkQuantity), amount = numeric(record.totalAmount);
    row.milk += milk; row.amount += amount; row[record.paymentStatus === "Paid" ? "paid" : "due"] += amount;
    row.fatMilk += milk * numeric(record.fatPercentage); row.snfMilk += milk * numeric(record.snfPercentage);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function supplierChartSeries(daily = [], filters = {}) {
  const valid = daily.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date || "")).sort((a, b) => a.date.localeCompare(b.date));
  const inRange = valid.filter((row) => (!filters.startDate || row.date >= filters.startDate) && (!filters.endDate || row.date <= filters.endDate));
  if (!inRange.length) return { rows: [], monthly: false };
  const start = filters.startDate || inRange[0].date, end = filters.endDate || inRange.at(-1).date;
  const monthly = (Date.parse(end) - Date.parse(start)) / 86400000 > 62;
  const rows = new Map();
  const cursor = new Date(`${monthly ? `${start.slice(0, 7)}-01` : start}T00:00:00Z`), last = new Date(`${end}T00:00:00Z`);
  // Bound rendering even if a malformed external URL supplies a huge range.
  while (cursor <= last && rows.size < 1200) {
    const date = cursor.toISOString().slice(0, monthly ? 7 : 10);
    rows.set(date, { date, milk: 0, amount: 0, paid: 0, due: 0, fatMilk: 0, snfMilk: 0 });
    if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1); else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  for (const source of inRange) {
    const row = rows.get(source.date.slice(0, monthly ? 7 : 10)); if (!row) continue;
    const milk = numeric(source.milk);
    for (const key of ["milk", "amount", "paid", "due"]) row[key] += numeric(source[key]);
    row.fatMilk += source.fatMilk == null ? milk * numeric(source.avgFat) : numeric(source.fatMilk);
    row.snfMilk += source.snfMilk == null ? milk * numeric(source.avgSnf) : numeric(source.snfMilk);
  }
  return { monthly, rows: [...rows.values()].map((row) => ({ ...row, avgFat: row.milk > 0 ? row.fatMilk / row.milk : null, avgSnf: row.milk > 0 ? row.snfMilk / row.milk : null })) };
}
