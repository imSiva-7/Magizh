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
    <div className={styles.container}>
      <h1 className={styles.title}>Customer Analytics</h1>

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
          {data.overall && (
            <div className={styles.summaryCards}>
              <div className={styles.card}>
                <h3>Total Orders</h3>
                <p>{data.overall.totalOrders}</p>
              </div>
              <div className={styles.card}>
                <h3>Total Items</h3>
                <p>{data.overall.totalItems}</p>
              </div>
              <div className={styles.card}>
                <h3>Total Amount</h3>
                <p>₹{data.overall.totalAmount?.toFixed(2)}</p>
              </div>
              <div className={styles.card}>
                <h3>Paid</h3>
                <p className={styles.textGreen}>₹{data.overall.paidAmount?.toFixed(2)}</p>
              </div>
              <div className={styles.card}>
                <h3>Due</h3>
                <p className={styles.textRed}>₹{data.overall.dueAmount?.toFixed(2)}</p>
              </div>
            </div>
          )}

          {/* Daily Orders Line Chart */}
          <div className={styles.chartCard}>
            <h2>Daily Orders</h2>
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

          {/* Daily Amount Bar Chart */}
          <div className={styles.chartCard}>
            <h2>Daily Revenue</h2>
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
            <div className={styles.chartCard}>
              <h2>Product Sales (by Amount)</h2>
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
            <div className={styles.chartCard}>
              <h2>Payment Status</h2>
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