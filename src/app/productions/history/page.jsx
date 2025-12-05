"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ToastContainer, toast } from "react-toastify";
import styles from "@/css/history.module.css";
import "react-toastify/dist/ReactToastify.css";
import {
  getPreviousMonthDate,
  getTodayDate,
  formatDateToLocalString,
} from "@/utils/dateUtils";

export default function History() {
  const [fromDate, setFromDate] = useState(getPreviousMonthDate());
  const [toDate, setToDate] = useState(getTodayDate());
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const totalStats = useMemo(() => {
    const initialStats = {
      totalMilk: 0,
      totalCurd: 0,
      totalPremiumPaneer: 0,
      totalSoftPaneer: 0,
      totalButter: 0,
      totalCream: 0,
      totalGhee: 0,
    };

    return entries.reduce((acc, entry) => {
      return {
        totalMilk: acc.totalMilk + (parseInt(entry.milk_quantity) || 0),
        totalCurd: acc.totalCurd + (parseFloat(entry.curd_quantity) || 0),
        totalPremiumPaneer:
          acc.totalPremiumPaneer +
          (parseFloat(entry.premium_paneer_quantity) || 0),
        totalSoftPaneer:
          acc.totalSoftPaneer + (parseFloat(entry.soft_paneer_quantity) || 0),
        totalButter: acc.totalButter + (parseFloat(entry.butter_quantity) || 0),
        totalCream: acc.totalCream + (parseFloat(entry.cream_quantity) || 0),
        totalGhee: acc.totalGhee + (parseFloat(entry.ghee_quantity) || 0),
      };
    }, initialStats);
  }, [entries]);

  const fetchData = useCallback(async () => {
    if (!fromDate || !toDate) {
      toast.error("Please select both dates");
      return;
    }

    if (new Date(fromDate) > new Date(toDate)) {
      toast.error("From date cannot be after To date");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        fromDate,
        toDate,
      }).toString();

      const response = await fetch(`/api/production/history?${queryParams}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setEntries(data);

      if (data.length === 0) {
        toast.info("No entries found for the selected date range");
      } else {
        toast.success(`Found ${data.length} entries`);
      }
    } catch (error) {
      const errorMessage = error.message || "Error fetching data";
      setError(errorMessage);
      toast.error(errorMessage);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setFromDate(getPreviousMonthDate());
    setToDate(getTodayDate());
    // Optionally fetch data immediately after reset
    // fetchData();
  };

  const downloadCSV = () => {
    if (entries.length === 0) {
      toast.warning("No data to export");
      return;
    }

    const headers = [
      "Date",
      "Batch",
      "Milk Quantity (L)",
      "Curd Quantity (L)",
      "Premium Paneer Quantity (Kg)",
      "Soft Paneer Quantity (Kg)",
      "Butter Quantity (Kg)",
      "Cream Quantity (Kg)",
      "Ghee Quantity (L)",
      "Created At",
    ];

    const csvRows = entries.map((entry) => [
      entry.date,
      entry.batch,
      entry.milk_quantity || "0",
      entry.curd_quantity || "0",
      entry.premium_paneer_quantity || "0",
      entry.soft_paneer_quantity || "0",
      entry.butter_quantity || "0",
      entry.cream_quantity || "0",
      entry.ghee_quantity || "0",
      new Date(entry.createdAt).toLocaleString("en-IN"),
    ]);

    // Add total row with better formatting
    csvRows.push([
      "TOTAL",
      "",
      totalStats.totalMilk.toFixed(2),
      totalStats.totalCurd.toFixed(2),
      totalStats.totalPremiumPaneer.toFixed(2),
      totalStats.totalSoftPaneer.toFixed(2),
      totalStats.totalButter.toFixed(2),
      totalStats.totalCream.toFixed(2),
      totalStats.totalGhee.toFixed(2),
      "",
    ]);

    const csvContent = [
      headers.join(","),
      ...csvRows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([`\uFEFF${csvContent}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `production_history_${fromDate}_to_${toDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("CSV file downloaded successfully");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchData();
  };

  const formatNumber = (num) => {
    return parseFloat(num).toFixed(2);
  };

  return (
    <div className={styles.container}>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />

      <div className={styles.header}>
        <h1>Production History</h1>
        <div className={styles.dateRange}>
          {fromDate} to {toDate}
        </div>
      </div>

      <form onSubmit={handleSubmit} className={styles.filterForm}>
        <div className={styles.filterRow}>
          <div className={styles.inputGroup}>
            <label htmlFor="fromDate">From</label>
            <input
              id="fromDate"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={styles.input}
              max={toDate}
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="toDate">To</label>
            <input
              id="toDate"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={styles.input}
              min={fromDate}
              max={getTodayDate()}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={styles.primaryBtn}
          >
            {loading ? <>Loading...</> : "Show History"}
          </button>

          <button
            type="button"
            onClick={resetForm}
            className={styles.secondaryBtn}
            disabled={loading}
          >
            Reset
          </button>
        </div>
      </form>

      {error && <div className={styles.errorAlert}>Error: {error}</div>}

      {entries.length > 0 && (
        <>
          <div className={styles.statsCard}>
            <h3>Total Production Summary</h3>
            <div className={styles.statsGrid}>
              {Object.entries(totalStats).map(([key, value]) => {
                const labels = {
                  totalMilk: "Milk",
                  totalCurd: "Curd",
                  totalPremiumPaneer: "Premium Paneer",
                  totalSoftPaneer: "Soft Paneer",
                  totalButter: "Butter",
                  totalCream: "Cream",
                  totalGhee: "Ghee",
                };
                const units = {
                  totalMilk: "L",
                  totalCurd: "L",
                  totalPremiumPaneer: "Kg",
                  totalSoftPaneer: "Kg",
                  totalButter: "Kg",
                  totalCream: "Kg",
                  totalGhee: "L",
                };
                return (
                  <div key={key} className={styles.statItem}>
                    <span className={styles.statLabel}>{labels[key]}:</span>
                    <span className={styles.statValue}>
                      {formatNumber(value)}
                      {units[key]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.exportSection}>
            <button
              onClick={downloadCSV}
              disabled={entries.length === 0 || loading}
              className={styles.exportBtn}
            >
              Download CSV
            </button>
            <span className={styles.entryCount}>
              {entries.length} {entries.length === 1 ? "entry" : "entries"}{" "}
              found
            </span>
          </div>
        </>
      )}

      <div className={styles.tableWrapper}>
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
          </div>
        ) : entries.length === 0 ? (
          <div className={styles.emptyState}>
            {error
              ? "Unable to load data. Please try again."
              : "No production data found for the selected criteria"}
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Batch</th>
                  <th>Milk (L)</th>
                  <th>Curd (L)</th>
                  <th>P. Paneer (Kg)</th>
                  <th>S. Paneer (Kg)</th>
                  <th>Butter (Kg)</th>
                  <th>Cream (Kg)</th>
                  <th>Ghee (L)</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry._id || entry.id}>
                    <td>
                      {new Date(entry.date).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className={styles.batchCell}>{entry.batch}</td>
                    <td>{entry.milk_quantity || "-"}</td>
                    <td>{entry.curd_quantity || "-"}</td>
                    <td>{entry.premium_paneer_quantity || "-"}</td>
                    <td>{entry.soft_paneer_quantity || "-"}</td>
                    <td>{entry.butter_quantity || "-"}</td>
                    <td>{entry.cream_quantity || "-"}</td>
                    <td>{entry.ghee_quantity || "-"}</td>
                    <td>
                      {new Date(entry.createdAt).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
