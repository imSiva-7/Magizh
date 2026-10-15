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
    amount += validNumber(record?.totalAmount);
    weightedFat += quantity * validNumber(record?.fatPercentage);
    weightedSnf += quantity * validNumber(record?.snfPercentage);
    const date = typeof record?.date === "string" ? record.date.slice(0, 10) : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date) dates.add(date);
  }
  const daysWithData = dates.size;
  return {
    milk,
    amount,
    count: rows.length,
    avgRate: (milk ? amount / milk : 0).toFixed(2),
    avgRateDaily: (daysWithData ? amount / daysWithData : 0).toFixed(0),
    avgMilkDaily: (daysWithData ? milk / daysWithData : 0).toFixed(2),
    avgFat: (Math.round((milk ? weightedFat / milk : 0) * 10) / 10).toFixed(1),
    avgSnf: (Math.round((milk ? weightedSnf / milk : 0) * 10) / 10).toFixed(1),
    daysWithData,
  };
}
