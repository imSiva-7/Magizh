"use client";
import PageHeading from "@/components/PageHeading";

import { useState, useEffect } from "react";
import CustomerCharts from "@/components/CustomerCharts";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { getPreviousMonthDate, getTodayDate } from "@/utils/dateUtils";
import { formatNumberWithCommas } from "@/utils/formatNumberWithComma";
import styles from "@/css/analytics.module.css";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];

const getFormattedDateRange = (startDate, endDate) => {
  if (startDate && endDate) {
    const from = new Date(startDate).toLocaleDateString("en-IN");
    const to = new Date(endDate).toLocaleDateString("en-IN");
    return from === to ? from : `${from} – ${to}`;
  }
  if (startDate) return `From ${new Date(startDate).toLocaleDateString("en-IN")}`;
  if (endDate) return `Till ${new Date(endDate).toLocaleDateString("en-IN")}`;
  return "All Records";
};

export default function CustomerAnalyticsPage() {
  const [dateRange, setDateRange] = useState({
    startDate: getPreviousMonthDate(),
    endDate: getTodayDate()
  });
  const [data, setData] = useState({
    daily: [],
    products: [],
    payment: [],
    overall: {}
  });
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams(dateRange);
        const res = await fetch(`/api/analytics/customers?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        if (!controller.signal.aborted) setData(json);
      } catch (error) {
        if (!controller.signal.aborted) setError("Customer analytics could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    fetchData();
    return () => controller.abort();
  }, [dateRange, reload]);

  const handleDateChange = (e) => {
    setDateRange(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const resetDateRange = () => {
    setDateRange({
      startDate: getPreviousMonthDate(),
      endDate: getTodayDate()
    });
  };

  return (
    <div className={styles.page_container}>
      {/* Header */}
      <div className={styles.header}>
        <PageHeading title="Customer Analytics" section="BUSINESS INSIGHTS" description="Understand sales trends, product demand, and customer payment patterns." />
      </div>

      {/* Filter Section */}
      <div className={styles.filter_section}>
        <div className={styles.filter_title}>
          <h2>Filter by Date Range</h2>
        </div>
        <div className={styles.date_input_group}>
          <div className={styles.date_field}>
            <label htmlFor="startDate">From Date</label>
            <input
              type="date"
              id="startDate"
              name="startDate"
              value={dateRange.startDate}
              onChange={handleDateChange}
              max={dateRange.endDate || getTodayDate()}
              className={styles.date_input}
            />
          </div>
          <div className={styles.date_field}>
            <label htmlFor="endDate">To Date</label>
            <input
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
        <div className={styles.filter_actions}>
          <button
            type="button"
            onClick={resetDateRange}
            className={`${styles.btn} ${styles.btn_primary}`}
          >
            Reset
          </button>
        </div>
      </div>

      <CustomerCharts daily={data.daily} filters={dateRange} loading={loading} error={error} onRetry={() => setReload(value => value + 1)} />

      {error ? null : loading ? (
        <div className={styles.loading_container}>
          <div className={styles.spinner}></div>
          <span className={styles.loading_text}>Loading analytics...</span>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          {data.overall && (
            <div className={styles.summary_card}>
              <div className={styles.summary_header}>
                <h2>Summary</h2>
                <span className={styles.date_range_badge}>
                  {getFormattedDateRange(dateRange.startDate, dateRange.endDate)}
                </span>
              </div>
              <div className={styles.stats_grid}>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Total Orders</div>
                  <div className={styles.stat_value}>
                    {formatNumberWithCommas(data.overall.totalOrders || 0)}
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Total Items</div>
                  <div className={styles.stat_value}>
                    {formatNumberWithCommas(data.overall.totalItems || 0)}
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Total Amount</div>
                  <div className={styles.stat_value}>
                    ₹{formatNumberWithCommas(data.overall.totalAmount || 0)}
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Paid</div>
                  <div className={`${styles.stat_value} ${styles.text_green}`}>
                    ₹{formatNumberWithCommas(data.overall.paidAmount || 0)}
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Due</div>
                  <div className={`${styles.stat_value} ${styles.text_red}`}>
                    ₹{formatNumberWithCommas(data.overall.dueAmount || 0)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Product Breakdown Pie Chart */}
          {data.products.length > 0 && (
            <div className={styles.chart_card}>
              <h3>Product Sales (by Amount)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.products}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="amount"
                    nameKey="name"
                  >
                    {data.products.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Payment Status Pie Chart */}
          {data.payment.length > 0 && (
            <div className={styles.chart_card}>
              <h3>Payment Status</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.payment}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="count"
                    nameKey="status"
                  >
                    {data.payment.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
