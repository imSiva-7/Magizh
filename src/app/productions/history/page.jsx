"use client";

import { useState, useEffect, useCallback } from "react";
import { ToastContainer, toast } from "react-toastify";
import styles from "@/css/history.module.css";
import "react-toastify/dist/ReactToastify.css";
import { getPreviousMonthDate, getTodayDate } from "@/utils/dateUtils";
import { formatNumberWithCommas } from "@/utils/formatNumberWithComma";

// Helper function for date validation
const validateDateRange = (startDate, endDate) => {
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    return "Start date cannot be after end date";
  }
  if (endDate && new Date(endDate) > new Date(getTodayDate())) {
    return "End date cannot be in the future";
  }
  return null;
};

// Helper function for data fetching
const fetchProductionData = async (fromDate, toDate) => {
  try {
    const queryParams = new URLSearchParams();
    if (fromDate) queryParams.append("fromDate", fromDate);
    if (toDate) queryParams.append("toDate", toDate);

    const response = await fetch(`/api/production/history?${queryParams}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Failed to fetch data: ${response.status}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
};

// Stats calculation function
const calculateStats = (entries) => {
  const initialStats = {
    totalMilk: 0,
    totalCurd: 0,
    totalPremiumPaneer: 0,
    totalSoftPaneer: 0,
    totalButter: 0,
    totalCream: 0,
    totalGhee: 0,
  };

  if (!entries.length) return initialStats;

  return entries.reduce(
    (acc, entry) => ({
      totalMilk: acc.totalMilk + (parseFloat(entry.milk_quantity) || 0),
      totalCurd: acc.totalCurd + (parseFloat(entry.curd_quantity) || 0),
      totalPremiumPaneer:
        acc.totalPremiumPaneer +
        (parseFloat(entry.premium_paneer_quantity) || 0),
      totalSoftPaneer:
        acc.totalSoftPaneer + (parseFloat(entry.soft_paneer_quantity) || 0),
      totalButter: acc.totalButter + (parseFloat(entry.butter_quantity) || 0),
      totalCream: acc.totalCream + (parseFloat(entry.cream_quantity) || 0),
      totalGhee: acc.totalGhee + (parseFloat(entry.ghee_quantity) || 0),
    }),
    initialStats
  );
};

// CSV export helper
const generateCSVData = (entries, stats, dateRange) => {
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

  const formatEntryValue = (value) => value || "0";

  const csvRows = entries.map((entry) => [
    entry.date,
    entry.batch || "",
    formatEntryValue(entry.milk_quantity),
    formatEntryValue(entry.fat_percentage),
    formatEntryValue(entry.snf_percentage),
    formatEntryValue(entry.curd_quantity),
    formatEntryValue(entry.premium_paneer_quantity),
    formatEntryValue(entry.soft_paneer_quantity),
    formatEntryValue(entry.butter_quantity),
    formatEntryValue(entry.cream_quantity),
    formatEntryValue(entry.ghee_quantity),
    new Date(entry.createdAt).toLocaleString("en-IN"),
  ]);

  // Add total row
  csvRows.push([
    "TOTAL",
    "",
    stats.totalMilk.toFixed(2),
    "",
    "",
    stats.totalCurd.toFixed(2),
    stats.totalPremiumPaneer.toFixed(2),
    stats.totalSoftPaneer.toFixed(2),
    stats.totalButter.toFixed(2),
    stats.totalCream.toFixed(2),
    stats.totalGhee.toFixed(2),
    "",
  ]);

  return { headers, rows: csvRows };
};

const downloadCSV = (headers, rows, fromDate, toDate) => {
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  const blob = new Blob([`\uFEFF${csvContent}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `production_history_${fromDate || "all"}_to_${
    toDate || "all"
  }.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default function ProductionHistoryPage() {
  // State management
  const [filters, setFilters] = useState({
    fromDate: getPreviousMonthDate(),
    toDate: getTodayDate(),
  });
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(null);

  // Stats calculation
  const stats = calculateStats(entries);

  // Fetch data with proper error handling
  const fetchData = useCallback(async () => {
    const validationError = validateDateRange(filters.fromDate, filters.toDate);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchProductionData(filters.fromDate, filters.toDate);

      if (!Array.isArray(data)) {
        throw new Error("Invalid response format from server");
      }

      setEntries(data);
      setLastFetchTime(new Date());

      if (data.length === 0) {
        toast.info("No production entries found for the selected date range");
      } else {
        toast.success(`Found ${data.length} production entries`);
      }
    } catch (error) {
      console.error("Fetch data error:", error);
      const errorMessage = error.message || "Failed to fetch production data";
      setError(errorMessage);
      toast.error(errorMessage);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [filters.fromDate, filters.toDate]);

  // Initial data fetch and refetch when filters change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handler functions
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchData();
  };

  const resetFilters = () => {
    setFilters({
      fromDate: getPreviousMonthDate(),
      toDate: getTodayDate(),
    });
  };

  const clearFilters = () => {
    setFilters({
      fromDate: "",
      toDate: "",
    });
  };

  const handleExportCSV = () => {
    if (entries.length === 0) {
      toast.warning("No data to export");
      return;
    }

    try {
      const { headers, rows } = generateCSVData(entries, stats, filters);
      downloadCSV(headers, rows, filters.fromDate, filters.toDate);
      toast.success("CSV file downloaded successfully");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to generate CSV file");
    }
  };

  const getDateRangeLabel = () => {
    const { fromDate, toDate } = filters;

    if (fromDate && toDate) {
      const from = new Date(fromDate).toLocaleDateString("en-IN");
      const to = new Date(toDate).toLocaleDateString("en-IN");
      return from === to ? from : `${from} to ${to}`;
    }

    if (fromDate)
      return `From ${new Date(fromDate).toLocaleDateString("en-IN")}`;
    if (toDate) return `Till ${new Date(toDate).toLocaleDateString("en-IN")}`;

    return "All Records";
  };

  const formatTableValue = (value, unit = "") => {
    if (value === null || value === undefined || value === "") return "-";
    const numValue = parseFloat(value);
    return isNaN(numValue) ? "-" : `${formatNumberWithCommas(numValue)}${unit}`;
  };

  const statsConfig = [
    { key: "totalMilk", label: "Milk", unit: "L" },
    { key: "totalCurd", label: "Curd", unit: "L" },
    { key: "totalPremiumPaneer", label: "P. Paneer", unit: "Kg" },
    { key: "totalSoftPaneer", label: "S. Paneer", unit: "Kg" },
    { key: "totalButter", label: "Butter", unit: "Kg" },
    { key: "totalCream", label: "Cream", unit: "Kg" },
    { key: "totalGhee", label: "Ghee", unit: "L" },
  ];

  const renderTableRow = (entry) => ({
    date: new Date(entry.date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    batch: entry.batch || "-",
    milk: entry.milk_quantity || "-",
    fat: entry.fat_percentage || "-",
    snf: entry.snf_percentage || "-",
    curd: entry.curd_quantity || "-",
    premiumPaneer: entry.premium_paneer_quantity || "-",
    softPaneer: entry.soft_paneer_quantity || "-",
    butter: entry.butter_quantity || "-",
    cream: entry.cream_quantity || "-",
    ghee: entry.ghee_quantity || "-",
    createdAt: new Date(entry.createdAt).toLocaleDateString("en-IN"),
  });

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

      {/* Header */}
      <div className={styles.header}>
        <h1>Production History</h1>
        {lastFetchTime && (
          <div className={styles.lastUpdated}>
            Last updated: {lastFetchTime.toLocaleTimeString("en-IN")}
          </div>
        )}
      </div>

      {/* Filter Form */}
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
                  name="fromDate"
                  type="date"
                  value={filters.fromDate}
                  onChange={handleFilterChange}
                  className={styles.dateInput}
                  max={filters.toDate || getTodayDate()}
                  aria-label="Select start date"
                />
              </div>

              <div className={styles.dateField}>
                <label htmlFor="toDate">To Date</label>
                <input
                  id="toDate"
                  name="toDate"
                  type="date"
                  value={filters.toDate}
                  onChange={handleFilterChange}
                  className={styles.dateInput}
                  min={filters.fromDate}
                  max={getTodayDate()}
                  aria-label="Select end date"
                />
              </div>
            </div>
          </div>

          <div className={styles.filterActions}>
            <div className={styles.buttonGroup}>
              {/* <button
                type="submit"
                disabled={loading}
                className={styles.primaryBtn}
                aria-label="Apply filters"
              >
                {loading ? "Loading..." : "Apply Filters"}
              </button> */}

              <button
                type="button"
                onClick={resetFilters}
                className={styles.primaryBtn}
                disabled={loading}
                aria-label="Reset filters to default"
              >
                Reset to Default
              </button>

              <button
                type="button"
                onClick={clearFilters}
                className={styles.secondaryBtn}
                disabled={loading || (!filters.fromDate && !filters.toDate)}
                aria-label="Clear all filters"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Error Display */}
      {error && (
        <div className={styles.errorAlert}>
          <span className={styles.errorIcon}>⚠️</span>
          <div className={styles.errorContent}>
            <strong>Error loading data:</strong>
            <p>{error}</p>
            <button
              onClick={fetchData}
              className={styles.retryBtn}
              aria-label="Retry loading data"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {entries.length > 0 && (
        <>
          <div className={styles.statsCard}>
            <h3>
              Production Summary
              <div className={styles.dateRange}>{getDateRangeLabel()}</div>
            </h3>
            <div className={styles.statsGrid}>
              {statsConfig.map(({ key, label, unit }) => (
                <div key={key} className={styles.statItem}>
                  <span className={styles.statLabel}>{label}</span>
                  <span className={styles.statValue}>
                    {formatNumberWithCommas(stats[key])}
                    <span className={styles.statUnit}>{unit}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Export Section */}
          <div className={styles.exportSection}>
            <span className={styles.entryCount}>
              {entries.length} {entries.length === 1 ? "entry" : "entries"}{" "}
              found
            </span>
            <button
              onClick={handleExportCSV}
              disabled={entries.length === 0 || loading}
              className={styles.exportBtn}
              aria-label="Download CSV file"
            >
              Export as CSV
            </button>
          </div>
        </>
      )}

      {/* Data Table */}
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
                <h3>Unable to Load Data</h3>
                <p>Please check your connection and try again.</p>
              </>
            ) : (
              <>
                <span className={styles.emptyIcon}>📊</span>
                <h3>No Production Data Found</h3>
                <p>
                  {filters.fromDate || filters.toDate
                    ? "Try adjusting your date filters"
                    : "Start by adding production entries"}
                </p>
                {(filters.fromDate || filters.toDate) && (
                  <button
                    onClick={clearFilters}
                    className={styles.clearFilterLink}
                  >
                    View All Records
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table} aria-label="Production History">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Batch</th>
                  <th scope="col">Milk (L)</th>
                  <th scope="col">Fat (%)</th>
                  <th scope="col">SNF (%)</th>
                  <th scope="col">Curd (L)</th>
                  <th scope="col">P. Paneer (Kg)</th>
                  <th scope="col">S. Paneer (Kg)</th>
                  <th scope="col">Cream (Kg)</th>
                  <th scope="col">Ghee (L)</th>
                  <th scope="col">Time</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const rowData = renderTableRow(entry);
                  return (
                    <tr key={entry._id || entry.id} className={styles.tableRow}>
                      <td className={styles.dateCell}>{rowData.date}</td>
                      <td className={styles.batchCell}>{rowData.batch}</td>
                      <td className={styles.milkCell}>{rowData.milk}</td>
                      <td className={styles.fatCell}>{rowData.fat}</td>
                      <td className={styles.snfCell}>{rowData.snf}</td>
                      <td className={styles.curdCell}>{rowData.curd}</td>
                      <td className={styles.premiumPaneerCell}>
                        {rowData.premiumPaneer}
                      </td>
                      <td className={styles.softPaneerCell}>
                        {rowData.softPaneer}
                      </td>
                      <td className={styles.creamCell}>{rowData.cream}</td>
                      <td className={styles.gheeCell}>{rowData.ghee}</td>
                      <td className={styles.createdAtCell}>
                        {rowData.createdAt}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
