"use client";
import { useId, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { procurementDaily, supplierChartSeries } from "@/lib/supplier-charts";
import { getCurrentMonthStartDate, getTodayDate } from "@/utils/dateUtils";
import styles from "@/app/page.module.css";
import local from "@/css/supplier-charts.module.css";

const quantity = (value) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const money = (value) => `₹${quantity(value)}`;
const short = (value) => Math.abs(value) >= 100000 ? `${(value / 100000).toFixed(1)}L` : Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : quantity(value);
const label = (date) => new Date(`${date.length === 7 ? `${date}-01` : date}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", ...(date.length === 7 ? { year: "2-digit" } : { day: "numeric" }), timeZone: "UTC" });
const tooltipStyle = { borderRadius: 12, borderColor: "#dce6df" };

export default function SupplierCharts({ records, daily = [], filters = {}, loading = false, error = "", onRetry }) {
  const [metric, setMetric] = useState("milk");
  const id = useId().replaceAll(":", "");
  const { rows, monthly } = useMemo(() => supplierChartSeries(records ? procurementDaily(records) : daily, filters), [records, daily, filters]);
  const title = metric === "milk" ? "Milk collections" : metric === "amount" ? "Procurement value" : "FAT & SNF";
  const hasPayments = rows.some((row) => row.paid > 0 || row.due > 0);
  const fallback = (message = "No procurement records in this date range.") => <div className={styles.chartEmpty}>{loading ? <span role="status">Loading procurement charts…</span> : error ? <div role="alert"><p>{error}</p>{onRetry && <button className={local.retry} type="button" onClick={onRetry}>Retry charts</button>}</div> : message}</div>;
  const axes = <><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="date" tickFormatter={label} tickLine={false} axisLine={false} minTickGap={28} tick={{ fontSize: 11 }} /><YAxis tickFormatter={metric === "amount" ? (value) => `₹${short(value)}` : short} tickLine={false} axisLine={false} width={62} tick={{ fontSize: 11 }} /><Tooltip labelFormatter={label} formatter={(value, name) => [metric === "quality" ? `${quantity(value)}%` : metric === "amount" ? money(value) : `${quantity(value)} L`, name]} contentStyle={tooltipStyle} /></>;
  return <div className={`${styles.chartGrid} ${local.grid}`}>
    <section className={styles.chartCard} aria-labelledby={`${id}-trend-title`}>
      <div className={styles.chartHeader}><div><span className={styles.eyebrow}>{monthly ? "MONTHLY" : "DAILY"} TREND</span><h3 id={`${id}-trend-title`}>{title}</h3></div><div className={local.controls} role="group" aria-label="Collection chart metric">{[["milk", "Milk"], ["amount", "Value"], ["quality", "Quality"]].map(([value, name]) => <button key={value} type="button" aria-pressed={metric === value} onClick={() => setMetric(value)}>{name}</button>)}</div></div>
      <p className={styles.chartDescription}>{metric === "quality" ? "FAT and SNF are weighted by milk quantity. Days without collections have no quality reading." : metric === "amount" ? "Saved procurement amounts, including paid and unpaid collections." : "Milk received across AM and PM collections in the selected period."}</p>
      {loading || error || !rows.length ? fallback() : <>
        <div className={styles.chartCanvas} data-testid="supplier-trend-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height: 280 }}>{metric === "quality" ? <LineChart data={rows} accessibilityLayer margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>{axes}<Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 16 }} /><Line type="linear" dataKey="avgFat" name="FAT" stroke="#27795d" strokeWidth={2.5} dot={rows.length === 1} connectNulls={false} isAnimationActive={false} /><Line type="linear" dataKey="avgSnf" name="SNF" stroke="#d18b36" strokeWidth={2.5} dot={rows.length === 1} connectNulls={false} isAnimationActive={false} /></LineChart> : <AreaChart data={rows} accessibilityLayer margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>{axes}<defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#27795d" stopOpacity={.22} /><stop offset="100%" stopColor="#27795d" stopOpacity={.02} /></linearGradient></defs><Area type="linear" dataKey={metric} name={metric === "milk" ? "Milk" : "Value"} stroke="#27795d" fill={`url(#${id}-fill)`} strokeWidth={2.5} dot={rows.length === 1} isAnimationActive={false} /></AreaChart>}</ResponsiveContainer></div>
        <details className={styles.chartDetails}><summary>View collection chart data</summary><div className={`${styles.tableWrapper} ${local.data}`}><table className={styles.chartTable}><caption>Collections and quantity-weighted quality for the selected period</caption><thead><tr><th scope="col">Period</th><th scope="col">Milk (L)</th><th scope="col">Value</th><th scope="col">FAT %</th><th scope="col">SNF %</th></tr></thead><tbody>{rows.map((row) => <tr key={row.date}><th scope="row">{row.date}</th><td>{quantity(row.milk)}</td><td>{money(row.amount)}</td><td>{row.avgFat == null ? "—" : quantity(row.avgFat)}</td><td>{row.avgSnf == null ? "—" : quantity(row.avgSnf)}</td></tr>)}</tbody></table></div></details>
      </>}
    </section>
    <section className={styles.chartCard} aria-labelledby={`${id}-payment-title`}>
      <div className={styles.chartHeader}><div><span className={styles.eyebrow}>PAYMENT STATUS</span><h3 id={`${id}-payment-title`}>Paid & due</h3></div></div>
      <p className={styles.chartDescription}>Current payment status of collections in the selected period, grouped by collection date.</p>
      {loading || error || !hasPayments ? fallback() : <><div className={styles.chartCanvas} data-testid="supplier-payments-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height: 280 }}><BarChart data={rows} accessibilityLayer margin={{ top: 12, right: 12, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="date" tickFormatter={label} tickLine={false} axisLine={false} minTickGap={28} tick={{ fontSize: 11 }} /><YAxis tickFormatter={(value) => `₹${short(value)}`} tickLine={false} axisLine={false} width={62} tick={{ fontSize: 11 }} /><Tooltip formatter={(value, name) => [money(value), name]} labelFormatter={label} contentStyle={tooltipStyle} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 16 }} /><Bar dataKey="paid" name="Paid" stackId="payments" fill="#27795d" maxBarSize={36} isAnimationActive={false} /><Bar dataKey="due" name="Due" stackId="payments" fill="#d18b36" maxBarSize={36} isAnimationActive={false} /></BarChart></ResponsiveContainer></div><details className={styles.chartDetails}><summary>View payment chart data</summary><div className={`${styles.tableWrapper} ${local.data}`}><table className={styles.chartTable}><caption>Payment status of selected collections in rupees</caption><thead><tr><th scope="col">Period</th><th scope="col">Paid</th><th scope="col">Due</th></tr></thead><tbody>{rows.map((row) => <tr key={row.date}><th scope="row">{row.date}</th><td>{money(row.paid)}</td><td>{money(row.due)}</td></tr>)}</tbody></table></div></details></>}
    </section>
  </div>;
}

export function SupplierOverviewCharts() {
  const [filters] = useState(() => ({ startDate: getCurrentMonthStartDate(), endDate: getTodayDate() }));
  const [state, setState] = useState({ daily: [], loading: true, error: "" });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/analytics/procurements?${new URLSearchParams(filters)}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Procurement charts could not be loaded.");
      const data = await response.json();
      if (!controller.signal.aborted) setState({ daily: Array.isArray(data.daily) ? data.daily : [], loading: false, error: "" });
    }).catch((error) => { if (!controller.signal.aborted) setState({ daily: [], loading: false, error: error.message }); });
    return () => controller.abort();
  }, [filters, reload]);
  return <><div className={local.overviewHeader}><h2>This month’s procurement</h2><Link href="/supplier/analytics">View supplier analytics ↗</Link></div><SupplierCharts {...state} filters={filters} onRetry={() => { setState({ daily: [], loading: true, error: "" }); setReload((value) => value + 1); }} /></>;
}
