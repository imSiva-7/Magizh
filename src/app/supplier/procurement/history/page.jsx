"use client";

import { useState, useEffect, useMemo, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/procurementHistory.module.css";
import { getPreviousMonthDate, getTodayDate } from "@/utils/dateUtils";
import { formatNumberWithCommasNoDecimal } from "@/utils/formatNumberWithComma";
import Link from "next/link";

// ========== CONSTANTS ==========
const initialFilters = {
  startDate: getPreviousMonthDate(),
  endDate: getTodayDate(),
};

// ========== HELPER FUNCTIONS ==========
const getDateRangeLabel = () => {
  const { startDate, endDate } = initialFilters;

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

// const getSupplierTypeClass = (supplierType) => {
//   if (!supplierType || supplierType === "Unknown") {
//     return styles.type_unknown_badge;
//   }

//   const typeClassMap = {
//     Society: styles.type_society_badge,
//     Milkman: styles.type_milkman_badge,
//     Farmer: styles.type_farmer_badge,
//     Other: styles.type_other_badge,
//   };
//   return typeClassMap[supplierType] || styles.type_other_badge;
// };

// const formatSupplierName = (name) => {
//   return name || "Unknown";
// };

// const formatSupplierType = (type) => {
//   return type || "Unknown";
// };

// ========== REUSABLE COMPONENTS ==========
const StatItem = ({ label, value, unit, prefix = "" }) => (
  <div className={styles.statItem}>
    <span className={styles.statLabel}>{label}</span>
    <span className={styles.statValue}>
      {prefix}
      {value}
      {unit && <span className={styles.statUnit}>{unit}</span>}
    </span>
  </div>
);

// ========== MAIN COMPONENT ==========
function ProcurementHistoryContent() {
  // ========== STATE MANAGEMENT ==========
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(initialFilters);
  const [procurementData, setProcurementData] = useState([]);

  // ========== DATA FETCHING ==========
  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      const url = "/api/supplier/procurement/history";

      const response = await fetch(url, {
        cache: "no-store", // Prevent caching for fresh data
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Failed to load procurement history"
        );
      }

      const data = await response.json();
      const responseData = Array.isArray(data) ? data : data.data || data;

      if (responseData && Array.isArray(responseData)) {
        setProcurementData(responseData);
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
  }, []);

  // ========== EFFECTS ==========
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // ========== FILTER HANDLERS ==========
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const resetFilters = () => {
    setFilters(initialFilters);
  };

  const clearFilters = () => {
    setFilters({ startDate: "", endDate: "" });
  };

  // ========== DATA PROCESSING ==========
  const filteredProcurements = useMemo(() => {
    if (!procurementData.length) return [];

    return procurementData
      .filter((record) => {
        const recordDate = new Date(record.date);
        const startDate = filters.startDate
          ? new Date(filters.startDate)
          : null;
        const endDate = filters.endDate ? new Date(filters.endDate) : null;

        if (startDate && recordDate < startDate) return false;
        if (endDate && recordDate > endDate) return false;

        return true;
      })
      .sort((a, b) => {
        const dateCompare = new Date(b.date) - new Date(a.date);
        if (dateCompare !== 0) return dateCompare;
        const timeValue = (time) => {
          if (time === "AM") return 1;
          if (time === "PM") return 2;
          return 0;
        };
        return timeValue(b.time) - timeValue(a.time);
      });
  }, [procurementData, filters]);

  const summary = useMemo(() => {
    if (!filteredProcurements.length) {
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

    const totals = filteredProcurements.reduce(
      (acc, curr) => {
        const milkQty = parseFloat(curr.milkQuantity) || 0;
        const amount = parseFloat(curr.totalAmount) || 0;
        const date = curr.date?.split("T")[0];

        if (date) uniqueDates.add(date);

        return {
          milk: acc.milk + milkQty,
          amount: acc.amount + amount,
          count: acc.count + 1,
          fatSum: acc.fatSum + (parseFloat(curr.fatPercentage) || 0),
          snfSum: acc.snfSum + (parseFloat(curr.snfPercentage) || 0),
        };
      },
      { milk: 0, amount: 0, count: 0, fatSum: 0, snfSum: 0 }
    );

    const avgFat =
      totals.count > 0 ? (totals.fatSum / totals.count).toFixed(1) : "0.0";
    const avgSnf =
      totals.count > 0 ? (totals.snfSum / totals.count).toFixed(1) : "0.0";

    return {
      milk: totals.milk,
      amount: totals.amount,
      count: totals.count,
      avgRate:
        totals.milk > 0 ? (totals.amount / totals.milk).toFixed(2) : "0.00",
      avgFat,
      avgSnf,
      daysWithData: uniqueDates.size,
    };
  }, [filteredProcurements]);

  // ========== RENDER LOADING STATE ==========
  if (loading) {
    return (
      <div className={styles.container}>
        <ToastContainer />
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <span className={styles.loadingText}>
            Loading procurement records...
          </span>
        </div>
      </div>
    );
  }

  // ========== RENDER ==========
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

      {/* HEADER */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>Procurement History</h1>
        </div>
      </div>

      {/* FILTER SECTION */}
      <form className={styles.filterForm}>
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
                  name="startDate"
                  type="date"
                  value={filters.startDate}
                  onChange={handleFilterChange}
                  className={styles.dateInput}
                  max={filters.endDate || getTodayDate()}
                  required
                  aria-label="Select start date"
                />
              </div>

              <div className={styles.dateField}>
                <label htmlFor="toDate">To Date</label>
                <input
                  id="toDate"
                  name="endDate"
                  type="date"
                  value={filters.endDate}
                  onChange={handleFilterChange}
                  className={styles.dateInput}
                  min={filters.startDate}
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
                type="button"
                onClick={clearFilters}
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
                    Clear Filter
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={resetFilters}
                className={styles.secondaryBtn}
                disabled={loading}
                aria-label="Reset date filters"
              >
                <span className={styles.buttonIcon}></span>
                Reset Filter
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* SUMMARY SECTION */}
      {summary.count > 0 && (
        <div className={styles.statsCard}>
          <h3>
            Summary{" "}
            <span className={styles.dateRange}>
              {getDateRangeLabel(filters.startDate, filters.endDate)}
            </span>
          </h3>
          <div className={styles.statsGrid}>
            <StatItem
              label="Total Milk"
              value={summary.milk.toFixed(2)}
              unit="L"
            />
            <StatItem label="Avg Fat" value={summary.avgFat} unit="%" />
            <StatItem label="Avg SNF" value={summary.avgSnf} unit="%" />
            <StatItem
              label="Avg Milk/Day"
              value={(summary.milk / summary.daysWithData || 0).toFixed(2)}
              unit="L"
            />
            <StatItem
              label="Avg Rate"
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

            {/* <StatItem label="Days with Data" value={summary.daysWithData} /> */}
          </div>
        </div>
      )}

      {/* RECORD COUNT */}
      {summary.count > 0 && (
        <div className={styles.recordCount}>
          Showing {filteredProcurements.length.toLocaleString()} record
          {filteredProcurements.length !== 1 ? "s" : ""}
          {filters.startDate || filters.endDate
            ? ` for selected date range`
            : ""}
        </div>
      )}

      {/* TABLE SECTION */}
      <div className={styles.tableWrapper}>
        {summary.count === 0 ? (
          <div className={styles.emptyState}>
            {procurementData.length === 0 ? (
              <>
                <span className={styles.emptyIcon}>📊</span>
                <h3>No Procurement History</h3>
                <p>No procurement records found in the system.</p>
              </>
            ) : (
              <>
                <span className={styles.emptyIcon}>🔍</span>
                <h3>No Records Found</h3>
                <p>No procurement records found for the selected date range</p>
                <button
                  onClick={resetFilters}
                  className={styles.clearFilterBtn}
                  disabled={loading}
                >
                  Reset filters to see all{" "}
                  {procurementData.length.toLocaleString()} records
                </button>
              </>
            )}
          </div>
        ) : (
          <div className={styles.tableContainer}>
            {/* <div className={styles.tableHeader}>
              <h4>Procurement Records</h4>
              <span className={styles.tableInfo}>
                Sorted by Date (Newest First)
              </span>
            </div> */}
            <div className={styles.tableScroll}>
              <table
                className={styles.table}
                aria-label="All procurement history"
              >
                <thead>
                  <tr>
                    <th scope="col" className={styles.dateHeader}>
                      Date
                    </th>
                    <th scope="col" className={styles.supplierHeader}>
                      Supplier
                    </th>
                    {/* <th scope="col" className={styles.typeHeader}>
                      Type
                    </th> */}
                    <th scope="col" className={styles.timeHeader}>
                      Time
                    </th>
                    <th scope="col" className={styles.quantityHeader}>
                      Milk (L)
                    </th>
                    <th scope="col" className={styles.fatHeader}>
                      Fat %
                    </th>
                    <th scope="col" className={styles.snfHeader}>
                      SNF %
                    </th>
                    <th scope="col" className={styles.tsRateHeader}>
                      TS Rate
                    </th>
                    <th scope="col" className={styles.rateHeader}>
                      Rate/L
                    </th>
                    <th scope="col" className={styles.totalHeader}>
                      Total (₹)
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredProcurements.map((row, index) => (
                    <tr
                      key={
                        row._id ||
                        `${row.date}-${row.supplierName || "unknown"}-${index}`
                      }
                      className={
                        index % 2 === 0 ? styles.evenRow : styles.oddRow
                      }
                    >
                      <td className={styles.dateCell}>
                        {new Date(row.date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>

                      <td className={styles.supplierCell}>
                        {row.supplierName ? (
                          <Link
                            href={`/supplier/procurement?supplierId=${row.supplierId}`}
                            className={styles.supplierName}
                          >
                            {row.supplierName}
                          </Link>
                        ) : (
                          "Unknown"
                        )}
                      </td>

                      {/* <td className={styles.typeCell}>
                        <span
                          className={getSupplierTypeClass(row.supplierType)}
                          title={row.supplierType || "Unknown type"}
                        >
                          {formatSupplierType(row.supplierType)}
                        </span>
                      </td> */}

                      <td className={styles.timeCell}>
                        <span
                          className={
                            row.time === "AM" ? styles.amBadge : styles.pmBadge
                          }
                          title={row.time === "AM" ? "Morning" : "Evening"}
                        >
                          {row.time || "AM"}
                        </span>
                      </td>

                      <td className={styles.quantityCell} data-label="Milk (L)">
                        {(parseFloat(row.milkQuantity) || 0).toFixed(2)}
                      </td>

                      <td className={styles.fatCell} data-label="Fat %">
                        {(parseFloat(row.fatPercentage) || 0).toFixed(1)}
                      </td>

                      <td className={styles.snfCell} data-label="SNF %">
                        {(parseFloat(row.snfPercentage) || 0).toFixed(1)}
                      </td>
                      <td className={styles.tsRateCell} data-label="TS Rate">
                        {row.supplierTSRate
                          ? `${parseInt(row.supplierTSRate)}`
                          : "N/A"}
                      </td>

                      <td className={styles.rateCell} data-label="Rate/L">
                        ₹{(parseFloat(row.rate) || 0).toFixed(1)}
                      </td>

                      <td className={styles.totalCell} data-label="Total (₹)">
                        ₹{formatNumberWithCommasNoDecimal(row.totalAmount || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ========== EXPORT WITH SUSPENSE ==========
export default function ProcurementHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.container}>
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <span className={styles.loadingText}>
              Loading procurement history page...
            </span>
          </div>
        </div>
      }
    >
      <ProcurementHistoryContent />
    </Suspense>
  );
}
