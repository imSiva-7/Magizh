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

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
];

export default function ProductionAnalyticsPage() {
  const [dateRange, setDateRange] = useState({
    startDate: getPreviousMonthDate(),
    endDate: getTodayDate(),
  });
  const [data, setData] = useState({
    daily: [],
    totals: {},
    products: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const params = new URLSearchParams(dateRange);
        const res = await fetch(`/api/analytics/productions?${params}`);
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
    <div className={styles.container}>
      <h1 className={styles.title}>Production Analytics</h1>

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
        <button onClick={resetDateRange}>Reset</button>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading analytics...</div>
      ) : (
        <>
          {/* Summary Cards */}
          {data.totals && (
            <div className={styles.summaryCards}>
              <div className={styles.card}>
                <h3>Total Batches</h3>
                <p>{data.totals.totalBatches}</p>
              </div>
              <div className={styles.card}>
                <h3>Total Milk</h3>
                <p>{data.totals.milk?.toFixed(2)} L</p>
              </div>
              <div className={styles.card}>
                <h3>Avg Fat</h3>
                <p>{data.totals.avgFat}%</p>
              </div>
              <div className={styles.card}>
                <h3>Avg SNF</h3>
                <p>{data.totals.avgSnf}%</p>
              </div>
            </div>
          )}

          {/* Daily Milk Line Chart */}
          <div className={styles.chartCard}>
            <h2>Daily Milk Production</h2>
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
                <Line
                  type="monotone"
                  dataKey="batches"
                  stroke="#82ca9d"
                  name="Batches"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Fat & SNF Trends */}
          <div className={styles.chartCard}>
            <h2>Fat & SNF Trends</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, "dataMax"]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="fat"
                  stroke="#ff7300"
                  name="Fat %"
                />
                <Line
                  type="monotone"
                  dataKey="snf"
                  stroke="#387908"
                  name="SNF %"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Product Breakdown Pie Chart */}
          {data.products.length > 0 && (
            <div className={styles.chartCard}>
              <h2>Product Breakdown (by Quantity)</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.products}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="quantity"
                    nameKey="name"
                  >
                    {data.products.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Product Quantities Bar Chart */}
          <div className={styles.chartCard}>
            <h2>Product Quantities</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.products}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="quantity" fill="#8884d8" name="Quantity" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}