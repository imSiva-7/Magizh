export function rankCustomerSales(totals, customers = [], orders = []) {
  const names = new Map(customers.map(row => [String(row._id), row.customerName]));
  for (const order of orders) {
    const id = String(order.customerId || "");
    if (order.customerName && !names.get(id)) names.set(id, order.customerName);
  }
  const sorted = totals.map(row => ({ ...row, cents: Math.round(Number(row.totalAmount) * 100) }))
    .filter(row => row.customerId && row.customerId !== "global" && Number(row.totalOrders) > 0 && Number.isSafeInteger(row.cents) && row.cents > 0)
    .sort((a, b) => b.cents - a.cents || String(a.customerId).localeCompare(String(b.customerId)));
  const ties = new Map();
  for (const row of sorted) ties.set(row.cents, (ties.get(row.cents) || 0) + 1);
  let rank = 0;
  return sorted.map((row, index) => {
    if (!index || row.cents !== sorted[index - 1].cents) rank = index + 1;
    const customerId = String(row.customerId);
    return { customerId, name: names.get(customerId) || `Customer ${customerId.slice(-6)}`, totalAmount: row.cents / 100, totalOrders: Number(row.totalOrders), rank, tied: ties.get(row.cents) > 1 };
  });
}
