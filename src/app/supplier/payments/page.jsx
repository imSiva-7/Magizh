"use client";
import AdminSummary from "@/components/AdminSummary";
import DataSkeleton from "@/components/DataSkeleton";
import { formatDateForDisplay } from "@/lib/india-date.mjs";

import { statNumberTone } from "@/lib/stat-number-tone";
import { formatStat } from "@/utils/formatNumberWithComma";
import CategoryBadge from "@/components/CategoryBadge";

import { getCurrentMonthStartDate, getTodayDate } from "@/utils/dateUtils";
import { useState, useMemo, useEffect, useCallback } from "react";
import styles from "@/css/supplier-payment.module.css";
import {
  formatNumberWithCommas,
  formatNumberWithCommasNoDecimal,
} from "@/utils/formatNumberWithComma";
import { useSession } from "next-auth/react";
import { ToastContainer, toast } from "react-toastify";
import Link from "next/link";
import StatTrendBackground from "@/components/StatTrendBackground";
import trendStyles from "@/css/stat-trend.module.css";
import { procurementDaily } from "@/lib/supplier-charts";


const getInitialFilters = () => ({
  startDate: getCurrentMonthStartDate(),
  endDate: getTodayDate(),
});

const INITIAL_VISIBLE_COUNT = 20;

const getFormattedDateRange = (startDate, endDate) => {
  if (startDate && endDate) {
    const from = formatDateForDisplay(startDate);
    const to = formatDateForDisplay(endDate);
    return from === to ? from : `${from} to ${to}`;
  }
  if (startDate)
    return `From ${formatDateForDisplay(startDate)}`;
  if (endDate) return `Till ${formatDateForDisplay(endDate)}`;
  return "All Records";
};



const formatTimeBadge = (time) => {
  if (!time) return "AM";
  const timeUpper = time.toUpperCase();
  return timeUpper === "PM" ? "PM" : "AM";
};

const LoadingSpinner = () => <DataSkeleton label="Loading procurement records..." />;

export default function Payments() {
  const [supplierList, setSupplierList] = useState([]);
  const [procurementRecords, setProcurementRecords] = useState([]);
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [checkedIds, setCheckedIds] = useState([]);
  const [checkedSupplierId, setCheckedSupplierId] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState(getInitialFilters);
  const [statusFilter, setStatusFilter] = useState("");

  const [visibleCounts, setVisibleCounts] = useState({});

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchSuppliers() {
      setIsLoadingSuppliers(true);
      try {
        const res = await fetch("/api/supplier");
        if (!res.ok) throw new Error("Failed to fetch suppliers");
        const data = await res.json();
        setSupplierList(Array.isArray(data) ? data : data.data || []);
      } catch (error) {
        console.error(error);
        setSupplierList([]);
        toast.error(error.message);
      } finally {
        setIsLoadingSuppliers(false);
      }
    }
    fetchSuppliers();
  }, []);

  const fetchSupplierProcurements = useCallback(
    async (signal) => {
      setIsLoading(true);

      try {
        const queryParams = new URLSearchParams();
        
        if (filters.startDate)
          queryParams.append("startDate", filters.startDate);
        if (filters.endDate) queryParams.append("endDate", filters.endDate);

        const res = await fetch(
          `/api/supplier/procurement/history?${queryParams}`,
          {
            cache: "no-store",
            signal,
          },
        );

        if (!res.ok) throw new Error("Failed to load procurement history");

        const data = await res.json();
        const records = Array.isArray(data) ? data : data.data || [];
        if (!signal?.aborted) setProcurementRecords(records);
      } catch (error) {
        if (error.name !== "AbortError" && !signal?.aborted) {
          console.error(error);
          setProcurementRecords([]);
          toast.error(error.message);
        }
      } finally {
        if (!signal?.aborted) {
          setCheckedIds([]);
          setCheckedSupplierId("");
          setIsLoading(false);
        }
      }
    },
    [filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchSupplierProcurements(controller.signal);
    return () => controller.abort();
  }, [fetchSupplierProcurements]);

  const handleBulkUpdateStatus = async (status) => {
    if (!isAdmin || submitting || checkedIds.length === 0) return;
    if (!window.confirm(`Mark ${checkedIds.length} records as ${status}?`))
      return;

    setSubmitting(true);
    const selectedIds = new Set(checkedIds);
    const notification = toast.loading(`Updating ${selectedIds.size} payment records…`);
    try {
      const res = await fetch("/api/supplier/procurement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          procurementIds: checkedIds,
          status,
            actionDoneBy: session?.user?.email,
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Bulk update failed");

      toast.update(notification, { render: `Successfully marked ${selectedIds.size} records as ${status}`, type: "success", isLoading: false, autoClose: 5000 });

      setProcurementRecords((prevRecords) =>
        prevRecords.map((record) =>
          selectedIds.has(record._id)
            ? { ...record, paymentStatus: status }
            : record,
        ),
      );
      setCheckedIds([]);
      setCheckedSupplierId("");
      // await fetchSupplierProcurements();
    } catch (error) {
      console.error(error);
      toast.update(notification, { render: error.message || "Failed to process bulk payment", type: "error", isLoading: false, autoClose: 5000 });
    } finally {
      setSubmitting(false);
    }
  };

  // Selection logic
  const handleCheck = (id, supplierId) => {
    if (!checkedSupplierId) setCheckedSupplierId(supplierId);

    setCheckedIds((prev) => {
      const newSelected = prev.includes(id)
        ? prev.filter((itemId) => itemId !== id)
        : [...prev, id];
      if (newSelected.length === 0) setCheckedSupplierId("");
      return newSelected;
    });
  };

  const handleSelectAll = (e, supplierId, procurements) => {
    const eligibleIds = procurements.map((row) => row._id);

    if (e.target.checked) {
      setCheckedSupplierId(supplierId);
      setCheckedIds((prev) => [...new Set([...prev, ...eligibleIds])]);
    } else {
      setCheckedIds((prev) => {
        const newSelected = prev.filter((id) => !eligibleIds.includes(id));
        if (newSelected.length === 0) setCheckedSupplierId("");
        return newSelected;
      });
    }
  };

  const handleShowMore = (supplierId) => {
    setVisibleCounts((prev) => ({
      ...prev,
      [supplierId]:
        (prev[supplierId] || INITIAL_VISIBLE_COUNT) + INITIAL_VISIBLE_COUNT,
    }));
  };

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
      if ((statusFilter === "Paid" && record.paymentStatus !== "Paid") || (statusFilter === "Not Paid" && record.paymentStatus === "Paid")) return;
      const id = record.supplierId;

      if (!totals[id]) {
        totals[id] = {
          totalMilk: 0,
          totalFatSum: 0,
          totalSnfSum: 0,
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

      totals[id].totalMilk += milk;
      totals[id].totalFatSum += fat;
      totals[id].totalSnfSum += snf;
      totals[id].uniqueDates.add(date);
      totals[id].totalAmount += amount;

      if (isPaid) {
        totals[id].paidAmount += amount;
      } else {
        totals[id].dueAmount += amount;
      }

      // Filter by statusFilter
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

  // Filtered supplier list (by search) - sorted by total milk quantity
  const filteredSupplierList = useMemo(() => {
    let filtered = searchQuery.trim()
      ? supplierList.filter((supplier) =>
          supplier.supplierName.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : supplierList;

    // Sort by total milk quantity (highest first)
    return [...filtered].filter((supplier) => supplierTotalsMap[supplier._id]?.procurements.length > 0).sort((a, b) => {
      const milkA = supplierTotalsMap[a._id]?.totalMilk || 0;
      const milkB = supplierTotalsMap[b._id]?.totalMilk || 0;
      return milkB - milkA; // Descending order (highest first)
    });
  }, [supplierList, searchQuery, supplierTotalsMap]);

  // Filter Handlers & Warnings
  const confirmClearChecked = () => {
    if (checkedIds.length > 0) {
      return window.confirm(
        `Checked records will be lost, do you want to continue?`,
      );
    }
    return true;
  };

  const handleFilterChange = (e) => {
    if (!confirmClearChecked()) return;
    setCheckedIds([]);
    setCheckedSupplierId("");
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleStatusChange = (newStatus) => {
    if (!confirmClearChecked()) return;
    setCheckedIds([]);
    setCheckedSupplierId("");
    setStatusFilter(newStatus);
  };

  const resetFilters = () => {
    if (!confirmClearChecked()) return;
    setCheckedIds([]);
    setCheckedSupplierId("");
    setFilters({
      startDate: getCurrentMonthStartDate(),
      endDate: getTodayDate(),
    });
    setStatusFilter("");
    toast.info("Filters reset to default.");
  };

  const clearFilters = () => {
    if (!confirmClearChecked()) return;
    setCheckedIds([]);
    setCheckedSupplierId("");
    setFilters({ startDate: "", endDate: "" });
    setStatusFilter("");
    toast.info("Date filters cleared.");
  };

  const loadTodayData = () => {
    if (!confirmClearChecked()) return;
    setCheckedIds([]);
    setCheckedSupplierId("");
    setFilters({ startDate: getTodayDate(), endDate: getTodayDate() });
    setStatusFilter("");
    toast.info("Loaded today's records.");
  };

  const globalStats = useMemo(() => filteredSupplierList.reduce((totals, supplier) => {
    const stats = supplierTotalsMap[supplier._id];
    for (const field of ["totalMilk", "totalAmount", "paidAmount", "dueAmount"]) totals[field] += stats[field] || 0;
    return totals;
  }, { totalMilk: 0, totalAmount: 0, paidAmount: 0, dueAmount: 0 }), [filteredSupplierList, supplierTotalsMap]);
  const cardTrends = useMemo(() => {
    const daily = procurementDaily(filteredSupplierList.flatMap(supplier => supplierTotalsMap[supplier._id].procurements));
    return Object.fromEntries(["milk", "amount", "paid", "due"].map(field => [field, daily.map(day => ({ date: day.date, value: day[field] }))]));
  }, [filteredSupplierList, supplierTotalsMap]);


// const vada = filteredSupplierList.map((supplier) => supplier.supplierID).sort((a, b) => b.supplierID.procurement.length - a.supplier.procurement.lenght)
 
// console.log(vada);
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

      {/* Search Section */}
      <AdminSummary><div data-filter="card" className={styles.filter_section}>
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
              <button data-button="icon"
                type="button"
                onClick={() => setSearchQuery("")}
                className={styles.clear_search_button}
                aria-label="Clear search"
                disabled={isLoading}
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
      </div></AdminSummary>

      {/* Date & Status Filters */}
      <AdminSummary><div data-filter="card" className={`${styles.filter_section} ${styles.status_filters}`}>
        <div data-filter="title" className={styles.filter_title}>
          <h2>Filter by Date Range & Status</h2>
        </div>

        {/* Status Radios */}
        <div className={styles.radio_group}>
          <label className={styles.radio_label}>
            <input
              type="radio"
              name="statusFilter"
              value=""
              checked={statusFilter === ""}
              onChange={() => handleStatusChange("")}
              disabled={isLoading}
            />
            <span>All Records</span>
          </label>
          <label className={styles.radio_label}>
            <input
              type="radio"
              name="statusFilter"
              value="Paid"
              checked={statusFilter === "Paid"}
              onChange={() => handleStatusChange("Paid")}
              disabled={isLoading}
            />
            <span className={styles.text_green}>Paid</span>
          </label>
          <label className={styles.radio_label}>
            <input
              type="radio"
              name="statusFilter"
              value="Not Paid"
              checked={statusFilter === "Not Paid"}
              onChange={() => handleStatusChange("Not Paid")}
              disabled={isLoading}
            />
            <span className={styles.text_red}>Due</span>
          </label>
        </div>

        {/* Date Inputs */}
        <div data-filter="grid" className={styles.date_input_group}>
          <div data-filter="field" className={styles.date_field}>
            <label htmlFor="startDate">From Date</label>
            <input
              type="date"
              id="startDate"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
              min="2026-03-01"
              max={filters.endDate || getTodayDate()}
              className={styles.date_input}
              disabled={isLoading}
            />
          </div>
          <div data-filter="field" className={styles.date_field}>
            <label htmlFor="endDate">To Date</label>
            <input
              type="date"
              id="endDate"
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
              min={filters.startDate}
              max={getTodayDate()}
              className={styles.date_input}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Filter Actions */}
        <div data-filter="actions" className={styles.filter_actions}>
          <button data-button="secondary"
            type="button"
            onClick={resetFilters}
            className={`${styles.btn} ${styles.btn_reset}`}
            disabled={isLoading}
          >
            Reset
          </button>
          <button data-button="secondary"
            type="button"
            onClick={clearFilters}
            className={`${styles.btn} ${styles.btn_clear}`}
            disabled={(!filters.endDate && !filters.startDate) || isLoading}
          >
            Clear
          </button>
          <button data-button="secondary"
            type="button"
            onClick={loadTodayData}
            className={`${styles.btn} ${styles.btn_today}`}
            disabled={isLoading}
          >
            Today
          </button>
        </div>
      </div></AdminSummary>

      {/* Global Summary (All Suppliers) */}
      {statusFilter && (
        <div className={styles.status_notice} role="status">
          <p>
            <strong>{statusFilter === "Not Paid" ? "Showing due payments only." : "Showing paid payments only."}</strong>{" "}
            {statusFilter === "Not Paid"
              ? "Paid records are excluded, so Paid shows ₹0 in this view. This does not mean no payments were made."
              : "Unpaid records are excluded, so Due shows ₹0 in this view. This does not mean there is no outstanding balance."}
            {" "}Stats and graphs reflect the selected filter.
          </p>
          <button type="button" data-button="secondary" onClick={() => handleStatusChange("")} disabled={isLoading}>
            Show all payments
          </button>
        </div>
      )}
      {!isLoading && globalStats.totalMilk > 0 && (
        <AdminSummary><div className={styles.global_summary_card}>
          <div className={styles.global_header}>
            <h2 className={styles.global_title}>Filtered Suppliers Summary</h2>
            <span className={styles.date_range_badge}>
              {getFormattedDateRange(filters.startDate, filters.endDate)}
            </span>
          </div>

          <div className={styles.global_stats_grid}>
            <div className={`${styles.global_stat_item} ${trendStyles.card}`}>
              <StatTrendBackground points={cardTrends.milk} />
              <div className={styles.global_stat_label}>Milk</div>
              <div data-stat-tone={statNumberTone("Milk", formatNumberWithCommas(globalStats.totalMilk, 2))} className={styles.global_stat_value}>
                {formatNumberWithCommas(globalStats.totalMilk, 2)}{" "}
                <span className={styles.unit_label}>L</span>
              </div>
            </div>
            <div className={`${styles.global_stat_item} ${trendStyles.card}`}>
              <StatTrendBackground points={cardTrends.amount} tone="amount" />
              <div className={styles.global_stat_label}>Value</div>
              <div data-stat-tone={statNumberTone("Value", formatStat(globalStats.totalAmount))} className={styles.global_stat_value}>
                ₹{formatStat(globalStats.totalAmount)}
              </div>
            </div>
            <div className={`${styles.global_stat_item} ${trendStyles.card}`}>
              <StatTrendBackground points={cardTrends.paid} />
              <div className={styles.global_stat_label}>Paid</div>
              <div data-stat-tone={statNumberTone("Paid", formatStat(globalStats.paidAmount))}
                className={`${styles.global_stat_value} ${styles.text_green}`}
              >
                ₹{formatStat(globalStats.paidAmount)}
              </div>
            </div>
            <div className={`${styles.global_stat_item} ${trendStyles.card}`}>
              <StatTrendBackground points={cardTrends.due} tone="amount" />
              <div className={styles.global_stat_label}>Due</div>
              <div data-stat-tone={statNumberTone("Due", formatStat(globalStats.dueAmount))} className={`${styles.global_stat_value} ${styles.text_red}`}>
                ₹{formatStat(globalStats.dueAmount)}
              </div>
            </div>
          </div>
        </div></AdminSummary>
      )}

      {/* Supplier Grid (Cards) */}
      {(isLoading || isLoadingSuppliers) ? (
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

            const procurements = stats.procurements;
            const visibleCount =
              visibleCounts[supplier._id] || INITIAL_VISIBLE_COUNT;
            const displayedProcurements = procurements.slice(0, visibleCount);
            const hasMore = procurements.length > visibleCount;

            // const eligibleProcurements = procurements;
            const isAllChecked =
              displayedProcurements.length > 0 &&
              displayedProcurements.every((r) => checkedIds.includes(r._id));

            const isSupplierDisabled =
              checkedSupplierId !== "" && checkedSupplierId !== supplier._id;

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
                    <CategoryBadge kind="supplier" value={supplier.supplierType} />
                  </div>
                </div>

                {/* Quick Stats Row */}
                <AdminSummary><div className={styles.quick_stats}>
                  <div className={styles.stat_card}>
                    <div className={styles.stat_card_label}>Milk</div>
                    <div data-stat-tone={statNumberTone("Milk", formatNumberWithCommas(stats.totalMilk, 2))} className={styles.stat_card_value}>
                      {formatNumberWithCommas(stats.totalMilk, 2)}{" "}
                      <span className={styles.unit_label}>L</span>
                    </div>
                  </div>
                  <div className={styles.stat_card}>
                    <div className={styles.stat_card_label}>Value</div>
                    <div data-stat-tone={statNumberTone("Value", formatStat(stats.totalAmount))} className={styles.stat_card_value}>
                      ₹{formatStat(stats.totalAmount)}
                    </div>
                  </div>
                  <div className={styles.stat_card}>
                    <div className={styles.stat_card_label}>Paid</div>
                    <div data-stat-tone={statNumberTone("Paid", formatStat(stats.paidAmount))}
                      className={`${styles.stat_card_value} ${styles.text_green}`}
                    >
                      ₹{formatStat(stats.paidAmount)}
                    </div>
                  </div>
                  <div className={styles.stat_card}>
                    <div className={styles.stat_card_label}>Due</div>
                    <div data-stat-tone={statNumberTone("Due", formatStat(stats.dueAmount))}
                      className={`${styles.stat_card_value} ${styles.text_red}`}
                    >
                      ₹{formatStat(stats.dueAmount)}
                    </div>
                  </div>
                </div></AdminSummary>

                {/* Bulk Action Banner for Active Supplier */}
                {isAdmin && checkedIds.length > 0 &&
                  supplier._id === checkedSupplierId && (
                    <div className={styles.bulk_actions_banner}>
                      <span className={styles.bulk_actions_text}>
                        {checkedIds.length} order(s) selected
                      </span>
                      <div className={styles.bulk_buttons}>
                        <button data-button="primary"
                          onClick={() => handleBulkUpdateStatus("Paid")}
                          disabled={submitting}
                          className={styles.primary_btn}
                        >
                          {submitting ? "Processing..." : "Mark  as Paid"}
                        </button>
                        <button data-button="secondary"
                          onClick={() => handleBulkUpdateStatus("Not Paid")}
                          disabled={submitting}
                          className={styles.secondary_btn}
                        >
                          {submitting ? "Processing..." : "Mark  as Unpaid"}
                        </button>
                        <AdminSummary><button data-button="secondary"
                          onClick={() => {
                            setCheckedIds([]);
                            setCheckedSupplierId("");
                          }}
                          disabled={submitting}
                          className={styles.clear_filter_link}
                        >
                          Cancel
                        </button></AdminSummary>
                      </div>
                    </div>
                  )}

                <div className={styles.table_wrapper}>
                  <table className={styles.procurement_table}>
                    <thead>
                      <tr className={styles.table_head_row}>
                        <th className={styles.table_header_cell}>Date</th>
                        <th className={styles.table_header_cell}>Time</th>
                        <th className={styles.table_header_cell}>Qty (L)</th>
                        <th className={styles.table_header_cell}>Fat/SNF</th>
                        {/* <th className={styles.table_header_cell}>Rate/L</th> */}
                        <th className={styles.table_header_cell}>Total (₹)</th>
                        <th className={styles.table_header_cell}>
                          {" "}
                          <div className={styles.select_all_wrapper}>
                            {
                              <input
                                type="checkbox"
                                className={styles.payment_checkbox}
                                onChange={(e) =>
                                  handleSelectAll(e, supplier._id, displayedProcurements)
                                }
                                disabled={!isAdmin || isSupplierDisabled}
                                checked={isAllChecked}
                                title={
                                  isSupplierDisabled
                                    ? "Complete active supplier's payment first"
                                    : "Select All Unpaid"
                                }
                              />
                            }
                            *
                          </div>
                        </th>

                        <th className={styles.table_header_cell}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedProcurements.map((row, index) => {
                        const showDate =
                          index === 0 ||
                          displayedProcurements[index - 1].date !== row.date;
                        const timeBadge = formatTimeBadge(row.time);

                        return (
                          <tr key={row._id} className={styles.table_row}>
                            <td className={styles.table_cell}>
                              {showDate ? (
                                formatDateForDisplay(row.date)
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
                              {formatNumberWithCommas(
                                (parseFloat(row.milkQuantity) || 0).toFixed(1),
                              )}
                            </td>
                            <td className={styles.table_cell}>
                              {(parseFloat(row.fatPercentage) || 0).toFixed(1)}{" "}
                              /{" "}
                              {(parseFloat(row.snfPercentage) || 0).toFixed(1)}
                            </td>
                            {/* <td className={styles.table_cell}>
                              ₹
                              {formatNumberWithCommas(
                                (parseFloat(row.rate) || 0).toFixed(2),
                              )}
                            </td> */}
                            <td
                              className={`${styles.table_cell} ${styles.cell_total}`}
                            >
                              ₹
                              {formatNumberWithCommasNoDecimal(row.totalAmount)}
                            </td>
                            <td className={styles.table_cell}>
                              <input
                                type="checkbox"
                                className={styles.payment_checkbox}
                                value={row._id}
                                disabled={!isAdmin || isSupplierDisabled}
                                checked={checkedIds.includes(row._id)}
                                onChange={() =>
                                  handleCheck(row._id, supplier._id)
                                }
                                title={
                                  isSupplierDisabled
                                    ? "Complete active supplier's payment first"
                                    : "Select to pay"
                                }
                              />
                            </td>
                            <td className={styles.table_cell}>
                              {row.paymentStatus === "Paid" ? (
                                <span className={styles.status_paid}>Paid</span>
                              ) : (
                                <div className={styles.unpaid_wrapper}>
                                  <span className={styles.status_due}>Due</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {hasMore && (
                    <div className={styles.show_more_container}>
                      <button data-button="secondary"
                        onClick={() => handleShowMore(supplier._id)}
                        className={styles.show_more_btn}
                        disabled={submitting}
                      >
                        Show More({procurements.length - visibleCount}{" "}
                        more)
                      </button>
                    </div>
                  )}
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
