export const SUBSCRIPTION_PRODUCTS = [
  { name: "Milk", priceKey: "milkPrice" },
  { name: "Butter", priceKey: "butterPrice" },
  { name: "Fresh Cream", priceKey: "freshCreamPrice" },
  { name: "Curd", priceKey: "curdPrice" },
  { name: "Ghee", priceKey: "gheePrice" },
  { name: "Soft Paneer", priceKey: "softPaneerPrice" },
  { name: "Premium Paneer", priceKey: "premiumPaneerPrice" },
];

export const validDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export const nextDate = (value) => new Date(Date.parse(`${value}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
export const scheduledOn = (subscription, date) => date >= subscription.startDate &&
  (!subscription.endDate || date <= subscription.endDate) &&
  subscription.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay()) &&
  !(subscription.skipDates || []).includes(date);

export function subscriptionFields(data, today) {
  if (!validDate(data.startDate) || data.startDate < today) throw new Error("Start date must be today or later");
  if (data.endDate && (!validDate(data.endDate) || data.endDate < data.startDate)) throw new Error("End date must be on or after the start date");
  if (!Array.isArray(data.weekdays) || !data.weekdays.length || data.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error("Select at least one delivery weekday");
  if (!["inclusive", "exclusive"].includes(data.gstType)) throw new Error("Select a valid GST option");
  if (typeof data.affectStockValue !== "boolean") throw new Error("Select whether orders deduct stock");
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > SUBSCRIPTION_PRODUCTS.length) throw new Error("Select at least one product");
  const seen = new Set();
  const items = data.items.map(item => {
    if (!SUBSCRIPTION_PRODUCTS.some(product => product.name === item.product) || seen.has(item.product)) throw new Error("Select each valid product only once");
    seen.add(item.product);
    const quantity = Number(item.quantity), ratePerUnit = Number(item.ratePerUnit);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000 || !Number.isFinite(ratePerUnit) || ratePerUnit <= 0 || ratePerUnit > 1000000) throw new Error("Product quantities and prices must be positive and within limits");
    return { product: item.product, quantity, ratePerUnit };
  });
  return { startDate: data.startDate, endDate: data.endDate || null, weekdays: [...new Set(data.weekdays)].sort(), items, gstType: data.gstType, affectStockValue: data.affectStockValue };
}

export function subscriptionOrder(subscription, customer, date) {
  const items = subscription.items.map(item => ({ ...item, totalAmount: Number((item.quantity * item.ratePerUnit * (subscription.gstType === "exclusive" ? 1.05 : 1)).toFixed(2)) }));
  return { customerId: String(customer._id), customerName: customer.customerName, customerType: customer.customerType,
    date, items, totalAmount: Number(items.reduce((sum, item) => sum + item.totalAmount, 0).toFixed(2)),
    gstType: subscription.gstType, affectStockValue: subscription.affectStockValue,
    paymentStatus: "Not Paid", comment: "Created from customer subscription", actionDoneBy: "Subscription scheduler" };
}
