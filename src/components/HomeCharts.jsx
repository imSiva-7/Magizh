"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import styles from "@/app/page.module.css";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const shortMoney = (value) => Math.abs(value) >= 100000
  ? `₹${(value / 100000).toFixed(1)}L`
  : Math.abs(value) >= 1000 ? `₹${(value / 1000).toFixed(1)}k` : `₹${value}`;
const dateLabel = (value) => new Date(`${value.length === 7 ? `${value}-01` : value}T00:00:00`).toLocaleDateString("en-IN", {
  month: "short", ...(value.length === 7 ? { year: "2-digit" } : { day: "numeric" }),
});

export default function HomeCharts({ orders, procurements, customerSummary, supplierSummary, filters }) {
  const { trend, monthly } = useMemo(() => {
    const dates = [...orders, ...procurements].map((entry) => String(entry.date || "").slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
    if (!dates.length) return { trend: [], monthly: false };
    const start = filters.startDate || dates[0];
    const end = filters.endDate || dates[dates.length - 1];
    const monthly = (new Date(end) - new Date(start)) / 86400000 > 62;
    const buckets = new Map();
    const cursor = new Date(`${monthly ? `${start.slice(0, 7)}-01` : start}T00:00:00Z`);
    const last = new Date(`${end}T00:00:00Z`);
    while (cursor <= last) {
      const date = cursor.toISOString().slice(0, monthly ? 7 : 10);
      buckets.set(date, { date, sales: 0, procurement: 0 });
      if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      else cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const add = (entries, key) => entries.forEach((entry) => {
      const date = String(entry.date || "").slice(0, monthly ? 7 : 10);
      const bucket = buckets.get(date);
      if (bucket) bucket[key] += Number(entry.totalAmount) || 0;
    });
    add(orders, "sales");
    add(procurements, "procurement");
    return { trend: Array.from(buckets.values()), monthly };
  }, [orders, procurements, filters]);

  const payments = [
    { name: "Customers", paid: Number(customerSummary.paidAmount) || 0, due: Number(customerSummary.dueAmount) || 0 },
    { name: "Suppliers", paid: Number(supplierSummary.paidAmount) || 0, due: Number(supplierSummary.dueAmount) || 0 },
  ];
  const hasPayments = payments.some((entry) => entry.paid > 0 || entry.due > 0);

  return (
    <div className={styles.chartGrid}>
      <section className={styles.chartCard} aria-labelledby="activity-chart-title">
        <div className={styles.chartHeader}>
          <div><span className={styles.eyebrow}>{monthly ? "MONTHLY" : "DAILY"} TREND</span><h3 id="activity-chart-title">Sales & procurement</h3></div>
          <Link href="/customer/analytics">View analytics ↗</Link>
        </div>
        <p className={styles.chartDescription}>Order value compared with the cost of milk procured. Amounts include unpaid records.</p>
        {trend.length ? <>
          <div className={styles.chartCanvas}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height: 280 }}>
              <AreaChart data={trend} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
                <defs><linearGradient id="home-sales-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#27795d" stopOpacity={0.22} /><stop offset="100%" stopColor="#27795d" stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tickFormatter={dateLabel} tickLine={false} axisLine={false} minTickGap={28} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={shortMoney} tickLine={false} axisLine={false} width={65} tick={{ fontSize: 11 }} />
                <Tooltip formatter={money} labelFormatter={dateLabel} contentStyle={{ borderRadius: 12, borderColor: "#dce6df" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                <Area type="linear" dataKey="sales" name="Sales" stroke="#27795d" fill="url(#home-sales-fill)" strokeWidth={2.5} isAnimationActive={false} dot={trend.length === 1} />
                <Area type="linear" dataKey="procurement" name="Milk procurement" stroke="#d18b36" fill="transparent" strokeWidth={2} isAnimationActive={false} dot={trend.length === 1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <details className={styles.chartDetails}><summary>View trend data</summary><div className={styles.tableWrapper}><table className={styles.chartTable}><caption>Sales and milk procurement value in rupees</caption><thead><tr><th scope="col">Period</th><th scope="col">Sales</th><th scope="col">Milk procurement</th></tr></thead><tbody>{trend.map((entry) => <tr key={entry.date}><th scope="row">{entry.date}</th><td>{money(entry.sales)}</td><td>{money(entry.procurement)}</td></tr>)}</tbody></table></div></details>
        </> : <div className={styles.chartEmpty}>No sales or procurement records in this date range.</div>}
      </section>
      <section className={styles.chartCard} aria-labelledby="payments-chart-title">
        <div className={styles.chartHeader}>
          <div><span className={styles.eyebrow}>PAYMENT STATUS</span><h3 id="payments-chart-title">Paid & outstanding</h3></div>
          <Link href="/supplier/analytics">View analytics ↗</Link>
        </div>
        <p className={styles.chartDescription}>Customer receipts and supplier payments for records in the selected period.</p>
        {hasPayments ? <>
          <div className={styles.chartCanvas}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height: 280 }}>
              <BarChart data={payments} layout="vertical" margin={{ top: 24, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={shortMoney} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={85} tick={{ fontSize: 12 }} />
                <Tooltip formatter={money} contentStyle={{ borderRadius: 12, borderColor: "#dce6df" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                <Bar dataKey="paid" name="Paid" stackId="payments" fill="#27795d" barSize={32} isAnimationActive={false} />
                <Bar dataKey="due" name="Outstanding" stackId="payments" fill="#d18b36" barSize={32} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className={styles.chartDetails}><summary>View payment data</summary><div className={styles.tableWrapper}><table className={styles.chartTable}><caption>Payment status in rupees</caption><thead><tr><th scope="col">Account</th><th scope="col">Paid</th><th scope="col">Outstanding</th></tr></thead><tbody>{payments.map((entry) => <tr key={entry.name}><th scope="row">{entry.name}</th><td>{money(entry.paid)}</td><td>{money(entry.due)}</td></tr>)}</tbody></table></div></details>
        </> : <div className={styles.chartEmpty}>No payment amounts in this date range.</div>}
      </section>
    </div>
  );
}
