"use client";

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
import { getPreviousMonthDate, getTodayDate } from "@/utils/dateUtils";
import styles from "@/css/analytics.module.css";

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

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState({
    startDate: getPreviousMonthDate(),
    endDate: getTodayDate(),
  });
  const [data, setData] = useState({ daily: [], overall: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const params = new URLSearchParams(dateRange);
        const res = await fetch(`/api/analytics/procurements?${params}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [dateRange]);

  const handleDateChange = (e) => {
    setDateRange((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const resetDateRange = () => {
    setDateRange({
      startDate: getPreviousMonthDate(),
      endDate: getTodayDate(),
    });
  };

  return (
    <div className={styles.page_container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.page_title}>Analytics Dashboard</h1>
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

      {/* Summary Cards */}
      {!loading && data.overall && (
        <div className={styles.summary_card}>
          <div className={styles.summary_header}>
            <h2>Summary</h2>
            <span className={styles.date_range_badge}>
              {getFormattedDateRange(dateRange.startDate, dateRange.endDate)}
            </span>
          </div>
          <div className={styles.stats_grid}>
            <div className={styles.stat_item}>
              <div className={styles.stat_label}>Total Milk</div>
              <div className={styles.stat_value}>
                {data.overall.totalMilk?.toFixed(2)} L
              </div>
            </div>
            <div className={styles.stat_item}>
              <div className={styles.stat_label}>Total Amount</div>
              <div className={styles.stat_value}>
                ₹{data.overall.totalAmount?.toFixed(2)}
              </div>
            </div>
            <div className={styles.stat_item}>
              <div className={styles.stat_label}>Total Records</div>
              <div className={styles.stat_value}>
                {data.overall.totalRecords}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      {loading ? (
        <div className={styles.loading_container}>
          <div className={styles.spinner}></div>
          <span className={styles.loading_text}>Loading charts...</span>
        </div>
      ) : (
        <>
          {/* Daily Milk Quantity Line Chart */}
          <div className={styles.chart_card}>
            <h3>Daily Milk Quantity</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="milk"
                  stroke="#8884d8"
                  name="Milk (L)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Fat & SNF Line Chart */}
          <div className={styles.chart_card}>
            <h3>Fat & SNF</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, "dataMax"]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="avgFat"
                  stroke="#ff7300"
                  name="Avg Fat %"
                />
                <Line
                  type="monotone"
                  dataKey="avgSnf"
                  stroke="#387908"
                  name="Avg SNF %"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Daily Total Amount Bar Chart */}
          <div className={styles.chart_card}>
            <h3>Daily Total Amount</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="amount" fill="#82ca9d" name="Amount (₹)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}