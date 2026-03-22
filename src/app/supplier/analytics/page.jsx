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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { getPreviousMonthDate, getTodayDate } from "@/utils/dateUtils";
import styles from "@/css/analytics.module.css";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"];

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState({
    startDate: getPreviousMonthDate(),
    endDate: getTodayDate(),
  });
  const [data, setData] = useState({ daily: [], overall: {} });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("procurements"); // "procurements" or "orders"

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

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Analytics Dashboard</h1>

      {/* Date Range Picker */}
      <div className={styles.filterBar}>
        <div className={styles.dateInputGroup}>
          <label>From</label>
          <input
            type="date"
            name="startDate"
            value={dateRange.startDate}
            onChange={handleDateChange}
            max={dateRange.endDate}
          />
        </div>
        <div className={styles.dateInputGroup}>
          <label>To</label>
          <input
            type="date"
            name="endDate"
            value={dateRange.endDate}
            onChange={handleDateChange}
            min={dateRange.startDate}
            max={getTodayDate()}
          />
        </div>
        <button
          onClick={() =>
            setDateRange({
              startDate: getPreviousMonthDate(),
              endDate: getTodayDate(),
            })
          }
        >
          Reset
        </button>
      </div>

      {/* Summary Cards */}
      {!loading && data.overall && (
        <div className={styles.summaryCards}>
          <div className={styles.card}>
            <h3>Total Milk</h3>
            <p>{data.overall.totalMilk?.toFixed(2)} L</p>
          </div>
          <div className={styles.card}>
            <h3>Total Amount</h3>
            <p>₹{data.overall.totalAmount?.toFixed(2)}</p>
          </div>
          <div className={styles.card}>
            <h3>Total Records</h3>
            <p>{data.overall.totalRecords}</p>
          </div>
        </div>
      )}

      {/* Charts */}
      {loading ? (
        <div className={styles.loading}>Loading charts...</div>
      ) : (
        <>
          {/* Daily Milk Line Chart */}
          <div className={styles.chartCard}>
            <h2>Daily Milk Quantity</h2>
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
          <div className={styles.chartCard}>
            <h2>Fat & SNF</h2>
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

          {/* Daily Amount Bar Chart */}
          <div className={styles.chartCard}>
            <h2>Daily Total Amount</h2>
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

          {/* Fat/SNF Trends */}
        </>
      )}
    </div>
  );
}
