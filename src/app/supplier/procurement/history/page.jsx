"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/procurement-history.module.css";
import { getPreviousMonthDate, getTodayDate } from "@/utils/dateUtils";
import { formatNumberWithCommasNoDecimal } from "@/utils/formatNumberWithComma";
import { exportToCSV, exportToPDF } from "@/utils/exportUtils";
import Link from "next/link";

const INITIAL_FILTERS = {
  startDate: getPreviousMonthDate(),
  endDate: getTodayDate(),
};

const LoadingSpinner = () => (
  // <div className={styles.page_container}>
  <div className={styles.loading_container}>
    <div className={styles.spinner}></div>
    <span className={styles.loading_text}>Loading procurement records...</span>
  </div>
  //  </div>
);

const validateDateRange = (startDate, endDate) => {
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    return "Start date cannot be after end date";
  }
  if (endDate && new Date(endDate) > new Date(getTodayDate())) {
    return "End date cannot be in the future";
  }
  return null;
};

const getFormattedDateRange = (startDate, endDate) => {
  if (startDate && endDate) {
    const from = new Date(startDate).toLocaleDateString("en-IN");
    const to = new Date(endDate).toLocaleDateString("en-IN");
    return from === to ? from : `${from} to ${to}`;
  }
  if (startDate)
    return `From ${new Date(startDate).toLocaleDateString("en-IN")}`;
  if (endDate) return `Till ${new Date(endDate).toLocaleDateString("en-IN")}`;
  return "All Records";
};

const formatTimeBadge = (time) => {
  if (!time) return "AM";
  const timeUpper = time.toUpperCase();
  return timeUpper === "PM" ? "PM" : "AM";
};

const StatItem = ({ label, value, unit, prefix = "" }) => (
  <div className={styles.stat_item}>
    <span className={styles.stat_label}>{label}</span>
    <span className={styles.stat_value}>
      {prefix}
      {value}
      {unit && <span className={styles.stat_unit}>{unit}</span>}
    </span>
  </div>
);

function ProcurementHistoryContent() {
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [procurementData, setProcurementData] = useState([]);
  const [lastFetchTime, setLastFetchTime] = useState(null);

  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (filters.startDate) queryParams.append("startDate", filters.startDate);
      if (filters.endDate) queryParams.append("endDate", filters.endDate);

      const response = await fetch(
        `/api/supplier/procurement/history?${queryParams}`,
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Failed to load procurement history",
        );
      }

      const data = await response.json();
      const responseData = Array.isArray(data) ? data : data.data || data;

      if (Array.isArray(responseData)) {
        setProcurementData(responseData);
        setLastFetchTime(new Date());
      } else {
        throw new Error("Invalid data format received from server");
      }
    } catch (error) {
      console.error("Load error:", error);
      toast.error(error.message || "Failed to load procurement history");
      setProcurementData([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchAllData();
  }, [filters, fetchAllData]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleFilterSubmit = (e) => {
    e.preventDefault();

    const error = validateDateRange(filters.startDate, filters.endDate);
    if (error) {
      toast.error(error);
      return;
    }
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const clearFilters = () => {
    setFilters({ startDate: "", endDate: "" });
  };

  const calculateSummary = () => {
    if (procurementData.length === 0) {
      return {
        milk: 0,
        amount: 0,
        count: 0,
        avgRate: "0.00",
        avgFat: "0.0",
        avgSnf: "0.0",
        daysWithData: 0,
      };
    }

    const uniqueDates = new Set();
    let totalMilk = 0;
    let totalAmount = 0;
    let totalFat = 0;
    let totalSnf = 0;

    procurementData.forEach((record) => {
      const milkQty = parseFloat(record.milkQuantity) || 0;
      const amount = parseFloat(record.totalAmount) || 0;
      const fat = parseFloat(record.fatPercentage) || 0;
      const snf = parseFloat(record.snfPercentage) || 0;
      const date = record.date?.split("T")[0];

      if (date) uniqueDates.add(date);

      totalMilk += milkQty;
      totalAmount += amount;
      totalFat += fat;
      totalSnf += snf;
    });

    const count = procurementData.length;
    const avgRate =
      totalMilk > 0 ? (totalAmount / totalMilk).toFixed(2) : "0.00";
    const avgFat = count > 0 ? (totalFat / count).toFixed(1) : "0.0";
    const avgSnf = count > 0 ? (totalSnf / count).toFixed(1) : "0.0";

    return {
      milk: totalMilk,
      amount: totalAmount,
      count,
      avgRate,
      avgFat,
      avgSnf,
      daysWithData: uniqueDates.size,
    };
  };

  const summary = calculateSummary();

  const handleExport = (format) => {
    if (!procurementData.length) {
      toast.error("No data to export");
      return;
    }

    const dateRange = {
      start:
        new Date(procurementData.at(-1).date).toLocaleDateString() || "----",
      end: new Date(procurementData[0].date).toLocaleDateString() || "----",
    };
    const supplierName = "All Suppliers records";
    const fileName = `${supplierName}_${dateRange.start}_to_${dateRange.end}`;

    if (format === "csv") {
      exportToCSV(procurementData, supplierName, dateRange, fileName);
      toast.success("CSV exported successfully");
    } else if (format === "pdf") {
      exportToPDF(procurementData, supplierName, dateRange, fileName);
      toast.success("PDF exported successfully");
    }
  };

  // ========== RENDER LOADING STATE ==========
  // if (loading) {
  //   return <LoadingSpinner />;
  // }

  // ========== RENDER ==========
  return (
    <div className={styles.page_container}>
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

      {/* HEADER */}
      <div className={styles.page_header}>
        <h1 className={styles.page_title}>Procurement History</h1>
        {lastFetchTime && (
          <div className={styles.last_updated}>
            Last updated: {lastFetchTime.toLocaleTimeString("en-IN")}
          </div>
        )}
      </div>

      {/* FILTER SECTION */}
      <form onSubmit={handleFilterSubmit} className={styles.filter_card}>
        <div className={styles.filter_title}>
          <h2>Filter by Date Range</h2>
        </div>

        <div className={styles.filter_content}>
          <div className={styles.date_section}>
            <div className={styles.date_inputs_grid}>
              <div className={styles.date_field}>
                <label htmlFor="startDate" className={styles.date_label}>
                  From Date
                </label>
                <input
                  id="startDate"
                  name="startDate"
                  type="date"
                  value={filters.startDate}
                  onChange={handleFilterChange}
                  className={styles.date_input}
                  max={filters.endDate || getTodayDate()}
                  aria-label="Select start date"
                />
              </div>

              <div className={styles.date_field}>
                <label htmlFor="endDate" className={styles.date_label}>
                  To Date
                </label>
                <input
                  id="endDate"
                  name="endDate"
                  type="date"
                  value={filters.endDate}
                  onChange={handleFilterChange}
                  className={styles.date_input}
                  min={filters.startDate}
                  max={getTodayDate()}
                  aria-label="Select end date"
                />
              </div>
            </div>
          </div>

          <div className={styles.filter_actions}>
            <div className={styles.filter_buttons}>
              <button
                type="button"
                onClick={resetFilters}
                className={`${styles.btn} ${styles.btn_primary}`}
                disabled={loading}
                aria-label="Reset filters to default"
              >
                Reset Filters
              </button>

              <button
                type="button"
                onClick={clearFilters}
                className={`${styles.btn} ${styles.btn_secondary}`}
                disabled={loading || (!filters.startDate && !filters.endDate)}
                aria-label="Clear all filters"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* SUMMARY SECTION */}
      {loading ? (
        <div className={styles.loadingSection}>
          <LoadingSpinner />
        </div>
      ) : (
        summary.count > 0 && (
          <div className={styles.stats_card}>
            <h3 className={styles.stats_header}>
              Summary
              <span className={styles.date_range_badge}>
                {getFormattedDateRange(filters.startDate, filters.endDate)}
              </span>
            </h3>
            <div className={styles.stats_grid}>
              <StatItem
                label="Total Milk"
                value={summary.milk.toFixed(2)}
                unit="L"
              />
              <StatItem label="Average Fat" value={summary.avgFat} unit="%" />
              <StatItem label="Average SNF" value={summary.avgSnf} unit="%" />

              <StatItem
                label={
                  filters.startDate === filters.endDate &&
                  filters.startDate !== ""
                    ? "Ester Egg!"
                    : "Milk per Day"
                }
                value={(summary.milk / summary.daysWithData || 0).toFixed(2)}
                unit={
                  filters.startDate === filters.endDate &&
                  filters.startDate !== ""
                    ? "LoL"
                    : "L"
                }
              />
              <StatItem
                label="Average Rate"
                value={summary.avgRate}
                unit="/L"
                prefix="₹"
              />
              <StatItem
                label="Total Amount"
                value={formatNumberWithCommasNoDecimal(summary.amount)}
                unit=""
                prefix="₹"
              />
            </div>
          </div>
        )
      )}

      {summary.count > 0 && (
        <div className={styles.exportSection}>
          <span className={styles.entryCount}>
            {summary.count} record{summary.count !== 1 ? "s" : ""} found
          </span>
          <div className={styles.exportButtons}>
            <button
              onClick={() => handleExport("csv")}
              className={styles.exportBtn}
              disabled={!procurementData.length}
              aria-label="Export data as CSV"
            >
              Export as CSV
            </button>
            <button
              onClick={() => handleExport("pdf")}
              className={styles.exportBtn}
              disabled={!procurementData.length}
              aria-label="Export data as PDF"
            >
              Export as PDF
            </button>
          </div>
        </div>
      )}

      {/* RECORD COUNT */}
      {/* {summary.count > 0 && (
        <div className={styles.record_count}>
          Showing {procurementData.length.toLocaleString()} record
          {procurementData.length !== 1 ? "s" : ""}
          {filters.startDate || filters.endDate
            ? ` for selected date range`
            : ""}
        </div>
      )} */}

      {/* TABLE SECTION */}
      <div className={styles.table_wrapper}>
        {!loading && summary.count === 0 ? (
          <div className={styles.empty_state}>
            {(procurementData.length === 0 && !filters.startDate) ||
            !filters.endDate ? (
              <>
                <span className={styles.empty_icon}>📊</span>
                <h3 className={styles.empty_title}>No Procurement History</h3>
                <p className={styles.empty_message}>
                  No procurement records found.
                </p>
              </>
            ) : (
              <>
                <span className={styles.empty_icon}>🔍</span>
                <h3 className={styles.empty_title}>No Records Found</h3>
                <p className={styles.empty_message}>
                  No procurement records found for the selected date range
                </p>
                <button
                  onClick={clearFilters}
                  className={styles.clear_filter_btn}
                  disabled={loading}
                >
                  clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          !loading && (
            <div className={styles.table_container}>
              <div className={styles.table_scroll}>
                <table
                  className={styles.table}
                  aria-label="All procurement history"
                >
                  <thead>
                    <tr>
                      <th scope="col" className={styles.date_header}>
                        Date
                      </th>
                      <th scope="col" className={styles.supplier_header}>
                        Supplier
                      </th>
                      <th scope="col" className={styles.time_header}>
                        Time
                      </th>
                      <th scope="col" className={styles.quantity_header}>
                        Milk (L)
                      </th>
                      <th scope="col" className={styles.fat_header}>
                        Fat %
                      </th>
                      <th scope="col" className={styles.snf_header}>
                        SNF %
                      </th>
                      <th scope="col" className={styles.tsRate_header}>
                        TS Rate
                      </th>
                      <th scope="col" className={styles.rate_header}>
                        Rate/L
                      </th>
                      <th scope="col" className={styles.total_header}>
                        Total (₹)
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {procurementData.map((row, index) => {
                      const timeBadge = formatTimeBadge(row.time);

                      return (
                        <tr
                          key={
                            row._id ||
                            `${row.date}-${row.supplierName || "unknown"}-${index}`
                          }
                        >
                          <td className={styles.date_cell}>
                            {new Date(row.date).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>

                          <td className={styles.supplier_cell}>
                            {row.supplierName ? (
                              <Link
                                href={`/supplier/procurement?supplierId=${row.supplierId}`}
                                className={styles.supplier_name}
                              >
                                {row.supplierName}
                              </Link>
                            ) : (
                              "Unknown"
                            )}
                          </td>

                          <td className={styles.time_cell}>
                            <span
                              className={
                                timeBadge === "PM"
                                  ? styles.pm_badge
                                  : styles.am_badge
                              }
                              title={timeBadge === "PM" ? "Evening" : "Morning"}
                            >
                              {timeBadge}
                            </span>
                          </td>

                          <td className={styles.quantity_cell}>
                            {(parseFloat(row.milkQuantity) || 0).toFixed(2)}
                          </td>

                          <td className={styles.fat_cell}>
                            {(parseFloat(row.fatPercentage) || 0).toFixed(1)}
                          </td>

                          <td className={styles.snf_cell}>
                            {(parseFloat(row.snfPercentage) || 0).toFixed(1)}
                          </td>

                          <td className={styles.tsRate_cell}>
                            {row.supplierTSRate
                              ? `${parseInt(row.supplierTSRate)}`
                              : "N/A"}
                          </td>

                          <td className={styles.rate_cell}>
                            ₹{(parseFloat(row.rate) || 0).toFixed(1)}
                          </td>

                          <td className={styles.total_cell}>
                            ₹
                            {formatNumberWithCommasNoDecimal(
                              row.totalAmount || 0,
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ========== EXPORT WITH SUSPENSE ==========
export default function ProcurementHistoryPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ProcurementHistoryContent />
    </Suspense>
  );
}
