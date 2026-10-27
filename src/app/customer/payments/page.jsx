"use client";
import AdminSummary from "@/components/AdminSummary";
import { totalCustomerDue } from "@/lib/customer-account-due.mjs";
import DataSkeleton from "@/components/DataSkeleton";
import { statNumberTone } from "@/lib/stat-number-tone";
import { formatStat } from "@/utils/formatNumberWithComma";
import CategoryBadge from "@/components/CategoryBadge";
import CustomerLeaderboard from "@/components/CustomerLeaderboard";

import CustomerPaymentDialog from "@/components/CustomerPaymentDialog";
import { matchesPeriodActivity, sumPaymentPeriod, paymentCardTrends } from "@/lib/customer-payment-period.mjs";
import StatTrendBackground from "@/components/StatTrendBackground";
import trendStyles from "@/css/stat-trend.module.css";
import { getCurrentMonthStartDate, getTodayDate } from "@/utils/dateUtils";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import styles from "@/css/customer-payment.module.css";
import {
  formatNumberWithCommasNoDecimal,
} from "@/utils/formatNumberWithComma";
import { useSession } from "next-auth/react";
import { ToastContainer, toast } from "react-toastify";
import Link from "next/link";
import Image from "next/image";
import { exportInvoiceToPDF } from "@/utils/exportInvoice";
import { formatDateForDisplay } from "@/utils/dateUtils";

// ========== CONSTANTS ==========
const getInitialFilters = () => ({
  startDate: getCurrentMonthStartDate(),
  endDate: getTodayDate(),
});

const INITIAL_VISIBLE_COUNT = 20;

// ========== HELPER FUNCTIONS ==========
// const getFormattedDateRange = (startDate, endDate) => {
//   if (startDate && endDate) {
//     const from = new Date(startDate).toLocaleDateString("en-IN");
//     const to = new Date(endDate).toLocaleDateString("en-IN");
//     return from === to ? from : `${from} to ${to}`;
//   }
//   if (startDate)
//     return `From ${new Date(startDate).toLocaleDateString("en-IN")}`;
//   if (endDate) return `Till ${new Date(endDate).toLocaleDateString("en-IN")}`;
//   return "All Records";
// };



// ========== REUSABLE COMPONENTS ==========
const LoadingSpinner = () => <DataSkeleton label="Loading customer orders..." />;

const StatItem = ({ label, value, unit = "", colorClass = "", trend, tone }) => (
  <div className={`${styles.stat_card} ${trend?.length ? trendStyles.card : ""}`}>
    {trend?.length > 0 && <StatTrendBackground points={trend} tone={tone} />}
    <div className={styles.stat_card_label}>{label}</div>
    <div data-stat-tone={statNumberTone(label, value)} className={`${styles.stat_card_value} ${colorClass}`}>
      {value}
      {unit && <span className={styles.stat_unit}>{unit}</span>}
    </div>
  </div>
);
// Comment editor component with button toggle
const CommentEditor = ({ orderId, initialComment, onSave, isSaving, canEdit }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [comment, setComment] = useState(initialComment || "");

  const handleSave = async () => {
    await onSave(orderId, comment);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setComment(initialComment || "");
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className={styles.comment_edit_container}>
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className={styles.comment_input}
          autoFocus
          disabled={isSaving}
          placeholder="Add comment..."
        />
        <div className={styles.comment_actions}>
          <button data-button="table-text"
            onClick={handleSave}
            className={styles.comment_save_btn}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button data-button="table-text"
            onClick={handleCancel}
            className={styles.comment_cancel_btn}
            disabled={isSaving}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.comment_display}>
      <span className={styles.comment_text}>{comment || "-"}</span>
      {canEdit && (<button data-button="table-icon"
        onClick={() => setIsEditing(true)}
        className={styles.comment_edit_btn}
        title="Edit comment"
      >
        <Image src="/edit-comment.png" alt="edit" width={20} height={20} />
      </button>)}
    </div>
  );
};

// ========== MAIN COMPONENT ==========
export default function CustomerPayments() {
  const [customerList, setCustomerList] = useState([]);
  const [ordersData, setOrdersData] = useState([]);
  const [customerTotals, setCustomerTotals] = useState({}); // Dialog balances only
  const [periodTotals, setPeriodTotals] = useState([]);
  const [periodError, setPeriodError] = useState("");
  const { data: session } = useSession();
  const canViewSummary = session?.user?.role === "admin";

  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState(getInitialFilters);
  const [statusFilter, setStatusFilter] = useState("");
  const [visibleCounts, setVisibleCounts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [savingCommentId, setSavingCommentId] = useState(null);
  const [showPaymentPopup, setShowPaymentPopup] = useState(false);
  const [openingCustomerId, setOpeningCustomerId] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [paymentDialogView, setPaymentDialogView] = useState("payment");
  const paymentTriggerRef = useRef(null);

  // Load the directory only. Period summaries do not depend on lifetime totals.
  useEffect(() => {
    const controller = new AbortController();
    async function fetchCustomers() {
      setIsLoadingCustomers(true);
      try {
        const response = await fetch("/api/customer", { signal: controller.signal });
        if (!response.ok) throw new Error("Failed to fetch customers");
        const data = await response.json();
        if (!controller.signal.aborted) setCustomerList(Array.isArray(data) ? data : data.data || []);
      } catch (error) {
        if (!controller.signal.aborted) { setCustomerList([]); toast.error(error.message); }
      } finally { if (!controller.signal.aborted) setIsLoadingCustomers(false); }
    }
    fetchCustomers(); return () => controller.abort();
  }, []);

  // Fetch orders with date filters
  const fetchOrders = useCallback(
    async (signal) => {
      setIsLoading(true);
      setPeriodError("");
      try {
        const queryParams = new URLSearchParams();
        if (filters.startDate)
          queryParams.append("startDate", filters.startDate);
        if (filters.endDate) queryParams.append("endDate", filters.endDate);

        const [res, summaryRes] = await Promise.all([
          fetch(`/api/customer/order/history?${queryParams}`, { cache: "no-store", signal }),
          (canViewSummary ? fetch(`/api/customer/payment-summary?${queryParams}`, { cache: "no-store", signal }) : Promise.resolve({ ok: true, json: async () => ({ customers: [] }) })),
        ]);
        if (!res.ok || !summaryRes.ok) throw new Error("Could not load data for this period. Please retry.");
        const [data, summary] = await Promise.all([res.json(), summaryRes.json()]);
        if (!Array.isArray(summary.customers)) throw new Error("Could not read payment totals for this period.");
        const orders = Array.isArray(data.orders) ? data.orders : [];
        if (!signal?.aborted) { setOrdersData(orders); setPeriodTotals(summary.customers); }
      } catch (error) {
        if (error.name !== "AbortError" && !signal?.aborted) {
          console.error(error);
          setPeriodError(error.message); setOrdersData([]); setPeriodTotals([]);
        }
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [filters, canViewSummary],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchOrders(controller.signal);
    return () => controller.abort();
  }, [fetchOrders]);

  const handleShowMore = (customerId) => {
    setVisibleCounts((prev) => ({
      ...prev,
      [customerId]:
        (prev[customerId] || INITIAL_VISIBLE_COUNT) + INITIAL_VISIBLE_COUNT,
    }));
  };

  // Comment update handler
  const handleCommentUpdate = async (orderId, newComment) => {
    if (savingCommentId === orderId) return;
    setSavingCommentId(orderId);

    const previousComment =
      ordersData.find((o) => o._id === orderId)?.comment || "";
    setOrdersData((prev) =>
      prev.map((order) =>
        order._id === orderId ? { ...order, comment: newComment } : order,
      ),
    );

    try {
      const res = await fetch("/api/customer/order", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: [orderId],
          comment: newComment,
          actionDoneBy: session?.user?.email,
        }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to update comment");
      toast.success("Comment updated");
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Could not update comment");
      setOrdersData((prev) =>
        prev.map((order) =>
          order._id === orderId
            ? { ...order, comment: previousComment }
            : order,
        ),
      );
    } finally {
      setSavingCommentId(null);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const resetFilters = () => {
    setFilters({
      startDate: getCurrentMonthStartDate(),
      endDate: getTodayDate(),
    });
    setStatusFilter("");
    toast.info("Filters reset to default.");
  };

  const clearFilters = () => {
    setFilters({ startDate: "", endDate: "" });
    setStatusFilter("");
    toast.info("Date filters cleared.");
  };

  const loadTodayData = () => {
    setFilters({ startDate: getTodayDate(), endDate: getTodayDate() });
    setStatusFilter("");
    toast.info("Loaded today's records.");
  };

  // Filtered page totals are period activity; account balances are only used
  // in the receipt dialog, where opening debts and credits must remain intact.
  const customerTotalsMap = useMemo(() => {
    const totals = Object.fromEntries(periodTotals.map(row => [row.customerId, { ...row, orders: [], uniqueDates: new Set() }]));
    for (const order of ordersData) {
      if (!canViewSummary && !totals[order.customerId]) totals[order.customerId] = { totalOrders: 0, orders: [], uniqueDates: new Set() };
      if (!totals[order.customerId]) continue;
      if (!canViewSummary) totals[order.customerId].totalOrders += 1;
      totals[order.customerId].orders.push(order);
      totals[order.customerId].uniqueDates.add(order.date);
    }
    return totals;
  }, [ordersData, periodTotals, canViewSummary]);

  const filteredCustomerList = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return customerList.filter(customer => (!term || customer.customerName?.toLowerCase().includes(term)) && (canViewSummary ? matchesPeriodActivity(customerTotalsMap[customer._id], statusFilter) : customerTotalsMap[customer._id]?.totalOrders > 0))
      .sort((a, b) => customerTotalsMap[b._id].totalOrders - customerTotalsMap[a._id].totalOrders);
  }, [customerList, searchQuery, customerTotalsMap, statusFilter, canViewSummary]);

  const globalStats = useMemo(() => sumPaymentPeriod(filteredCustomerList.map(customer => customerTotalsMap[customer._id])), [filteredCustomerList, customerTotalsMap]);
  const cardTrends = useMemo(() => paymentCardTrends(filteredCustomerList.map(customer => customerTotalsMap[customer._id])), [filteredCustomerList, customerTotalsMap]);

  const handleSingleInvoice = async (order, customer) => {
    const customerDetails = {
      customerName: customer.customerName,
      customerType: customer.customerType || "",
      address: customer.customerAddress || "",
      mobile: customer.customerMobile || "",
      customerGST: customer.customerGST || "",
    };
    const dateStr =
      formatDateForDisplay(order.date) || order.date.split("T")[0];
    const fileName = `${customer.customerName}_invoice_${dateStr}`;
    await exportInvoiceToPDF(
      [order],
      customerDetails,
      { start: dateStr, end: dateStr },
      fileName,
    );
    toast.success("Invoice downloaded");
  };

  // Handle opening payment popup
  const handleOpenPayment = async (customer, trigger, view = "payment") => {
    if (openingCustomerId) return;
    paymentTriggerRef.current = trigger;
    setPaymentDialogView(view);
    setOpeningCustomerId(customer._id);
    try {
      const response = await fetch(`/api/customer/total_orders?customerId=${encodeURIComponent(customer._id)}`, { cache: "no-store" });
      const balance = await response.json();
      if (!response.ok || !balance || Array.isArray(balance)) throw new Error("Could not load this customer's account balance. Please retry.");
      setCustomerTotals(previous => ({ ...previous, [customer._id]: { ...balance, dueAmount: Math.round((Number(balance.totalAmount || 0) - Number(balance.paidAmount || 0)) * 100) / 100 } }));
      setSelectedCustomer(customer); setShowPaymentPopup(true);
    } catch (error) { toast.error(error.message); }
    finally { setOpeningCustomerId(null); }
  };

  const handlePaymentSuccess = async (result) => {
    if (selectedCustomer && result) setCustomerTotals(previous => ({ ...previous, [selectedCustomer._id]: { ...previous[selectedCustomer._id], paidAmount: result.paidAmount, dueAmount: result.dueAmount } }));
    await fetchOrders();
  };

  return (
    <div className={styles.page_container}>
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Header */}
      <div className={styles.header_content}>
        <h1 className={styles.page_title}>Customer Payments</h1>
      </div>

      {/* <label className={styles.search_label}>Period activity <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All activity</option><option value="receipts">With receipts or corrections</option><option value="sales-only">Sales without receipts</option><option value="increase">Receivables increased</option><option value="decrease">Receivables decreased</option></select></label> */}
      {/* Search Section */}
      <AdminSummary><div data-filter="card" className={styles.filter_section}>
        <div className={styles.search_wrapper}>
          <label htmlFor="searchInput" className={styles.search_label}>
            Search Customers:
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
                  filteredCustomerList.filter((c) =>
                    Object.keys(customerTotalsMap).includes(c._id),
                  ).length
                }{" "}
                of {customerList.length} customers
              </span>
            )}
          </div>
        </div>
      </div></AdminSummary>

      {/* Date & Status Filters */}
      <AdminSummary><div data-filter="card" className={styles.filter_section}>
        <div data-filter="title" className={styles.filter_title}>
          <h2>Filter by Date Range</h2>
          <span>Applies to orders, receipts and summary cards</span>
        </div>

        <div data-filter="grid" className={styles.date_input_group}>
          <div data-filter="field" className={styles.date_field}>
            <label htmlFor="startDate">From Date</label>
            <input
              type="date"
              id="startDate"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
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

      {periodError && <div className={styles.account_hint} role="alert">{periodError} <button data-button="secondary" type="button" onClick={() => fetchOrders()}>Retry period data</button></div>}
      {!isLoading && !periodError && (
        <AdminSummary><div className={styles.global_summary_card}>
          <div className={styles.global_header}>
            <h2 className={styles.global_title}>Filtered Customers Summary</h2>
            <p>Sales and receipts follow the selected dates. Due is the current unpaid account balance for these customers, including earlier sales. Customer credits do not reduce another customer’s due.</p>
            <span className={styles.date_range_badge}>{formatDateForDisplay(filters.startDate) || "First record"} to {formatDateForDisplay(filters.endDate) || "Latest record"}</span>
          </div>
          <div className={styles.global_stats_grid}>
            <StatItem
              label="Orders"
              trend={cardTrends.totalOrders}
              value={formatStat(
                globalStats.totalOrders || 0,
              )}
            />
            <StatItem
              label="Sales"
              trend={cardTrends.totalAmount}
              tone="amount"
              value={`₹${formatStat(globalStats.totalAmount)}`}
            />
            <StatItem
              label="Received"
              trend={cardTrends.receivedAmount}
              value={`₹${formatStat(globalStats.receivedAmount)}`}
              colorClass={styles.text_green}
            />
            <StatItem
              label="Due"
              tone="amount"
              value={`₹${formatStat(totalCustomerDue(filteredCustomerList.map(customer => customerTotalsMap[customer._id])))}`}
              colorClass={styles.text_red}
            />

          </div>
        </div></AdminSummary>
      )}

      {/* Customer Cards Grid */}
      {!isLoading && !isLoadingCustomers && !periodError && <AdminSummary><CustomerLeaderboard totals={periodTotals} customers={customerList} orders={ordersData} startDate={filters.startDate} endDate={filters.endDate} /></AdminSummary>}
      {isLoading || isLoadingCustomers ? (
        <div className={styles.supplier_card}>
          <LoadingSpinner />
        </div>
      ) : (
        <div className={styles.supplier_grid}>
          {filteredCustomerList.map((customer) => {
            // Get totals from API data
            const stats = customerTotalsMap[customer._id];

            if (!stats) return null;

            // Get orders for this customer (filtered by date and status)
            const orders = stats?.orders || [];
            const visibleCount =
              visibleCounts[customer._id] || INITIAL_VISIBLE_COUNT;
            const displayedOrders = orders.slice(0, visibleCount);
            const hasMore = orders.length > visibleCount;

            return (
              <div key={customer._id} className={styles.supplier_card}>
                {/* Card Header */}
                <div className={styles.card_header}>
                  <div className={styles.header_left}>
                    <Link
                      href={`/customer/order?customerId=${customer._id}`}
                      className={styles.supplierName}
                    >
                      {customer.customerName || "-"}
                    </Link>
                    <CategoryBadge kind="customer" value={customer.customerType} />
                    {/* <span className={styles.date_range_badge}>{stats.receiptCount ? "Receipts / corrections in period" : "Sales in period"}</span> */}
                  </div>
                  <div className={styles.header_right}>
                    <AdminSummary><button data-button="secondary" type="button"
                      onClick={(event) => handleOpenPayment(customer, event.currentTarget, "history")}
                      className={styles.edit_payment_btn}
                      disabled={isLoadingCustomers || Boolean(openingCustomerId)}
                    >View payment history</button></AdminSummary>
                    <button data-button="primary"
                      onClick={(event) => handleOpenPayment(customer, event.currentTarget)}
                      className={styles.edit_payment_btn}
                      title="Record Payment"
                      disabled={isLoadingCustomers || Boolean(openingCustomerId)}
                    >
                      {/* <Image
                        src="/payment.png" 
                        alt=""
                        width={20} 
                        height={20} 
                      /> */}
                      <span>{openingCustomerId === customer._id ? "Loading balance…" : "Record payment"}</span>
                    </button>
                  </div>
                </div>

                {/* Quick Stats Row - Data from total_orders API */}
                <AdminSummary><div className={styles.quick_stats}>
                  <StatItem
                    label="Orders"
                    value={stats.totalOrders}
                  />
                  <StatItem
                    label="Sales"
                    value={`₹${formatStat(
                      stats.totalAmount,
                    )}`}
                  />
                  <StatItem
                    label="Received"
                    value={`₹${formatStat(
                      stats.receivedAmount,
                    )}`}
                    colorClass={styles.text_green}
                  />
                  <StatItem
                    label="Due"
                    value={`₹${formatStat(
                      stats.currentDue,
                    )}`}
                    colorClass={styles.text_red}
                  />
                </div></AdminSummary>

                {/* Orders Table */}
                <div className={styles.table_wrapper}>
                  <table className={styles.procurement_table}>
                    <thead>
                      <tr className={styles.table_head_row}>
                        <th className={styles.table_header_cell}>Date</th>
                        <th className={styles.table_header_cell}>
                          Order Total (₹)
                        </th>
                        <AdminSummary><th>Invoice</th></AdminSummary>

                        <th className={styles.table_header_cell}>Comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedOrders.map((order, idx) => {
                        const showDate =
                          idx === 0 ||
                          displayedOrders[idx - 1].date !== order.date;
                        return (
                          <tr key={order._id} className={styles.table_row}>
                            <td className={styles.table_cell}>
                              {showDate ? (
                                formatDateForDisplay(order.date)
                              ) : (
                                <span className={styles.continuation_arrow}>
                                  ↳
                                </span>
                              )}
                            </td>
                            <td
                              className={`${styles.table_cell} ${styles.cell_total}`}
                            >
                              ₹
                              {formatNumberWithCommasNoDecimal(
                                order.totalAmount,
                              )}
                            </td>
                            <AdminSummary><td className={styles.table_cell}>
                              <button data-button="table-icon"
                                onClick={() =>
                                  handleSingleInvoice(order, customer)
                                }
                                className={styles.invoice_btn}
                                title="Download Invoice"
                              >
                                <Image
                                  src="/invoice-download.png"
                                  alt="invoice"
                                  width={20}
                                  height={20}
                                />
                              </button>
                            </td></AdminSummary>

                            <td
                              className={`${styles.table_cell} ${styles.cell_comment}`}
                            >
                              <CommentEditor
                                canEdit={session?.user?.role === "admin"}
                                orderId={order._id}
                                initialComment={order.comment}
                                onSave={handleCommentUpdate}
                                isSaving={savingCommentId === order._id}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {hasMore && (
                    <div className={styles.show_more_container}>
                      <button data-button="secondary"
                        onClick={() => handleShowMore(customer._id)}
                        className={styles.show_more_btn}
                        disabled={isLoadingCustomers}
                      >
                        Show More ({orders.length - visibleCount} more)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredCustomerList.length === 0 && !isLoading && (
            <div className={styles.empty_state}>
              <span className={styles.empty_icon}>🔍</span>
              <p className={styles.empty_state_text}>
                No customers match your search criteria.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Payment Popup */}
      {selectedCustomer && (
        <CustomerPaymentDialog
          isOpen={showPaymentPopup}
          returnFocusRef={paymentTriggerRef}
          customerId={selectedCustomer._id}
          customerName={selectedCustomer.customerName}
          currentPaid={customerTotals[selectedCustomer._id]?.paidAmount || 0}
          currentDue={customerTotals[selectedCustomer._id]?.dueAmount || 0}
          onClose={() => {
            setShowPaymentPopup(false);
            setSelectedCustomer(null);
          }}
          onSuccess={handlePaymentSuccess}
          initialView={paymentDialogView}
        />
      )}
    </div>
  );
}
