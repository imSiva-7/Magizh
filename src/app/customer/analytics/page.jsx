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
  Cell
} from "recharts";
import { getPreviousMonthDate, getTodayDate } from "@/utils/dateUtils";
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const params = new URLSearchParams(dateRange);
        const res = await fetch(`/api/analytics/customers?${params}`);
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
        <h1 className={styles.page_title}>Customer Analytics</h1>
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
                    {data.overall.totalOrders || 0}
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Total Items</div>
                  <div className={styles.stat_value}>
                    {data.overall.totalItems || 0}
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Total Amount</div>
                  <div className={styles.stat_value}>
                    ₹{(data.overall.totalAmount || 0).toFixed(2)}
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Paid</div>
                  <div className={`${styles.stat_value} ${styles.text_green}`}>
                    ₹{(data.overall.paidAmount || 0).toFixed(2)}
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Due</div>
                  <div className={`${styles.stat_value} ${styles.text_red}`}>
                    ₹{(data.overall.dueAmount || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Daily Orders Line Chart */}
          <div className={styles.chart_card}>
            <h3>Daily Orders</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="orders" stroke="#8884d8" name="Orders" />
                <Line type="monotone" dataKey="items" stroke="#82ca9d" name="Items" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Daily Revenue Bar Chart */}
          <div className={styles.chart_card}>
            <h3>Daily Revenue</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="amount" fill="#8884d8" name="Amount (₹)" />
                <Bar dataKey="paid" fill="#82ca9d" name="Paid (₹)" />
                <Bar dataKey="due" fill="#ff8042" name="Due (₹)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

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