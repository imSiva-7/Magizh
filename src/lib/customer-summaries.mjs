export const CUSTOMER_SUMMARIES = "customer_summaries";
const products = { Milk: "milk", Butter: "butter", "Fresh Cream": "freshCream", Curd: "curd", Ghee: "ghee", "Soft Paneer": "softPaneer", "Premium Paneer": "premiumPaneer" };
const number = (value) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error("Order contains an invalid amount or quantity");
  return parsed;
};

// Integer cents and quantity ten-thousandths avoid accumulated floating point drift.
export function orderMetrics(order) {
  const metrics = { orders: 1, items: order.items?.length || 0, amountCents: Math.round(number(order.totalAmount) * 100), paidCents: 0, unpaidCents: 0 };
  metrics[order.paymentStatus === "Paid" ? "paidCents" : "unpaidCents"] = metrics.amountCents;
  for (const product of Object.values(products)) metrics[`${product}Units`] = 0;
  for (const item of order.items || []) {
    const key = products[item.product];
    if (key) metrics[`${key}Units`] += Math.round(number(item.quantity) * 10000);
  }
  if (Object.values(metrics).some((value) => !Number.isSafeInteger(value))) throw new Error("Customer summary exceeds safe numeric range");
  return metrics;
}

export function summaryFromMetrics(customerId, metrics) {
  if (Object.values(metrics).some((value) => !Number.isSafeInteger(value))) throw new Error("Customer summary exceeds safe numeric range");
  return { _id: customerId, customerId, schemaVersion: 1, totalOrders: metrics.orders, totalItems: metrics.items,
    totalAmount: metrics.amountCents / 100, orderPaidAmount: metrics.paidCents / 100, orderDueAmount: metrics.unpaidCents / 100,
    quantities: Object.fromEntries(Object.values(products).map((key) => [key, metrics[`${key}Units`] / 10000])), _metrics: metrics };
}

export function buildCustomerSummary(customerId, orders) {
  const metrics = orderMetrics({ items: [], totalAmount: 0 });
  metrics.orders = 0;
  for (const order of orders) {
    if (String(order.customerId) !== String(customerId)) throw new Error("Cannot mix customers in a summary");
    for (const [key, value] of Object.entries(orderMetrics(order))) metrics[key] += value;
  }
  return summaryFromMetrics(customerId, metrics);
}

// Called after order writes, inside the transaction. Older databases bootstrap
// a missing summary from their current orders; subsequent writes use deltas.
export async function updateCustomerSummaries(db, before = [], after = []) {
  const ids = new Map([...before, ...after].map((order) => [String(order.customerId), order.customerId]));
  for (const [id, customerId] of ids) {
    const existing = await db.collection(CUSTOMER_SUMMARIES).findOne({ _id: customerId });
    let summary;
    if (!existing?._metrics) {
      summary = buildCustomerSummary(customerId, await db.collection("orders").find({ customerId }).toArray());
    } else {
      const metrics = { ...existing._metrics };
      for (const [orders, sign] of [[before, -1], [after, 1]]) for (const order of orders) {
        if (String(order.customerId) !== id) continue;
        for (const [key, value] of Object.entries(orderMetrics(order))) metrics[key] += sign * value;
      }
      summary = summaryFromMetrics(customerId, metrics);
    }
    await db.collection(CUSTOMER_SUMMARIES).replaceOne({ _id: customerId }, { ...summary, updatedAt: new Date() }, { upsert: true });
  }
}
