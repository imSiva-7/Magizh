"use client";
import CalendarInput from "@/components/CalendarInput";
import AdminSummary from "@/components/AdminSummary";
import DataSkeleton from "@/components/DataSkeleton";
import { formatDateForDisplay } from "@/lib/india-date.mjs";

import { formatStat, formatNumberWithCommas } from "@/utils/formatNumberWithComma";
import PageHeading from "@/components/PageHeading";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getCurrentMonthStartDate, getTodayDate } from "@/utils/dateUtils";
import { DAIRY_PRODUCTS } from "@/lib/stock";
import styles from "@/css/analytics.module.css";

const productUnits = {
  ...Object.fromEntries(DAIRY_PRODUCTS.map(({ name, unit }) => [name, unit])),
  Cream: "kg",
};

const getFormattedDateRange = (startDate, endDate) => {
  if (startDate && endDate) {
    const from = formatDateForDisplay(startDate);
    const to = formatDateForDisplay(endDate);
    return from === to ? from : `${from} – ${to}`;
  }
  if (startDate) return `From ${formatDateForDisplay(startDate)}`;
  if (endDate) return `Till ${formatDateForDisplay(endDate)}`;
  return "All Records";
};

export default function ProductionAnalyticsPage() {
  const [dateRange, setDateRange] = useState({
    startDate: getCurrentMonthStartDate(),
    endDate: getTodayDate(),
  });
  const [data, setData] = useState({
    daily: [],
    totals: {},
    products: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        if (dateRange.startDate && dateRange.endDate && dateRange.startDate > dateRange.endDate) throw new Error("From date must be before the to date.");
        const params = new URLSearchParams(dateRange);
        const res = await fetch(`/api/analytics/productions?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error("Production analytics could not be loaded. Please retry.");
        const json = await res.json();
        if (!Array.isArray(json.daily) || !Array.isArray(json.products) || !json.totals) throw new Error("Production analytics returned an invalid response. Please retry.");
        if (!controller.signal.aborted) setData(json);
      } catch (error) {
        if (!controller.signal.aborted) setError(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    fetchData();
    return () => controller.abort();
  }, [dateRange, reload]);

  const handleDateChange = (e) => {
    setDateRange((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const resetDateRange = () => {
    setDateRange({
      startDate: getCurrentMonthStartDate(),
      endDate: getTodayDate(),
    });
  };

  return (
    <div className={styles.page_container}>
      {/* Header */}
      <div className={styles.header}>
        <PageHeading title="Production Analytics" section="BUSINESS INSIGHTS" />
      </div>

      {/* Filter Section */}
      <AdminSummary><div data-filter="card" className={styles.filter_section}>
        <div data-filter="title" className={styles.filter_title}>
          <h2>Filter by Date Range</h2>
        </div>
        <div data-filter="grid" className={styles.date_input_group}>
          <div data-filter="field" className={styles.date_field}>
            <label htmlFor="startDate">From Date</label>
            <CalendarInput
              type="date"
              id="startDate"
              name="startDate"
              value={dateRange.startDate}
              onChange={handleDateChange}
              max={dateRange.endDate || getTodayDate()}
              className={styles.date_input}
            />
          </div>
          <div data-filter="field" className={styles.date_field}>
            <label htmlFor="endDate">To Date</label>
            <CalendarInput
              type="date"
              id="endDate"
              name="endDate"
              value={dateRange.endDate}
              onChange={handleDateChange}
              min={dateRange.startDate}
              max={getTodayDate()}
              className={styles.date_input}
            />
          </div>
        </div>
        <div data-filter="actions" className={styles.filter_actions}>
          <button data-button="secondary"
            type="button"
            onClick={resetDateRange}
            className={`${styles.btn} ${styles.btn_primary}`}
          >
            Reset
          </button>
          <button
            data-button="secondary"
            type="button"
            onClick={() => setDateRange({ startDate: "", endDate: "" })}
            className={`${styles.btn} ${styles.btn_primary}`}
          >
            Clear
          </button>
          <button
            data-button="secondary"
            type="button"
            onClick={() => {
              const today = getTodayDate();
              setDateRange({ startDate: today, endDate: today });
            }}
            className={`${styles.btn} ${styles.btn_primary}`}
          >
            Today
          </button>
        </div>
      </div></AdminSummary>

      {error ? (
        <div className={styles.empty_state} role="alert">
          <p>{error}</p>
          <button data-button="secondary" type="button" onClick={() => setReload(value => value + 1)}>Retry analytics</button>
        </div>
      ) : loading ? (
        <DataSkeleton label="Loading analytics..." />
      ) : (
        <>
          {/* Summary Cards */}
          {data.totals && (
            <AdminSummary><div data-fade-up="" className={styles.summary_card}>
              <div className={styles.summary_header}>
                <h2>Summary</h2>
                <span className={styles.date_range_badge}>
                  {getFormattedDateRange(dateRange.startDate, dateRange.endDate)}
                </span>
              </div>
              <div className={styles.stats_grid}>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Batches</div>
                  <div className={styles.stat_value}>
                    {formatStat(data.totals.totalBatches || 0)}
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Milk</div>
                  <div className={styles.stat_value}>
                    {formatNumberWithCommas(data.totals.milk || 0, 2)} <span className={styles.stat_unit}>L</span>
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Avg Fat</div>
                  <div className={styles.stat_value}>
                    {formatNumberWithCommas(data.totals.avgFat || 0, 2)}<span className={styles.stat_unit}>%</span>
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Avg SNF</div>
                  <div className={styles.stat_value}>
                    {formatNumberWithCommas(data.totals.avgSnf || 0, 2)}<span className={styles.stat_unit}>%</span>
                  </div>
                </div>
              </div>
            </div></AdminSummary>
          )}

          {/* Daily Milk Production Line Chart */}
          <div data-fade-up="" className={styles.chart_card}>
            <h3>Daily Milk Production</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.daily} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDateForDisplay} tickLine={false} axisLine={false} minTickGap={24} tick={{ fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} width={55} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="batches" orientation="right" allowDecimals={false} tickLine={false} axisLine={false} width={42} tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={formatDateForDisplay} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="milk"
                  stroke="#8884d8"
                  name="Milk (L)"
                  dot={data.daily.length === 1}
                />
                <Line
                  type="monotone"
                  dataKey="batches"
                  yAxisId="batches"
                  stroke="#82ca9d"
                  name="Batches (right axis)"
                  dot={data.daily.length === 1}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Fat & SNF Trends */}
          <div data-fade-up="" className={styles.chart_card}>
            <h3>Fat & SNF Trends</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.daily} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDateForDisplay} tickLine={false} axisLine={false} minTickGap={24} tick={{ fontSize: 11 }} />
                <YAxis domain={[0, "dataMax"]} tickLine={false} axisLine={false} width={55} tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={formatDateForDisplay} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="fat"
                  stroke="#ff7300"
                  name="Fat %"
                  dot={data.daily.length === 1}
                />
                <Line
                  type="monotone"
                  dataKey="snf"
                  stroke="#387908"
                  name="SNF %"
                  dot={data.daily.length === 1}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Product quantities grouped by their units (no misleading mixed-unit percentages). */}
          <section data-fade-up="" className={styles.chart_card} aria-labelledby="product-quantities-title">
            <h3 id="product-quantities-title">Product Quantities</h3>
            {data.products.length > 0 ? ["kg", "L", ""].map(unit => {
              const products = data.products.filter(product => (productUnits[product.name] || "") === unit);
              return products.length > 0 && (
                <div key={unit} role="group" aria-label={unit ? `Product quantities (${unit})` : "Other product quantities"}>
                  <ResponsiveContainer width="100%" height={Math.max(110, products.length * 44 + 36)}>
                    <BarChart data={products} layout="vertical" accessibilityLayer margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={value => unit ? `${value} ${unit}` : value} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={108} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={value => [`${formatNumberWithCommas(value, 2)}${unit ? ` ${unit}` : ""}`, "Quantity"]} />
                      <Bar dataKey="quantity" fill="#27795d" name="Quantity" maxBarSize={26} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            }) : <div className={styles.empty_state}>No product quantities in this date range.</div>}
          </section>
        </>
      )}
    </div>
  );
}
