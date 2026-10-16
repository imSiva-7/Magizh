"use client";
import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { customerDaily, customerChartSeries } from "@/lib/customer-charts";
import { getCurrentMonthStartDate, getTodayDate } from "@/utils/dateUtils";
import styles from "@/app/page.module.css";
import local from "@/css/supplier-charts.module.css";

const quantity = value => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const money = value => `₹${quantity(value)}`;
const short = value => Math.abs(value) >= 100000 ? `${(value / 100000).toFixed(1)}L` : Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : quantity(value);
const label = date => new Date(`${date.length === 7 ? `${date}-01` : date}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", ...(date.length === 7 ? { year: "2-digit" } : { day: "numeric" }), timeZone: "UTC" });

export default function CustomerCharts({ records, daily = [], filters = {}, loading = false, error = "", onRetry }) {
  const [metric, setMetric] = useState("amount");
  const id = useId().replaceAll(":", "");
  const { rows, monthly } = useMemo(() => customerChartSeries(records ? customerDaily(records) : daily, filters), [records, daily, filters]);
  const fallback = <div className={styles.chartEmpty}>{loading ? <span role="status">Loading customer charts…</span> : error ? <div role="alert"><p>{error}</p>{onRetry && <button type="button" className={local.retry} onClick={onRetry}>Retry charts</button>}</div> : "No orders in this date range."}</div>;
  const axes = <><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="date" tickFormatter={label} tickLine={false} axisLine={false} minTickGap={28} tick={{ fontSize: 11 }} /><YAxis tickFormatter={short} allowDecimals={metric !== "orders"} tickLine={false} axisLine={false} width={62} tick={{ fontSize: 11 }} /><Tooltip labelFormatter={label} formatter={(value, name) => [metric === "amount" ? money(value) : quantity(value), name]} /></>;
  const table = (payments) => <details className={styles.chartDetails}><summary>View {payments ? "order payment" : "sales"} chart data</summary><div className={`${styles.tableWrapper} ${local.data}`}><table className={styles.chartTable}><caption>{payments ? "Order payment status in rupees" : "Customer sales for the selected period"}</caption><thead><tr><th scope="col">Period</th>{(payments ? ["Paid", "Due"] : ["Orders", "Sales value"]).map(name => <th scope="col" key={name}>{name}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.date}><th scope="row">{row.date}</th><td>{payments ? money(row.paid) : quantity(row.orders)}</td><td>{money(payments ? row.due : row.amount)}</td></tr>)}</tbody></table></div></details>;
  return <div className={`${styles.chartGrid} ${local.grid}`}>
    <section className={styles.chartCard} aria-labelledby={`${id}-sales`}>
      <div className={styles.chartHeader}><div><span className={styles.eyebrow}>{monthly ? "MONTHLY" : "DAILY"} TREND</span><h3 id={`${id}-sales`}>{metric === "amount" ? "Sales value" : "Customer orders"}</h3></div><div className={local.controls} role="group" aria-label="Sales chart metric">{[["amount", "Value"], ["orders", "Orders"]].map(([value, name]) => <button key={value} type="button" aria-pressed={metric === value} onClick={() => setMetric(value)}>{name}</button>)}</div></div>
      <p className={styles.chartDescription}>Orders and saved sales amounts in the selected period.</p>
      {loading || error || !rows.length ? fallback : <><div className={styles.chartCanvas} data-testid="customer-trend-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height: 280 }}><AreaChart data={rows} accessibilityLayer margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>{axes}<defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#27795d" stopOpacity={.22} /><stop offset="100%" stopColor="#27795d" stopOpacity={.02} /></linearGradient></defs><Area dataKey={metric} type="linear" name={metric === "amount" ? "Sales value" : "Orders"} stroke="#27795d" fill={`url(#${id}-fill)`} strokeWidth={2.5} dot={rows.length === 1} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>{table(false)}</>}
    </section>
    <section className={styles.chartCard} aria-labelledby={`${id}-payments`}>
      <div className={styles.chartHeader}><div><span className={styles.eyebrow}>ORDER PAYMENT STATUS</span><h3 id={`${id}-payments`}>Paid & due orders</h3></div></div>
      <p className={styles.chartDescription}>Saved order payment status, grouped by order date. Account payments and credit balances are shown on Customer Payments.</p>
      {loading || error || !rows.length ? fallback : <><div className={styles.chartCanvas} data-testid="customer-payments-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height: 280 }}><BarChart data={rows} accessibilityLayer margin={{ top: 12, right: 12, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="date" tickFormatter={label} minTickGap={28} tick={{ fontSize: 11 }} /><YAxis tickFormatter={short} width={62} tick={{ fontSize: 11 }} /><Tooltip labelFormatter={label} formatter={(value, name) => [money(value), name]} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 16 }} /><Bar dataKey="paid" name="Paid" stackId="payments" fill="#27795d" maxBarSize={36} isAnimationActive={false} /><Bar dataKey="due" name="Due" stackId="payments" fill="#d18b36" maxBarSize={36} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>{table(true)}</>}
    </section>
  </div>;
}

export function CustomerOverviewCharts() {
  const [filters] = useState(() => ({ startDate: getCurrentMonthStartDate(), endDate: getTodayDate() }));
  const [state, setState] = useState({ daily: [], loading: true, error: "" });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/analytics/customers?${new URLSearchParams(filters)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Customer charts could not be loaded.");
      const data = await response.json();
      if (!controller.signal.aborted) setState({ daily: data.daily || [], loading: false, error: "" });
    }).catch(error => { if (!controller.signal.aborted) setState({ daily: [], loading: false, error: error.message }); });
    return () => controller.abort();
  }, [filters, reload]);
  return <><div className={local.overviewHeader}><h2>This month’s customer sales</h2><Link href="/customer/analytics">View customer analytics ↗</Link></div><CustomerCharts {...state} filters={filters} onRetry={() => { setState({ daily: [], loading: true, error: "" }); setReload(value => value + 1); }} /></>;
}
