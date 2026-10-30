import { STOCK_PRODUCTS } from "./stock.js";

const catalog = STOCK_PRODUCTS;
const byName = new Map(catalog.map(product => [product.name.toLowerCase(), product]));
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export function productSalesSummary(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const rawName = String(row.name || "Other product").trim();
    const product = byName.get(rawName.toLowerCase());
    const name = product?.name || rawName;
    const unit = product?.unit || (["L", "kg"].includes(row.unit) ? row.unit : null);
    const key = `${name}:${unit}`;
    if (!grouped.has(key)) grouped.set(key, { name, unit, quantityUnits: 0, amountCents: 0 });
    const total = grouped.get(key);
    total.quantityUnits += Math.round(numeric(row.quantity) * 10000);
    total.amountCents += Math.round(numeric(row.amount) * 100);
  }
  const products = [...grouped.values()].map(row => ({ name: row.name, unit: row.unit, quantity: row.quantityUnits / 10000, amount: row.amountCents / 100 }));
  return {
    products,
    litres: [...grouped.values()].filter(row => row.unit === "L").reduce((sum, row) => sum + row.quantityUnits, 0) / 10000,
    kilograms: [...grouped.values()].filter(row => row.unit === "kg").reduce((sum, row) => sum + row.quantityUnits, 0) / 10000,
  };
}
