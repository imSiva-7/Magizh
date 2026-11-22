"use client";

import { useMemo } from "react";
import Link from "next/link";
import { rankCustomerSales } from "@/lib/customer-rankings";
import { formatDateForDisplay } from "@/lib/india-date.mjs";
import { formatStat } from "@/utils/formatNumberWithComma";
import styles from "./Leaderboard.module.css";

export default function CustomerLeaderboard({ totals, customers = [], orders = [], startDate, endDate }) {
  const rankings = useMemo(() => rankCustomerSales(totals, customers, orders), [totals, customers, orders]);
  const period = startDate || endDate ? `${formatDateForDisplay(startDate) || "Beginning"} to ${formatDateForDisplay(endDate) || "Latest"}` : "All time";
  return <section data-fade-up="" className={styles.board} aria-label="Customer sales ranking">
    <div className={styles.heading}><h2>Top customers by total sales</h2><span>{period}</span></div>
    {!rankings.length ? <p className={styles.hint}>No sales to rank in this period.</p> : <ol className={styles.leaders}>
      {rankings.filter(row => row.rank <= 3).map(row => {
        const label = row.rank === 1 ? (row.tied ? "Joint top customer" : "Top customer") : `${row.tied ? "Joint " : ""}#${row.rank}`;
        return <li key={row.customerId}>
          <span className={`${styles.badge} ${row.rank === 1 ? styles.gold : styles.standard}`} data-customer-rank={row.rank}>{row.rank === 1 && <span aria-hidden="true">★ </span>}{label}</span>
          <Link href={`/customer/order?customerId=${encodeURIComponent(row.customerId)}`}>{row.name}</Link>
          <strong title={`₹${row.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>₹{formatStat(row.totalAmount)} <small>sales</small></strong>
          <span className={styles.hint}>{row.totalOrders} {row.totalOrders === 1 ? "order" : "orders"}</span>
        </li>;
      })}
    </ol>}
  </section>;
}
