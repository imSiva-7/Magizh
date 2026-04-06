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
    <div className={styles.page_container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.page_title}>Production Analytics</h1>
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

      {loading ? (
        <div className={styles.loading_container}>
          <div className={styles.spinner}></div>
          <span className={styles.loading_text}>Loading analytics...</span>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          {data.totals && (
            <div className={styles.summary_card}>
              <div className={styles.summary_header}>
                <h2>Summary</h2>
                <span className={styles.date_range_badge}>
                  {getFormattedDateRange(dateRange.startDate, dateRange.endDate)}
                </span>
              </div>
              <div className={styles.stats_grid}>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Total Batches</div>
                  <div className={styles.stat_value}>
                    {data.totals.totalBatches}
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Total Milk</div>
                  <div className={styles.stat_value}>
                    {data.totals.milk?.toFixed(2)} L
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Avg Fat</div>
                  <div className={styles.stat_value}>
                    {data.totals.avgFat}%
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Avg SNF</div>
                  <div className={styles.stat_value}>
                    {data.totals.avgSnf}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Daily Milk Production Line Chart */}
          <div className={styles.chart_card}>
            <h3>Daily Milk Production</h3>
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
          <div className={styles.chart_card}>
            <h3>Fat & SNF Trends</h3>
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
            <div className={styles.chart_card}>
              <h3>Product Breakdown (by Quantity)</h3>
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
          <div className={styles.chart_card}>
            <h3>Product Quantities</h3>
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