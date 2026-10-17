"use client";
import { formatStat, formatNumberWithCommas } from "@/utils/formatNumberWithComma";
import PageHeading from "@/components/PageHeading";
import SupplierCharts from "@/components/SupplierCharts";
import { useState, useEffect } from "react";
import { getCurrentMonthStartDate, getTodayDate } from "@/utils/dateUtils";
import styles from "@/css/analytics.module.css";

const initialRange = () => ({ startDate: getCurrentMonthStartDate(), endDate: getTodayDate() });
const periodLabel = ({ startDate, endDate }) => startDate && endDate ? `${startDate} to ${endDate}` : startDate ? `From ${startDate}` : endDate ? `Through ${endDate}` : "All records";

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState(initialRange);
  const [data, setData] = useState({ daily: [], overall: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function fetchData() {
      setLoading(true); setError("");
      try {
        if (dateRange.startDate && dateRange.endDate && dateRange.startDate > dateRange.endDate) throw new Error("From date must be before the to date.");
        const response = await fetch(`/api/analytics/procurements?${new URLSearchParams(dateRange)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Supplier analytics could not be loaded. Please retry.");
        const json = await response.json();
        if (!Array.isArray(json.daily)) throw new Error("Supplier analytics returned an invalid response.");
        if (!controller.signal.aborted) setData(json);
      } catch (error) {
        if (!controller.signal.aborted) { setError(error.message); setData({ daily: [], overall: {} }); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    fetchData(); return () => controller.abort();
  }, [dateRange, reload]);
  return <div className={styles.page_container}>
    <div className={styles.header}><PageHeading title="Supplier Analytics" section="BUSINESS INSIGHTS" description="Explore milk procurement, quality trends, and supplier performance." /></div>
    <div data-filter="card" className={styles.filter_section}>
      <div data-filter="title" className={styles.filter_title}><h2>Filter by Date Range</h2></div>
      <div data-filter="grid" className={styles.date_input_group}>
        <div data-filter="field" className={styles.date_field}><label htmlFor="startDate">From Date</label><input type="date" id="startDate" name="startDate" value={dateRange.startDate} onChange={(event) => setDateRange((previous) => ({ ...previous, startDate: event.target.value }))} max={dateRange.endDate || getTodayDate()} className={styles.date_input} /></div>
        <div data-filter="field" className={styles.date_field}><label htmlFor="endDate">To Date</label><input type="date" id="endDate" name="endDate" value={dateRange.endDate} onChange={(event) => setDateRange((previous) => ({ ...previous, endDate: event.target.value }))} min={dateRange.startDate} max={getTodayDate()} className={styles.date_input} /></div>
      </div>
      <div data-filter="actions" className={styles.filter_actions}><button data-button="secondary" type="button" onClick={() => setDateRange(initialRange())} className={`${styles.btn} ${styles.btn_primary}`}>Reset</button></div>
    </div>
    {!loading && !error && <div className={styles.summary_card}><div className={styles.summary_header}><h2>Summary</h2><span className={styles.date_range_badge}>{periodLabel(dateRange)}</span></div><div className={styles.stats_grid}>{[["Milk", `${formatNumberWithCommas(data.overall?.totalMilk || 0, 2)} L`], ["Value", `₹${formatStat(data.overall?.totalAmount || 0)}`], ["Entries", formatStat(data.overall?.totalRecords || 0)], ["Paid", `₹${formatStat(data.overall?.paidAmount || 0)}`], ["Due", `₹${formatStat(data.overall?.dueAmount || 0)}`]].map(([name, value]) => <div className={styles.stat_item} key={name}><div className={styles.stat_label}>{name}</div><div className={styles.stat_value}>{value}</div></div>)}</div></div>}
    <SupplierCharts daily={data.daily} filters={dateRange} loading={loading} error={error} onRetry={() => setReload((value) => value + 1)} />
  </div>;
}
