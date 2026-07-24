"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/stock.module.css";
import {
  formatNumberWithCommasNoDecimal,
  formatNumberWithCommas,
} from "@/utils/formatNumberWithComma";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// --------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------
const STOCK_PRODUCTS = [
  { name: "Butter", field: "butter", unit: "kg" },
  { name: "Fresh Cream", field: "cream", unit: "kg" },
  { name: "Curd", field: "curd", unit: "kg" },
  { name: "Ghee", field: "ghee", unit: "L" },
  { name: "Soft Paneer", field: "soft_paneer", unit: "kg" },
  { name: "Premium Paneer", field: "premium_paneer", unit: "kg" },
];

const productPriceMap = {
  butter: "butterPrice",
  cream: "freshCreamPrice",
  curd: "curdPrice",
  ghee: "gheePrice",
  soft_paneer: "softPaneerPrice",
  premium_paneer: "premiumPaneerPrice",
};

const INITIAL_ADJUSTMENT = () => {
  const quantities = {};
  STOCK_PRODUCTS.forEach((p) => (quantities[p.field] = ""));
  return { quantities, comment: "" };
};

// --------------------------------------------------------------------
// Main Component
// --------------------------------------------------------------------
export default function StockPage() {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(null);
  const [thresholds, setThresholds] = useState({});
  const [customers, setCustomers] = useState([]);
  const [ledger, setLedger] = useState([]);

  const [showAdjustment, setShowAdjustment] = useState(false);
  const [showThresholds, setShowThresholds] = useState(false);

  // Refs for scrolling
  const adjustmentFormRef = useRef(null);
  const thresholdsFormRef = useRef(null);

  const [adjustment, setAdjustment] = useState(INITIAL_ADJUSTMENT());
  const [submitting, setSubmitting] = useState(false);
  const [savingThresholds, setSavingThresholds] = useState(false);

  const fetchStockData = useCallback(async () => {
    try {
      setLoading(true);
      const [balRes, threshRes, ledgerRes, custRes] = await Promise.all([
        fetch("/api/stock/balance"),
        fetch("/api/stock/thresholds"),
        fetch("/api/stock/ledger?limit=30"),
        fetch("/api/customer"),
      ]);
      if (!balRes.ok) throw new Error("Failed to load stock balance");
      const balData = await balRes.json();
      setBalance(balData);
      if (threshRes.ok) {
        const threshData = await threshRes.json();
        setThresholds(threshData.thresholds || {});
      }
      if (ledgerRes.ok) {
        const ledgerData = await ledgerRes.json();
        setLedger(Array.isArray(ledgerData) ? ledgerData : []);
      } else {
        console.warn("Ledger fetch failed, status:", ledgerRes.status);
      }
      if (custRes.ok) {
        const custData = await custRes.json();
        setCustomers(Array.isArray(custData) ? custData : []);
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStockData();
  }, [fetchStockData]);

  // ------------------------------------------------------------------
  // Average prices & total value
  // ------------------------------------------------------------------
  const averagePrices = {};
  for (const product of STOCK_PRODUCTS) {
    const priceField = productPriceMap[product.field];
    const prices = customers
      .map((c) => c[priceField])
      .filter((p) => p !== null && p !== undefined && !isNaN(p));
    const avg =
      prices.length > 0
        ? prices.reduce((sum, p) => sum + p, 0) / prices.length
        : 0;
    averagePrices[product.field] = avg;
  }

  const totalStockValue = STOCK_PRODUCTS.reduce((sum, product) => {
    const qty = balance ? balance[product.field] || 0 : 0;
    const avgPrice = averagePrices[product.field] || 0;
    return sum + qty * avgPrice;
  }, 0);

  // ------------------------------------------------------------------
  // Summary stat cards – one per product (current quantity)
  // ------------------------------------------------------------------
  const statCards = STOCK_PRODUCTS.map((product) => ({
    label: product.name,
    value: balance
      ? `${(balance[product.field] || 0).toFixed(2)} ${product.unit}`
      : `0.00 ${product.unit}`,
  }));

  // ------------------------------------------------------------------
  // Adjustment handlers
  // ------------------------------------------------------------------
  const handleAdjustmentChange = (field, value) => {
    setAdjustment((prev) => ({
      ...prev,
      quantities: { ...prev.quantities, [field]: value },
    }));
  };

  const handleAdjustmentCommentChange = (value) => {
    setAdjustment((prev) => ({ ...prev, comment: value }));
  };

  const submitAdjustment = async (e) => {
    e.preventDefault();
    const adjustments = [];
    for (const product of STOCK_PRODUCTS) {
      const qty = parseFloat(adjustment.quantities[product.field]);
      if (!isNaN(qty) && qty !== 0) {
        adjustments.push({ product: product.field, quantity: qty });
      }
    }
    if (adjustments.length === 0) {
      return toast.error("Enter at least one non‑zero quantity");
    }
    setSubmitting(true);
    try {
      for (const adj of adjustments) {
        const res = await fetch("/api/stock/adjust", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product: adj.product,
            quantity: adj.quantity,
            comment: adjustment.comment,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      toast.success("Stock adjusted successfully");
      setAdjustment(INITIAL_ADJUSTMENT());
      setShowAdjustment(false);
      fetchStockData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------------------------------------------------
  // Threshold handlers
  // ------------------------------------------------------------------
  const handleThresholdChange = (field, value) => {
    setThresholds((prev) => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  const saveThresholds = async () => {
    setSavingThresholds(true);
    try {
      const res = await fetch("/api/stock/thresholds", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thresholds }),
      });
      if (!res.ok) throw new Error("Failed to save thresholds");
      toast.success("Minimum thresholds saved");
      setShowThresholds(false);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingThresholds(false);
    }
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  if (loading) {
    return (
      <div className={styles.page_container}>
        <div className={styles.loading_container}>
          <div className={styles.spinner}></div>
          <span className={styles.loading_text}>Loading stock data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page_container}>
      <ToastContainer position="top-right" autoClose={3000} />

      {/* ====== Header ====== */}
      <div className={styles.header_content}>
        <h1 className={styles.page_title}>Stock Management</h1>
        <div className={styles.headerActions}>
          <button
            onClick={() => {
              if (showAdjustment) {
                // Close the form
                setShowAdjustment(false);
              } else {
                // Open the form and close thresholds
                setShowAdjustment(true);
                setShowThresholds(false);
                // Scroll to adjustment form after state update
                setTimeout(() => {
                  adjustmentFormRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }, 100);
              }
            }}
            className={styles.primary_btn}
          >
            <span className={styles.plusIcon}>
              {showAdjustment ? "−" : "+"}
            </span>
            {showAdjustment ? "Close Adjustment" : "New Adjustment"}
          </button>
          <button
            onClick={() => {
              if (showThresholds) {
                // Close the form
                setShowThresholds(false);
              } else {
                // Open the form and close adjustment
                setShowThresholds(true);
                setShowAdjustment(false);
                // Scroll to thresholds form after state update
                setTimeout(() => {
                  thresholdsFormRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }, 100);
              }
            }}
            className={styles.primary_btn}
          >
            {showThresholds ? "Close Thresholds" : "Manage Thresholds"}
          </button>
        </div>
      </div>

      {/* ====== Available Stock Card ====== */}
      <div className={styles.global_summary_card}>
        <div className={styles.global_header}>
          <h2 className={styles.global_title}>Available Stock</h2>
        </div>
        <div className={styles.global_stats_grid}>
          {statCards.map((stat, index) => (
            <div key={index} className={styles.stat_card}>
              <div className={styles.stat_card_label}>{stat.label}</div>
              <div className={styles.stat_card_value}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ====== Average Supplier Price Card ====== */}
      <div className={styles.global_summary_card}>
        <div className={styles.global_header}>
          <h2 className={styles.global_title}>Average selling Price</h2>
        </div>
        <div className={styles.global_stats_grid}>
          {STOCK_PRODUCTS.map((product) => (
            <div key={product.field} className={styles.stat_card}>
              <div className={styles.stat_card_label}>{product.name}</div>
              <div className={styles.stat_card_value}>
                ₹{averagePrices[product.field]?.toFixed(1) || "0.00"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ====== Adjustment Form (collapsible) ====== */}
      {showAdjustment && (
        <form
          ref={adjustmentFormRef}
          onSubmit={submitAdjustment}
          className={styles.filter_section}
        >
          <div className={styles.filter_title}>
            <h2>Manual Stock Adjustment</h2>
          </div>
          <div className={styles.formGrid}>
            {STOCK_PRODUCTS.map((product) => (
              <div key={product.field} className={styles.inputGroup}>
                <label>
                  {product.name} ({product.unit})
                </label>
                <input
                  type="number"
                  value={adjustment.quantities[product.field]}
                  onChange={(e) =>
                    handleAdjustmentChange(product.field, e.target.value)
                  }
                  className={styles.input}
                  placeholder="0.00"
                  step="1"
                />
              </div>
            ))}
            <div className={styles.inputGroup} style={{ gridColumn: "1 / -1" }}>
              <label>Comment (applies to all adjustments)</label>
              <input
                type="text"
                value={adjustment.comment}
                onChange={(e) => handleAdjustmentCommentChange(e.target.value)}
                className={styles.input}
                placeholder="Reason for adjustment"
              />
            </div>
          </div>
          <div className={styles.filter_actions}>
            <button
              type="submit"
              disabled={submitting}
              className={styles.primary_btn}
            >
              {submitting ? "Processing..." : "Adjust Stock"}
            </button>
            <button
              type="button"
              onClick={() => setAdjustment(INITIAL_ADJUSTMENT())}
              className={styles.secondary_btn}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setShowAdjustment(false)}
              className={styles.clear_filter_link}
            >
              Close
            </button>
          </div>
        </form>
      )}

      {/* ====== Threshold Form (collapsible) ====== */}
      {showThresholds && (
        <form
          // ref={thresholdsFormRef}
          onSubmit={(e) => e.preventDefault()}
          className={styles.filter_section}
        >
          <div className={styles.filter_title} ref={thresholdsFormRef}>
            <h2>Minimum Stock Thresholds</h2>
          </div>
          <div className={styles.formGrid}>
            {STOCK_PRODUCTS.map((product) => (
              <div key={product.field} className={styles.inputGroup}>
                <label>
                  {product.name} ({product.unit})
                </label>
                <input
                  type="number"
                  value={thresholds[product.field] || ""}
                  onChange={(e) =>
                    handleThresholdChange(product.field, e.target.value)
                  }
                  className={styles.input}
                  placeholder="Min"
                  min="0"
                  step="1"
                />
              </div>
            ))}
          </div>
          <div className={styles.filter_actions}>
            <button
              type="button"
              onClick={saveThresholds}
              disabled={savingThresholds}
              className={styles.primary_btn}
            >
              {savingThresholds ? "Saving..." : "Save Thresholds"}
            </button>
            <button
              type="button"
              onClick={() => setShowThresholds(false)}
              className={styles.clear_filter_link}
            >
              Close
            </button>
          </div>
        </form>
      )}

      {/* ====== Stock Valuation Charts ====== */}
      <div className={styles.tableContainer}>
        <div className={styles.global_summary_card}>
          <div className={styles.global_header}>
            <h2 className={styles.global_title}> Stock Valuation</h2>
          </div>
          <div className={styles.table_wrapper}>
            <table className={styles.procurement_table}>
              <thead>
                <tr className={styles.table_head_row}>
                  <th className={styles.table_header_cell}>Product</th>
                  <th className={styles.table_header_cell}>Min Stock</th>
                  <th className={styles.table_header_cell}>In Stock</th>
                  {/* <th className={styles.table_header_cell}>Avg Price</th> */}
                  <th className={styles.table_header_cell}>Stock Value</th>
                </tr>
              </thead>
              <tbody>
                {STOCK_PRODUCTS.map((product) => {
                  const qty = balance ? balance[product.field] || 0 : 0;
                  const threshold = thresholds[product.field] || 0;
                  const avgPrice = averagePrices[product.field] || 0;
                  const value = qty * avgPrice;
                  const isLow = threshold > 0 && qty < threshold;
                  return (
                    <tr key={product.field} className={styles.table_row}>
                      <td className={styles.table_cell}>{product.name}</td>
                      <td className={styles.table_cell}>{threshold || "-"}</td>
                      <td
                        className={`${styles.table_cell} ${isLow ? styles.text_red : ""}`}
                      >
                        {qty.toFixed(2)} {product.unit}
                        {isLow && (
                          <span className={styles.lowWarning}>
                            {" "}
                            ⚠️ Below min
                          </span>
                        )}
                      </td>
                      {/* <td className={styles.table_cell}>₹{avgPrice.toFixed(2)}</td> */}
                      <td
                        className={`${styles.table_cell} ${styles.cell_total}`}
                      >
                        ₹{formatNumberWithCommasNoDecimal(value.toFixed(2))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={styles.table_row}>
                  <td
                    className={styles.table_cell}
                    colSpan={3}
                    style={{ textAlign: "right", fontWeight: 600 }}
                  >
                    Total Stock Value
                  </td>
                  <td className={`${styles.table_cell} ${styles.cell_total}`}>
                    ₹
                    {formatNumberWithCommasNoDecimal(
                      totalStockValue.toFixed(2),
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div className={styles.global_summary_card}>
          <div className={styles.global_header}>
            <h2 className={styles.global_title}> Stock Valuation</h2>
          </div>
         
        <div style={{ padding: "2rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
              gap: "2rem",
              marginBottom: "2rem",
            }}
          >
            <div
              style={{
                background: "white",
                padding: "1.5rem",
                borderRadius: "1rem",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
              }}
            >
              <h3
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "#1e293b",
                  marginBottom: "1rem",
                  textAlign: "center",
                }}
              >
                Stock Value Distribution
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={STOCK_PRODUCTS.map((product) => ({
                      name: product.name,
                      value: balance
                        ? (balance[product.field] || 0) *
                          (averagePrices[product.field] || 0)
                        : 0,
                    })).filter((item) => item.value > 0)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name}: ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {STOCK_PRODUCTS.map((_, index) => {
                      const COLORS = [
                        "#27795d",
                        "#34a853",
                        "#fbbc04",
                        "#ea4335",
                        "#4285f4",
                        "#9c27b0",
                      ];
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    formatter={(value) =>
                      `₹${formatNumberWithCommasNoDecimal(value.toFixed(2))}`
                    }
                    contentStyle={{
                      background: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "0.5rem",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div
              style={{
                background: "white",
                padding: "1.5rem",
                borderRadius: "1rem",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
              }}
            >
              <h3
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "#1e293b",
                  marginBottom: "1rem",
                  textAlign: "center",
                }}
              >
                Stock Quantity Distribution
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={STOCK_PRODUCTS.map((product) => ({
                      name: product.name,
                      value: balance ? balance[product.field] || 0 : 0,
                    })).filter((item) => item.value > 0)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name}: ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {STOCK_PRODUCTS.map((_, index) => {
                      const COLORS = [
                        "#1e40af",
                        "#7c3aed",
                        "#db2777",
                        "#ea580c",
                        "#65a30d",
                        "#0891b2",
                      ];
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    formatter={(value) => `${value.toFixed(2)}`}
                    contentStyle={{
                      background: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "0.5rem",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: "1rem",
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
            }}
          >
            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "#1e293b",
                marginBottom: "1rem",
                textAlign: "center",
              }}
            >
              Stock Value by Product
            </h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={STOCK_PRODUCTS.map((product) => ({
                  name: product.name,
                  quantity: balance ? balance[product.field] || 0 : 0,
                  value: balance
                    ? (balance[product.field] || 0) *
                      (averagePrices[product.field] || 0)
                    : 0,
                  avgPrice: averagePrices[product.field] || 0,
                }))}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  label={{
                    value: "Value (₹)",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 12, fill: "#64748b" },
                  }}
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === "value")
                      return [
                        `₹${formatNumberWithCommasNoDecimal(value.toFixed(2))}`,
                        "Stock Value",
                      ];
                    if (name === "quantity")
                      return [value.toFixed(2), "Quantity"];
                    if (name === "avgPrice")
                      return [`₹${value.toFixed(2)}`, "Avg Price"];
                    return value;
                  }}
                  contentStyle={{
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "0.5rem",
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: "20px" }}
                  iconType="circle"
                />
                <Bar
                  dataKey="value"
                  fill="rgb(39, 121, 93)"
                  radius={[8, 8, 0, 0]}
                  name="Stock Value (₹)"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: "1rem",
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
              marginTop: "2rem",
            }}
          >
            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "#1e293b",
                marginBottom: "1rem",
                textAlign: "center",
              }}
            >
              Current Stock vs Minimum Threshold
            </h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={STOCK_PRODUCTS.map((product) => {
                  const qty = balance ? balance[product.field] || 0 : 0;
                  const threshold = thresholds[product.field] || 0;
                  return {
                    name: product.name,
                    current: qty,
                    threshold: threshold,
                    status: threshold > 0 && qty < threshold ? "Low" : "OK",
                  };
                })}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  label={{
                    value: "Quantity",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 12, fill: "#64748b" },
                  }}
                />
                <Tooltip
                  formatter={(value) => value.toFixed(2)}
                  contentStyle={{
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "0.5rem",
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: "20px" }}
                  iconType="circle"
                />
                <Bar
                  dataKey="current"
                  fill="#10b981"
                  radius={[8, 8, 0, 0]}
                  name="Current Stock"
                />
                <Bar
                  dataKey="threshold"
                  fill="#f59e0b"
                  radius={[8, 8, 0, 0]}
                  name="Minimum Threshold"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
       </div>

      {/* ====== Recent Movements (Last 30) ====== */}
      <div className={styles.global_summary_card} style={{ marginTop: "2rem" }}>
        <div className={styles.global_header}>
          <h2 className={styles.global_title}>
            Recent Stock Movements (Last {ledger.length})
          </h2>
        </div>
        <div className={styles.table_wrapper}>
          {ledger.length > 0 ? (
            <table className={styles.procurement_table}>
              <thead>
                <tr className={styles.table_head_row}>
                  <th className={styles.table_header_cell}>Date</th>
                  <th className={styles.table_header_cell}>Product</th>
                  <th className={styles.table_header_cell}>Type</th>
                  <th className={styles.table_header_cell}>Quantity</th>
                  {/* <th className={styles.table_header_cell}>Batch / Ref</th> */}
                  <th className={styles.table_header_cell}>Comment</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => (
                  <tr key={entry._id} className={styles.table_row}>
                    <td className={styles.table_cell}>
                      {new Date(
                        entry.date || entry.createdAt,
                      ).toLocaleDateString("en-IN")}
                    </td>
                    <td className={styles.table_cell}>{entry.product}</td>
                    <td className={styles.table_cell}>{entry.type}</td>
                    <td
                      className={`${styles.table_cell} ${
                        entry.quantity > 0 ? styles.text_green : styles.text_red
                      }`}
                    >
                      {entry.quantity > 0 ? "+" : ""}
                      {entry.quantity?.toFixed(2)}
                    </td>
                    {/* <td className={styles.table_cell}>
                      {entry.batch ||
                        (entry.referenceId &&
                          entry.referenceId.toString()) ||
                        "-"}
                    </td> */}
                    <td className={styles.table_cell}>
                      {entry.comment || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.empty_state}>
              <p>No recent stock movements found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
