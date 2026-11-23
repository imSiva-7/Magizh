import { stockMoney, stockNumber } from "./stock";

export function customerQuantityLabel(name, unit) {
  return `${name} Quantity (${unit === "kg" ? "Kg" : unit})`;
}

export function customerPricePlaceholder(rate, average) {
  const price = stockNumber(rate);
  const averagePrice = stockNumber(average);
  return `Rate: ${price !== null && price > 0 ? stockMoney(price) : "Not set"} · Avg Rate: ${averagePrice === null ? "Unavailable" : stockMoney(Math.round(averagePrice))}`;
}
