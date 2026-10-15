export const STOCK_PRODUCTS = [
  { name: "Butter", field: "butter", unit: "kg", priceField: "butterPrice" },
  { name: "Fresh Cream", field: "cream", unit: "kg", priceField: "freshCreamPrice" },
  { name: "Curd", field: "curd", unit: "kg", priceField: "curdPrice" },
  { name: "Ghee", field: "ghee", unit: "L", priceField: "gheePrice" },
  { name: "Soft Paneer", field: "soft_paneer", unit: "kg", priceField: "softPaneerPrice" },
  { name: "Premium Paneer", field: "premium_paneer", unit: "kg", priceField: "premiumPaneerPrice" },
];

export function stockNumber(value) {
  if (value == null || String(value).trim() === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildInventory(balance, thresholds, customers) {
  return STOCK_PRODUCTS.map((product) => {
    const quantity = balance?.[product.field] == null ? 0 : stockNumber(balance[product.field]);
    const minimum = thresholds === null ? null : stockNumber(thresholds?.[product.field]) ?? 0;
    const prices = (customers || []).map((customer) => stockNumber(customer[product.priceField])).filter((price) => price !== null && price >= 0);
    const averagePrice = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null;
    const status = quantity === null ? "Unavailable" : quantity < 0 ? "Negative stock" : quantity === 0 ? "Out of stock" : minimum === null ? "Minimum unavailable" : minimum <= 0 ? "No minimum set" : quantity < minimum ? "Low stock" : "Healthy";
    return {
      ...product, quantity, minimum, averagePrice, status,
      estimatedValue: quantity !== null && averagePrice !== null ? quantity * averagePrice : null,
      needsAttention: ["Negative stock", "Out of stock", "Low stock"].includes(status),
    };
  });
}

export const stockMoney = (value) => value === null ? "—" : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const stockQuantity = (value) => value === null ? "—" : Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
