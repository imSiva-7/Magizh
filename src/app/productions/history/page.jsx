"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ToastContainer, toast } from "react-toastify";
import styles from "@/css/history.module.css";
import "react-toastify/dist/ReactToastify.css";
import { getPreviousMonthDate, getTodayDate } from "@/utils/dateUtils";
import { formatNumberWithCommas } from "@/utils/formatNumberWithComma";

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
      "Fat Percent (%)",
      "SNF Percent (%)",
      "Curd Quantity (L)",
      "Premium Paneer Quantity (Kg)",
      "Soft Paneer Quantity (Kg)",
      "Butter Quantity (Kg)",
      "Cream Quantity (Kg)",
      "Ghee Quantity (L)",
      "Created At",
    ];

    const csvRows = entries
      .reverse()
      .map((entry) => [
        entry.date,
        entry.batch,
        entry.milk_quantity || "0",
        entry.fat_percentage || "0",
        entry.snf_percentage || "0",
        entry.curd_quantity || "0",
        entry.premium_paneer_quantity || "0",
        entry.soft_paneer_quantity || "0",
        entry.butter_quantity || "0",
        entry.cream_quantity || "0",
        entry.ghee_quantity || "0",
        new Date(entry.createdAt).toLocaleString("en-IN"),
      ]);

    // Add total row
    csvRows.push([
      "TOTAL",
      "",
      totalStats.totalMilk.toFixed(2),
      "",
      "",
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
      </div>

      <form onSubmit={handleSubmit} className={styles.filterForm}>
        <div className={styles.filterHeader}>
          <h2>Filter by Date Range</h2>
        </div>

        <div className={styles.filterRow}>
          <div className={styles.dateFilterSection}>
            <div className={styles.dateInputGroup}>
              <div className={styles.dateField}>
                <label htmlFor="fromDate">From Date</label>
                <input
                  id="fromDate"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className={styles.dateInput}
                  max={toDate}
                  required
                  aria-label="Select start date"
                />
              </div>

              <div className={styles.dateField}>
                <label htmlFor="toDate">To Date</label>
                <input
                  id="toDate"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className={styles.dateInput}
                  min={fromDate}
                  max={getTodayDate()}
                  required
                  aria-label="Select end date"
                />
              </div>
            </div>
          </div>

          <div className={styles.filterActions}>
            <div className={styles.buttonGroup}>
              <button
                type="submit"
                disabled={loading}
                className={styles.primaryBtn}
                aria-label="Show production history"
              >
                {loading ? (
                  <>
                    <span className={styles.buttonSpinner}></span>
                    Loading...
                  </>
                ) : (
                  <>
                    <span className={styles.buttonIcon}></span>
                    Show History
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={resetForm}
                className={styles.secondaryBtn}
                disabled={loading}
                aria-label="Reset date filters"
              >
                <span className={styles.buttonIcon}></span>
                Reset
              </button>
            </div>
          </div>
        </div>
      </form>

      {error && (
        <div className={styles.errorAlert}>
          <span className={styles.errorIcon}>⚠️</span>
          Error: {error}
        </div>
      )}

      {entries.length > 0 && (
        <>
          <div className={styles.statsCard}>
            <h3>
              Production Summary{" "}
              <div className={styles.dateRange}>
                {fromDate && !toDate && `From ${fromDate}`}
                {!fromDate && toDate && `Till ${toDate}`}
                {fromDate && toDate && `${fromDate} to ${toDate}`}
                {!fromDate && !toDate && `All Records`}
              </div>
            </h3>
            <div className={styles.statsGrid}>
              {Object.entries(totalStats).map(([key, value]) => {
                const labels = {
                  totalMilk: "Milk",
                  totalCurd: "Curd",
                  totalPremiumPaneer: "P. Paneer",
                  totalSoftPaneer: "S. Paneer",
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
                    <span className={styles.statLabel}>{labels[key]}</span>
                    <span className={styles.statValue}>
                      {formatNumberWithCommas(value)}
                      <span className={styles.statUnit}>{units[key]}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.exportSection}>
            <span className={styles.entryCount}>
              {entries.length} {entries.length === 1 ? "entry" : "entries"}{" "}
              found
            </span>
            <button
              onClick={downloadCSV}
              disabled={entries.length === 0 || loading}
              className={styles.exportBtn}
              aria-label="Download CSV file"
            >
              {/* <span className={styles.exportIcon}></span> */}
              Export as CSV
            </button>
          </div>
        </>
      )}

      <div className={styles.tableWrapper}>
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <span className={styles.loadingText}>
              Loading production history...
            </span>
          </div>
        ) : entries.length === 0 ? (
          <div className={styles.emptyState}>
            {error ? (
              <>
                <span className={styles.emptyIcon}>⚠️</span>
                <p>Unable to load data. Please try again.</p>
              </>
            ) : (
              <>
                <span className={styles.emptyIcon}></span>
                <p>No production data found for the selected criteria</p>
              </>
            )}
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Batch</th>
                  <th>Milk (L)</th>
                  <th>Fat (%)</th>
                  <th>Snf (%)</th>
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
                  <tr key={entry._id || entry.id} className={styles.tableRow}>
                    <td className={styles.dateCell}>
                      {new Date(entry.date).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className={styles.batchCell}>{entry.batch}</td>
                    <td className={styles.milkCell}>
                      {entry.milk_quantity || "-"}
                    </td>
                    <td className={styles.fatCell}>
                      {entry.fat_percentage || "-"}
                    </td>
                    <td className={styles.snfCell}>
                      {entry.snf_percentage || "-"}
                    </td>
                    <td className={styles.curdCell}>
                      {entry.curd_quantity || "-"}
                    </td>
                    <td className={styles.premiumPaneerCell}>
                      {entry.premium_paneer_quantity || "-"}
                    </td>
                    <td className={styles.softPaneerCell}>
                      {entry.soft_paneer_quantity || "-"}
                    </td>
                    <td className={styles.butterCell}>
                      {entry.butter_quantity || "-"}
                    </td>
                    <td className={styles.creamCell}>
                      {entry.cream_quantity || "-"}
                    </td>
                    <td className={styles.gheeCell}>
                      {entry.ghee_quantity || "-"}
                    </td>
                    <td className={styles.createdAtCell}>
                      {new Date(entry.createdAt)
                        .toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                        .slice(0, 8)}
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
