"use client";

import { getPreviousMonthDate, getTodayDate } from "@/utils/dateUtils";
import { useState, useMemo, useEffect, useCallback } from "react";
import styles from "@/css/supplier-payment.module.css";
import {
  formatNumberWithCommas,
  formatNumberWithCommasNoDecimal,
} from "@/utils/formatNumberWithComma";
import { ToastContainer, toast } from "react-toastify";
import Link from "next/link";

// ========== CONSTANTS ==========
const INITIAL_FILTERS = {
  startDate: "2026-03-01",
  endDate: getTodayDate(),
};

// ========== HELPER FUNCTIONS ==========
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

const getSupplierTypeClass = (supplierType) => {
  const typeClassMap = {
    Society: styles.type_society,
    Milkman: styles.type_milkman,
    Farmer: styles.type_farmer,
    Other: styles.type_other,
  };
  return typeClassMap[supplierType] || styles.type_other;
};

const formatTimeBadge = (time) => {
  if (!time) return "AM";
  const timeUpper = time.toUpperCase();
  return timeUpper === "PM" ? "PM" : "AM";
};

// ========== LOADING SPINNER ==========
const LoadingSpinner = () => (
  <div className={styles.loading_container}>
    <div className={styles.spinner}></div>
    <span className={styles.loading_text}>Loading procurement records...</span>
  </div>
);

// ========== MAIN COMPONENT ==========
export default function Payments() {
  const [supplierList, setSupplierList] = useState([]);
  const [procurementRecords, setProcurementRecords] = useState([]);
  const [checkedIds, setCheckedIds] = useState([]);
  const [checkedISupplierId, setCheckedSupplierId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [statusFilter, setStatusFilter] = useState(""); // "Paid", "Not Paid", or ""

  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 1. Fetch Suppliers
  useEffect(() => {
    async function fetchSuppliers() {
      try {
        const res = await fetch("/api/supplier");
        if (!res.ok) throw new Error("Failed to fetch suppliers");
        const data = await res.json();
        setSupplierList(Array.isArray(data) ? data : data.data || []);
      } catch (error) {
        console.error(error);
        setSupplierList([]);
        toast.error(error.message);
      }
    }
    fetchSuppliers();
  }, []);

  // 2. Fetch Procurements (accepts signal for abort)
  const fetchSupplierProcurements = useCallback(
    async (signal) => {
      setIsLoading(true);
      setCheckedIds([]);
      try {
        const queryParams = new URLSearchParams();
        if (filters.startDate)
          queryParams.append("startDate", filters.startDate);
        if (filters.endDate) queryParams.append("endDate", filters.endDate);

        const res = await fetch(
          `/api/supplier/procurement/history?${queryParams}`,
          { cache: "no-store", signal },
        );

        if (!res.ok) throw new Error("Failed to load procurement history");

        const data = await res.json();
        const records = Array.isArray(data) ? data : data.data || [];
        setProcurementRecords(records);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error(error);
          toast.error(error.message);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchSupplierProcurements(controller.signal);
    return () => controller.abort();
  }, [fetchSupplierProcurements]);

  // 3. Bulk Payment Handler
  const handleBulkMarkAsPaid = async () => {
    if (checkedIds.length === 0) return;

    if (!window.confirm(`Mark ${checkedIds.length} records as paid?`)) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/supplier/procurement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ procurementIds: checkedIds, status: "Paid" }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Bulk update failed");

      toast.success(`Successfully marked ${checkedIds.length} records as paid`);
      setCheckedIds([]);
      await fetchSupplierProcurements(); // refresh data
    } catch (error) {
      console.error(error);
      alert(error.message || "Failed to process bulk payment");
    } finally {
      setSubmitting(false);
    }
  };

  // 4. Checkbox Handlers
  const handleCheck = (id, supplierId) => {
    if (!checkedISupplierId) {
      setCheckedSupplierId(supplierId);
    }

    setCheckedIds((prev) =>
      prev.includes(id)
        ? prev.filter((itemId) => itemId !== id)
        : [...prev, id],
    );
  };

  useEffect(() => {
    if (checkedISupplierId && checkedIds.length == 0) {
      setCheckedSupplierId("");
    }
  }, [checkedIds]);

  const handleSelectAll = (e, supplierId) => {
    const eligibleIds = supplierTotalsMap[supplierId].procurements
      .filter((row) => row.paymentStatus !== "Paid")
      .map((row) => row._id);

    setCheckedIds((prev) =>
      e.target.checked
        ? [...new Set([...prev, ...eligibleIds])]
        : prev.filter((id) => !eligibleIds.includes(id)),
    );
  };

  // 5. Supplier Totals + Procurements (memoized)
  const supplierTotalsMap = useMemo(() => {
    const totals = {
      all: {
        totalMilk: 0,
        totalFat: 0,
        totalSnf: 0,
        uniqueDates: new Set(),
        totalAmount: 0,
        paidAmount: 0,
        dueAmount: 0,
        procurements: [],
      },
    };

    if (procurementRecords.length === 0) return totals;

    let globalFat = 0;
    let globalSnf = 0;

    procurementRecords.forEach((record) => {
      const id = record.supplierId;

      if (!totals[id]) {
        totals[id] = {
          totalMilk: 0,
          totalFat: 0,
          totalSnf: 0,
          uniqueDates: new Set(),
          totalAmount: 0,
          paidAmount: 0,
          dueAmount: 0,
          procurements: [],
        };
      }

      const milk = parseFloat(record.milkQuantity) || 0;
      const fat = parseFloat(record.fatPercentage) || 0;
      const snf = parseFloat(record.snfPercentage) || 0;
      const amount = parseFloat(record.totalAmount) || 0;
      const date = record.date;
      const isPaid = record.paymentStatus === "Paid";

      // supplier totals
      totals[id].totalMilk += milk;
      totals[id].totalFat += fat;
      totals[id].totalSnf += snf;
      totals[id].uniqueDates.add(date);
      totals[id].totalAmount += amount;

      if (isPaid) {
        totals[id].paidAmount += amount;
      } else {
        totals[id].dueAmount += amount;
      }

      // filter procurements by statusFilter
      if (statusFilter === "Paid" && isPaid) {
        totals[id].procurements.push(record);
      } else if (statusFilter === "Not Paid" && !isPaid) {
        totals[id].procurements.push(record);
      } else if (statusFilter === "") {
        totals[id].procurements.push(record);
      }

      // global totals
      totals.all.totalMilk += milk;
      globalFat += fat;
      globalSnf += snf;
      totals.all.uniqueDates.add(date);
      totals.all.totalAmount += amount;

      if (isPaid) {
        totals.all.paidAmount += amount;
      } else {
        totals.all.dueAmount += amount;
      }
    });

    const totalCount = procurementRecords.length;
    totals.all.avgFat =
      totalCount > 0 ? (globalFat / totalCount).toFixed(1) : "0.0";
    totals.all.avgSnf =
      totalCount > 0 ? (globalSnf / totalCount).toFixed(1) : "0.0";

    return totals;
  }, [procurementRecords, statusFilter]);

  // 6. Filtered supplier list (by search)
  const filteredSupplierList = useMemo(() => {
    if (!searchQuery.trim()) return supplierList;
    return supplierList.filter((supplier) =>
      supplier.supplierName.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [supplierList, searchQuery]);

  // 7. Filter Handlers
  const handleFilterChange = (e) => {
    if (checkedIds.length > 0) {
      if (
        !window.confirm(`checked records will lost, do you want to continue ?`)
      )
        return;
    }
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const resetFilters = () => setFilters(INITIAL_FILTERS);
  const clearFilters = () =>
    setFilters({ startDate: "2026-03-01", endDate: "" });
  const loadTodayData = () =>
    setFilters({ startDate: getTodayDate(), endDate: getTodayDate() });

  const globalStats = supplierTotalsMap.all;

  return (
    <div className={styles.page_container}>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        closeOnClick
        pauseOnHover
        draggable
      />

      <div className={styles.header_content}>
        <h1 className={styles.page_title}>Supplier Payments</h1>
      </div>

      {/* Search & Filters */}
      <div className={styles.filter_section}>
        {/* Search */}
        <div className={styles.search_wrapper}>
          <label htmlFor="searchInput" className={styles.search_label}>
            Search Suppliers:
          </label>
          <div className={styles.search_input_group}>
            <input
              id="searchInput"
              type="text"
              placeholder="Search by name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.search_input}
              disabled={isLoading}
              autoComplete="off"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className={styles.clear_search_button}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <div className={styles.search_stats}>
            {isLoading ? (
              <span className={styles.loading_text}>Searching...</span>
            ) : (
              <span className={styles.result_count}>
                Showing{" "}
                {
                  filteredSupplierList.filter((s) =>
                    Object.keys(supplierTotalsMap).includes(s._id),
                  ).length
                }{" "}
                of {supplierList.length} suppliers
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className={styles.filter_section}>
        {/* <div className={styles.radio_group}>
          <label className={styles.radio_label}>
            <input
              type="radio"
              name="statusFilter"
              value=""
              checked={statusFilter === ""}
              onChange={() => setStatusFilter("")}
            />
            <span>All Records</span>
          </label>
          <label className={styles.radio_label}>
            <input
              type="radio"
              name="statusFilter"
              value="Paid"
              checked={statusFilter === "Paid"}
              onChange={() => setStatusFilter("Paid")}
            />
            <span className={styles.text_green}>Paid</span>
          </label>
          <label className={styles.radio_label}>
            <input
              type="radio"
              name="statusFilter"
              value="Not Paid"
              checked={statusFilter === "Not Paid"}
              onChange={() => setStatusFilter("Not Paid")}
            />
            <span className={styles.text_red}>Due</span>
          </label>
        </div> */}

        {/* Date Filters */}

        <div className={styles.filter_title}>
          <h2>Filter by Date Range</h2>
        </div>
        <div className={styles.date_input_group}>
          <span>From Date</span>
          <input
            type="date"
            name="startDate"
            value={filters.startDate}
            onChange={handleFilterChange}
            min="2026-03-01"
            max={filters.endDate || getTodayDate()}
            className={styles.date_input}
          />
          <span>To Date</span>
          <input
            type="date"
            name="endDate"
            value={filters.endDate}
            onChange={handleFilterChange}
            min={filters.startDate}
            max={getTodayDate()}
            className={styles.date_input}
          />
        </div>

        {/* Filter Actions */}
        <div className={styles.filter_actions}>
          <button
            onClick={resetFilters}
            className={`${styles.btn} ${styles.btn_reset}`}
          >
            Reset
          </button>
          <button
            onClick={clearFilters}
            className={`${styles.btn} ${styles.btn_clear}`}
            disabled={!filters.endDate}
          >
            Clear
          </button>
          <button
            onClick={loadTodayData}
            className={`${styles.btn} ${styles.btn_today}`}
          >
            Load Today
          </button>
        </div>
      </div>

      {/* Global Summary (All Suppliers) */}
      {!isLoading && globalStats.totalAmount > 0 && !searchQuery && (
        <div className={styles.global_summary_card}>
          <div className={styles.global_header}>
            <h2 className={styles.global_title}>All Suppliers Summary</h2>
            <span className={styles.date_range_badge}>
              {getFormattedDateRange(filters.startDate, filters.endDate)}
            </span>
          </div>

          <div className={styles.global_stats_grid}>
            <div className={styles.global_stat_item}>
              <div className={styles.global_stat_label}>Total Milk</div>
              <div className={styles.global_stat_value}>
                {formatNumberWithCommas(globalStats.totalMilk.toFixed(2))}{" "}
                <span className={styles.unit_label}>L</span>
              </div>
            </div>
            <div className={styles.global_stat_item}>
              <div className={styles.global_stat_label}>Total Amount</div>
              <div className={styles.global_stat_value}>
                ₹{formatNumberWithCommas(globalStats.totalAmount.toFixed(2))}
              </div>
            </div>
            <div className={styles.global_stat_item}>
              <div className={styles.global_stat_label}>Total Paid</div>
              <div
                className={`${styles.global_stat_value} ${styles.text_green}`}
              >
                ₹{formatNumberWithCommas(globalStats.paidAmount.toFixed(2))}
              </div>
            </div>
            <div className={styles.global_stat_item}>
              <div className={styles.global_stat_label}>Total Due</div>
              <div className={`${styles.global_stat_value} ${styles.text_red}`}>
                ₹{formatNumberWithCommas(globalStats.dueAmount.toFixed(2))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Actions Banner */}

      {/* Supplier Grid (Cards) */}
      {isLoading ? (
        <div className={styles.supplier_card}>
          <LoadingSpinner />
        </div>
      ) : (
        <div className={styles.supplier_grid}>
          {filteredSupplierList.map((supplier) => {
            const stats = supplierTotalsMap[supplier._id];
            if (
              !stats ||
              stats.totalAmount === 0 ||
              stats.procurements.length === 0
            )
              return null;

            const eligibleProcurements = stats.procurements.filter(
              (r) => r.paymentStatus !== "Paid",
            );
            const isAllChecked =
              eligibleProcurements.length > 0 &&
              eligibleProcurements.every((r) => checkedIds.includes(r._id));

            return (
              <div key={supplier._id} className={styles.supplier_card}>
                {/* Card Header */}
                <div className={styles.card_header}>
                  <div className={styles.header_left}>
                    <h3 className={styles.supplier_name}>
                      <Link
                        href={`/supplier/procurement?supplierId=${supplier._id}`}
                        className={styles.supplierName}
                      >
                        {supplier.supplierName || "-"}
                      </Link>
                    </h3>
                    <span
                      className={getSupplierTypeClass(supplier.supplierType)}
                    >
                      {supplier.supplierType}
                    </span>
                  </div>
                  {/* <span className={styles.date_range_badge}>
                    {getFormattedDateRange(filters.startDate, filters.endDate)}
                  </span> */}
                </div>

                {/* Quick Stats Row */}
                <div className={styles.quick_stats}>
                  <div className={styles.stat_card}>
                    <div className={styles.stat_card_label}>Total Milk</div>
                    <div className={styles.stat_card_value}>
                      {stats.totalMilk.toFixed(2)}{" "}
                      <span className={styles.unit_label}>L</span>
                    </div>
                  </div>
                  <div className={styles.stat_card}>
                    <div className={styles.stat_card_label}>Total Amount</div>
                    <div className={styles.stat_card_value}>
                      ₹{formatNumberWithCommasNoDecimal(stats.totalAmount)}
                    </div>
                  </div>
                  <div className={styles.stat_card}>
                    <div className={styles.stat_card_label}>Paid</div>
                    <div
                      className={`${styles.stat_card_value} ${styles.text_green}`}
                    >
                      ₹{formatNumberWithCommasNoDecimal(stats.paidAmount)}
                    </div>
                  </div>
                  <div className={styles.stat_card}>
                    <div className={styles.stat_card_label}>Due</div>
                    <div
                      className={`${styles.stat_card_value} ${styles.text_red}`}
                    >
                      ₹{formatNumberWithCommasNoDecimal(stats.dueAmount)}
                    </div>
                  </div>
                </div>
                {checkedIds.length > 0 &&
                  supplier._id == checkedISupplierId && (
                    <div className={styles.bulk_actions_banner}>
                      <span className={styles.bulk_actions_text}>
                        {checkedIds.length} record(s) selected
                      </span>
                      <div className={styles.bulk_actions}>
                        <button
                          onClick={handleBulkMarkAsPaid}
                          disabled={submitting}
                          className={styles.payment_btn}
                        >
                          {submitting ? "Processing..." : "Mark as Paid"}
                        </button>
                        <button
                          onClick={() => setCheckedIds([])}
                          disabled={submitting}
                          className={styles.clear_filter_link}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                {/* Procurement Table (with extra columns) */}
                <div className={styles.table_wrapper}>
                  <table className={styles.procurement_table}>
                    <thead>
                      <tr className={styles.table_head_row}>
                        <th className={styles.table_header_cell}>Date</th>
                        <th className={styles.table_header_cell}>Time</th>
                        <th className={styles.table_header_cell}>Qty (L)</th>
                        <th className={styles.table_header_cell}>Fat %</th>
                        <th className={styles.table_header_cell}>SNF %</th>
                        {/* <th className={styles.table_header_cell}>TS Rate</th> */}
                        <th className={styles.table_header_cell}>Rate/L</th>
                        <th className={styles.table_header_cell}>Total (₹)</th>
                        <th className={styles.table_header_cell}>
                          <div className={styles.select_all_wrapper}>
                            {(eligibleProcurements.length > 0 &&
                              filters.startDate !==
                                INITIAL_FILTERS.startDate) ||
                              (filters.endDate !== INITIAL_FILTERS.endDate &&
                                filters.startDate &&
                                filters.endDate &&
                                supplier._id == checkedISupplierId && (
                                  <input
                                    type="checkbox"
                                    className={styles.payment_checkbox}
                                    onChange={(e) =>
                                      handleSelectAll(e, supplier._id)
                                    }
                                    disabled={isLoading}
                                    checked={isAllChecked}
                                    title="Select All Unpaid"
                                  />
                                ))}
                            Status
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.procurements.map((row, index) => {
                        const showDate =
                          index === 0 ||
                          stats.procurements[index - 1].date !== row.date;
                        const timeBadge = formatTimeBadge(row.time);

                        return (
                          <tr key={row._id} className={styles.table_row}>
                            <td className={styles.table_cell}>
                              {showDate ? (
                                new Date(row.date).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                })
                              ) : (
                                <span className={styles.continuation_arrow}>
                                  ↳
                                </span>
                              )}
                            </td>
                            <td className={styles.table_cell}>
                              <span
                                className={
                                  timeBadge === "PM"
                                    ? styles.pm_badge
                                    : styles.am_badge
                                }
                              >
                                {timeBadge}
                              </span>
                            </td>
                            <td className={styles.table_cell}>
                              {(parseFloat(row.milkQuantity) || 0).toFixed(1)}
                            </td>
                            <td className={styles.table_cell}>
                              {(parseFloat(row.fatPercentage) || 0).toFixed(1)}
                            </td>
                            <td className={styles.table_cell}>
                              {(parseFloat(row.snfPercentage) || 0).toFixed(1)}
                            </td>
                            {/* <td className={styles.table_cell}>
                              {row.supplierTSRate
                                ? parseInt(row.supplierTSRate)
                                : "N/A"}
                            </td> */}
                            <td className={styles.table_cell}>
                              ₹{(parseFloat(row.rate) || 0).toFixed(1)}
                            </td>
                            <td
                              className={`${styles.table_cell} ${styles.cell_total}`}
                            >
                              ₹
                              {formatNumberWithCommasNoDecimal(row.totalAmount)}
                            </td>
                            <td className={styles.table_cell}>
                              {row.paymentStatus === "Paid" ? (
                                <span className={styles.status_paid}>Paid</span>
                              ) : (
                                <div className={styles.unpaid_wrapper}>
                                  {checkedISupplierId ? (
                                    supplier._id == checkedISupplierId ? (
                                      <input
                                        type="checkbox"
                                        className={styles.payment_checkbox}
                                        checked={checkedIds.includes(row._id)}
                                        onChange={() =>
                                          handleCheck(row._id, supplier._id)
                                        }
                                      />
                                    ) : null
                                  ) : (
                                    <input
                                      type="checkbox"
                                      className={styles.payment_checkbox}
                                      checked={checkedIds.includes(row._id)}
                                      onChange={() =>
                                        handleCheck(row._id, supplier._id)
                                      }
                                    />
                                  )}
                                  <span className={styles.status_due}>Due</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {filteredSupplierList.length === 0 && !isLoading && (
            <div className={styles.empty_state}>
              <span className={styles.empty_icon}>🔍</span>
              <p className={styles.empty_state_text}>
                No suppliers match your search criteria.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
