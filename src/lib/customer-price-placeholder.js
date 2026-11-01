import { stockMoney, stockNumber } from "./stock";

export function customerPricePlaceholder(rate, average, unit) {
  const price = stockNumber(rate);
  const averagePrice = stockNumber(average);
  return `${price !== null && price > 0 ? `${stockMoney(price)}` : "Price not set"} · Avg ${averagePrice === null ? "unavailable" : stockMoney(Math.round(averagePrice))}`;
}
