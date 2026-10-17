"use client";

import { useState } from "react";
import { formatNumberWithCommas, formatStat } from "@/utils/formatNumberWithComma";
import styles from "./CustomerProductSales.module.css";

const quantity = row => `${formatNumberWithCommas(row.quantity, 2)} ${row.unit || "(unit unknown)"}`;
const money = value => `₹${formatStat(value)}`;

export default function CustomerProductSales({ products }) {
  const [metric, setMetric] = useState("amount");
  const rows = products.filter(row => metric === "amount" || row.unit === metric)
    .map(row => ({ ...row, value: metric === "amount" ? row.amount : row.quantity }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const maximum = Math.max(0, ...rows.map(row => row.value));
  const valueLabel = row => metric === "amount" ? money(row.value) : quantity(row);
  return <section className={styles.card} aria-label="Product sales breakdown">
    <div className={styles.heading}><h2>Product sales</h2><div className={styles.controls} role="group" aria-label="Product sales metric">
      {[["amount", "Sales value"], ["L", "Litres sold"], ["kg", "Kilograms sold"]].map(([value, name]) => <button key={value} data-button="toggle" type="button" aria-pressed={metric === value} onClick={() => setMetric(value)}>{name}</button>)}
    </div></div>
    <p className={styles.hint}>Compare sales in rupees, or quantities within the same unit.</p>
    {!rows.length ? <p className={styles.empty}>No {metric === "L" ? "litre" : metric === "kg" ? "kilogram" : "product"} sales in this period.</p> : <ul className={styles.bars} aria-label={metric === "amount" ? "Products by sales value" : `Products sold in ${metric}`}>
      {rows.map(row => <li key={row.name}>
        <div className={styles.barLabel}><span>{row.name}</span><strong>{valueLabel(row)}</strong></div>
        <div className={styles.track} aria-hidden="true"><span style={{ width: `${maximum > 0 ? Math.max(0, row.value / maximum * 100) : 0}%` }} /></div>
        {metric === "amount" && <span className={styles.quantity}>{quantity(row)} sold</span>}
      </li>)}
    </ul>}
    <div className={styles.tableWrapper}><table>
      <caption>Product quantities and sales for the selected period</caption>
      <thead><tr><th scope="col">Product</th><th scope="col">Sold</th><th scope="col">Sales</th></tr></thead>
      <tbody>{products.length ? products.map(row => <tr key={row.name}><th scope="row">{row.name}</th><td>{quantity(row)}</td><td>{money(row.amount)}</td></tr>) : <tr><td colSpan={3}>No products sold in this period.</td></tr>}</tbody>
    </table></div>
  </section>;
}

export function CustomerOrderStatus({ payment }) {
  const maximum = Math.max(0, ...payment.map(row => Number(row.count) || 0));
  return <section className={styles.card} aria-label="Order payment status breakdown">
    <div className={styles.heading}><h2>Order payment status</h2></div>
    <p className={styles.hint}>Number of orders by saved payment status. Actual receipts and balances are on Customer Payments.</p>
    <ul className={styles.bars}>{payment.map(row => <li key={row.status}>
      <div className={styles.barLabel}><span>{row.status || "Unspecified"}</span><strong>{formatStat(row.count)} {Number(row.count) === 1 ? "order" : "orders"}</strong></div>
      <div className={styles.track} aria-hidden="true"><span className={row.status === "Paid" ? "" : styles.unpaid} style={{ width: `${maximum > 0 ? Math.max(0, Number(row.count) / maximum * 100) : 0}%` }} /></div>
    </li>)}</ul>
  </section>;
}
