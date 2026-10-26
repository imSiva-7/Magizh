"use client";
import AdminSummary from "@/components/AdminSummary";
import { totalCustomerDue } from "@/lib/customer-account-due.mjs";
import DataSkeleton from "@/components/DataSkeleton";
import CustomerCharts from "@/components/CustomerCharts";
import { statNumberTone } from "@/lib/stat-number-tone";
import { formatStat } from "@/utils/formatNumberWithComma";
import NewCustomerOrder from "@/components/NewCustomerOrder";
import Gstr1Export from "@/components/Gstr1Export";
import { useEntryForm } from "@/lib/use-entry-form";
import CustomerLeaderboard from "@/components/CustomerLeaderboard";

import StatTrendBackground from "@/components/StatTrendBackground";
import trendStyles from "@/css/stat-trend.module.css";
import { orderCardTrends } from "@/lib/history-card-trends";
import { sumPaymentPeriod } from "@/lib/customer-payment-period.mjs";
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/order-history.module.css";
import { getCurrentMonthStartDate, getTodayDate } from "@/utils/dateUtils";
import { formatNumberWithCommas } from "@/utils/formatNumberWithComma";
import { formatDateForDisplay } from "@/utils/dateUtils";
import { exportInvoiceToPDF } from "@/utils/exportInvoice";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";

const LoadingSpinner = () => <DataSkeleton label="Loading orders..." />;

// Comment editor component with button toggle
const CommentEditor = ({
  orderId,
  initialComment,
  onSave,
  isSaving,
  canEdit,
}) => {
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
      {canEdit && (
        <button data-button="table-icon"
          onClick={() => setIsEditing(true)}
          className={styles.comment_edit_btn}
          title="Edit comment"
        >
          <Image src="/edit-comment.png" alt="edit" width={20} height={20} />
        </button>
      )}
    </div>
  );
};

function OrderHistoryContent() {
  const [loadError, setLoadError] = useState("");
  const [trendCustomers, setTrendCustomers] = useState([]);
  const cardTrends = useMemo(
    () => orderCardTrends(trendCustomers),
    [trendCustomers],
  );
  const [paymentPeriod, setPaymentPeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ orders: [], summary: {} });
  const [filters, setFilters] = useState({
    startDate: getCurrentMonthStartDate(),
    endDate: getTodayDate(),
  });
  const [savingCommentId, setSavingCommentId] = useState(null);
  const [showNewOrder, setShowNewOrder] = useEntryForm();
  const [showGstExport, setShowGstExport] = useState(false);
  const newOrderButtonRef = useRef(null);
  const historyRequestRef = useRef(null);
  const { data: session } = useSession();
  const canViewSummary = session?.user?.role === "admin";

  const fetchHistory = useCallback(async () => {
    historyRequestRef.current?.abort();
    const controller = new AbortController();
    historyRequestRef.current = controller;
    try {
      setLoading(true);
      setLoadError("");
      const params = new URLSearchParams();
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);
      if (
        filters.startDate &&
        filters.endDate &&
        filters.startDate > filters.endDate
      )
        throw new Error("From date must be before the to date.");
      const [res, payments] = await Promise.all([
        fetch(`/api/customer/order/history?${params}`, { cache: "no-store", signal: controller.signal }),
        (canViewSummary ? fetch(`/api/customer/payment-summary?${params}`, { cache: "no-store", signal: controller.signal }) : Promise.resolve({ ok: true, json: async () => ({ customers: [] }) })),
      ]);
      if (!res.ok || !payments.ok)
        throw new Error("History could not be loaded. Please retry.");
      const [json, period] = await Promise.all([res.json(), payments.json()]);
      if (controller.signal.aborted) return;
      setData(json);
      setPaymentPeriod(sumPaymentPeriod(period.customers || []));
      setTrendCustomers(period.customers || []);
    } catch (err) {
      if (controller.signal.aborted) return;
      setLoadError(err.message);
      setData({ orders: [], summary: {} });
      setPaymentPeriod(null);
      setTrendCustomers([]);
      toast.error(err.message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [filters, canViewSummary]);

  useEffect(() => {
    fetchHistory();
    return () => historyRequestRef.current?.abort();
  }, [fetchHistory]);

  // Handle repeated date "arrow" logic (like procurement history)
  const decoratedOrders = useMemo(() => {
    const dateCounts = {};
    return data.orders.map((order) => {
      const dateKey = order.date.split("T")[0];
      dateCounts[dateKey] = (dateCounts[dateKey] || 0) + 1;
      const isFirstOfDate = dateCounts[dateKey] === 1;
      const displayDate = formatDateForDisplay(order.date);
      return {
        ...order,
        isFirstOfDate,
        displayDate,
        occurrence: dateCounts[dateKey],
      };
    });
  }, [data.orders]);

  // Generate invoice for a single order
  const handleSingleInvoice = async (order) => {
    const customerDetails = {
      customerName: order.customerName || "Customer",
      customerType: order.customerType || "",
      address: "", // optional – fill from API if needed
      mobile: "",
      customerGST: "",
    };
    const dateStr =
      formatDateForDisplay(order.date) || order.date.split("T")[0];
    const fileName = `invoice_${order.customerName}_${dateStr}`;
    await exportInvoiceToPDF(
      [order],
      customerDetails,
      { start: dateStr, end: dateStr },
      fileName,
    );
  };

  const handleExport = async (format) => {
    if (!data.orders.length) {
      toast.error("No data to export");
      return;
    }
    const dateRange = {
      start: formatDateForDisplay(filters.startDate) || "all",
      end: formatDateForDisplay(filters.endDate) || "all",
    };

    const fileName = `orders_${dateRange.start}_to_${dateRange.end}`;

    await exportInvoiceToPDF(
      data.orders,
      "Orders History",
      dateRange,
      fileName,
    );
    toast.success("PDF exported");
  };

  // Comment update handler
  const handleCommentUpdate = async (orderId, newComment) => {
    if (savingCommentId === orderId) return;
    setSavingCommentId(orderId);

    const previousComment =
      data.orders.find((o) => o._id === orderId)?.comment || "";
    setData((prev) => ({
      ...prev,
      orders: prev.orders.map((order) =>
        order._id === orderId ? { ...order, comment: newComment } : order,
      ),
    }));

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
      setData((prev) => ({
        ...prev,
        orders: prev.orders.map((order) =>
          order._id === orderId
            ? { ...order, comment: previousComment }
            : order,
        ),
      }));
    } finally {
      setSavingCommentId(null);
    }
  };

  const todayFilter = () =>
    setFilters({ startDate: getTodayDate(), endDate: getTodayDate() });
  const resetFilters = () =>
    setFilters({
      startDate: getCurrentMonthStartDate(),
      endDate: getTodayDate(),
    });
  const clearFilters = () => setFilters({ startDate: "", endDate: "" });

  const closeNewOrder = () => {
    setShowNewOrder(false);
    requestAnimationFrame(() => newOrderButtonRef.current?.focus());
  };

  const handleOrderCreated = (date) => {
    closeNewOrder();
    toast.success("Order created");
    // Keep the saved order visible even when it falls outside the current range.
    const next = {
      startDate: filters.startDate && date < filters.startDate ? date : filters.startDate,
      endDate: filters.endDate && date > filters.endDate ? date : filters.endDate,
    };
    if (next.startDate !== filters.startDate || next.endDate !== filters.endDate) setFilters(next);
    else fetchHistory();
  };

  return (
    <div className={styles.page_container}>
      <ToastContainer position="top-right" autoClose={3000} />
      {["admin", "dev", "employee"].includes(session?.user?.role) && !showNewOrder && <button ref={newOrderButtonRef} data-button="primary" data-button-placement="floating" type="button" className={styles.new_order_button} aria-controls="new-customer-order" aria-expanded={showNewOrder} onClick={() => setShowNewOrder(true)}><span aria-hidden="true">+</span> New order</button>}

      {/* Header */}
      <div className={styles.page_header}>
        <h1 className={styles.page_title}>Order History</h1>
      </div>

      {showNewOrder && <NewCustomerOrder onClose={closeNewOrder} onCreated={handleOrderCreated} />}
      {/* {["admin", "dev", "employee"].includes(session?.user?.role) && <button data-button="secondary" type="button" aria-expanded={showGstExport} onClick={() => setShowGstExport(value => !value)}>Export GSTR-1 JSON</button>}
      {showGstExport && <Gstr1Export initialMonth={filters.startDate?.slice(0, 7)} onClose={() => setShowGstExport(false)} />} */}

      {/* Filter Card */}
      <AdminSummary><div data-filter="card" className={styles.filter_card}>
        <div data-filter="title" className={styles.filter_title}>
          <h2>Filter by Date Range</h2>
        </div>
        <div data-filter="content" className={styles.filter_content}>
          <div data-filter="section" className={styles.date_section}>
            <div data-filter="grid" className={styles.date_inputs_grid}>
              <div data-filter="field" className={styles.date_field}>
                <label
                  htmlFor="order-history-from"
                  className={styles.date_label}
                >
                  From Date
                </label>
                <input
                  type="date"
                  id="order-history-from"
                  value={filters.startDate}
                  onChange={(e) =>
                    setFilters((p) => ({ ...p, startDate: e.target.value }))
                  }
                  className={styles.date_input}
                  max={filters.endDate || getTodayDate()}
                />
              </div>
              <div data-filter="field" className={styles.date_field}>
                <label htmlFor="order-history-to" className={styles.date_label}>
                  To Date
                </label>
                <input
                  type="date"
                  id="order-history-to"
                  value={filters.endDate}
                  onChange={(e) =>
                    setFilters((p) => ({ ...p, endDate: e.target.value }))
                  }
                  className={styles.date_input}
                  min={filters.startDate}
                  max={getTodayDate()}
                />
              </div>
            </div>
          </div>
          <div data-filter="actions" className={styles.filter_actions}>
            <div data-filter="buttons" className={styles.filter_buttons}>
              <button data-button="secondary"
                type="button"
                onClick={resetFilters}
                className={`${styles.btn} ${styles.btn_primary}`}
              >
                Reset
              </button>
              <button data-button="secondary"
                type="button"
                onClick={clearFilters}
                className={`${styles.btn} ${styles.btn_secondary}`}
                disabled={!filters.startDate && !filters.endDate}
              >
                Clear
              </button>
              <button data-button="secondary"
                type="button"
                onClick={todayFilter}
                className={`${styles.btn} ${styles.btn_primary2}`}
              >
                Today
              </button>
            </div>
          </div>
        </div>
      </div></AdminSummary>

      {!loading && !loadError && (
        <AdminSummary><section
          className={styles.stats_card}
          aria-labelledby="order-history-summary"
        >
          <h2 id="order-history-summary" className={styles.stats_header}>
            Summary
            <span className={styles.date_range_badge}>
              {formatDateForDisplay(filters.startDate) || "Beginning"} to{" "}
              {formatDateForDisplay(filters.endDate) || "Latest"}
            </span>
          </h2>
          <div className={styles.stats_grid}>
            {[
              ["Orders", data.summary?.orderCount || 0, "totalOrders"],
              [
                "Sales",
                `₹${formatStat(data.summary?.totalAmount || 0)}`,
                "totalAmount",
              ],
              [
                "Received",
                `₹${formatStat(paymentPeriod?.receivedAmount || 0)}`,
                "receivedAmount",
              ],
              ["Due", `₹${formatStat(totalCustomerDue(trendCustomers))}`, "currentDue"],
              [
                "AOV",
                `₹${formatStat(data.summary?.orderCount ? data.summary.totalAmount / data.summary.orderCount : 0)}`,
                "averageOrder",
              ],
              // ["Payments", paymentPeriod?.receiptCount || 0, "receiptCount"],
            ].map(([label, value, metric]) => (
              <div
                key={label}
                className={`${styles.stat_item} ${trendStyles.card}`}
              >
                <StatTrendBackground
                  points={cardTrends[metric]}
                  tone={
                    metric === "totalOrders" || metric === "receiptCount"
                      ? "milk"
                      : "amount"
                  }
                />
                <span
                  className={styles.stat_label}
                  title={label === "AOV" ? "Average order value" : undefined}
                >
                  {label}
                </span>
                <span data-stat-tone={statNumberTone(label, value)} className={styles.stat_value}>{value}</span>
              </div>
            ))}
          </div>
          <p>Due is the current unpaid account balance for customers with activity in this period, including earlier sales. Sales and received amounts follow the selected dates.</p>
        </section></AdminSummary>
      )}

      {/* Export Section */}
      <section aria-label="Order history analytics">
        <AdminSummary><CustomerCharts records={data.orders} filters={filters} loading={loading} error={loadError} onRetry={fetchHistory} /></AdminSummary>
      </section>

      {/* {!loading && !loadError && <CustomerLeaderboard totals={trendCustomers} orders={data.orders} startDate={filters.startDate} endDate={filters.endDate} />} */}
      {!loading && data.orders.length > 0 && (
        <AdminSummary><div className={styles.exportSection}>
          <span className={styles.entryCount}>
            {data.orders.length} order
            {data.orders.length !== 1 ? "s" : ""} found
          </span>

          <button data-button="secondary"
            onClick={() => handleExport("pdf")}
            className={styles.exportBtn}
            disabled={!data.orders.length}
          >
            Export as PDF
          </button>
        </div></AdminSummary>
      )}

      {/* Table */}
      <div className={styles.table_wrapper}>
        {loading ? (
          <LoadingSpinner />
        ) : loadError ? (
          <div className={styles.empty_state} role="alert">
            <p>{loadError}</p>
            <AdminSummary><button data-button="secondary"
              type="button"
              className={styles.clear_filter_btn}
              onClick={fetchHistory}
            >
              Retry history
            </button></AdminSummary>
          </div>
        ) : data.orders.length === 0 ? (
          <div className={styles.empty_state}>
            <span className={styles.empty_icon}>📋</span>
            <h3 className={styles.empty_title}>No Orders Found</h3>
            <p className={styles.empty_message}>
              No orders found for the selected date range.
            </p>
            <AdminSummary><button data-button="secondary"
              onClick={clearFilters}
              className={styles.clear_filter_btn}
              disabled={loading}
            >
              Clear filters
            </button></AdminSummary>
          </div>
        ) : (
          <div className={styles.table_container}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Total (₹)</th>
                  <th>Status</th>
                  <AdminSummary><th>Invoice</th></AdminSummary>
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {decoratedOrders.map((order) => (
                  <tr key={order._id}>
                    <td className={styles.date_cell}>
                      {order.isFirstOfDate ? (
                        <span className={styles.date_text}>
                          {order.displayDate}
                        </span>
                      ) : (
                        <span className={styles.ascii_arrow}>↳</span>
                      )}
                    </td>
                    <td className={styles.customer_cell}>
                      <Link
                        href={`/customer/order?customerId=${order.customerId}`}
                        className={styles.customer_name}
                      >
                        {order.customerName}
                      </Link>
                    </td>
                    <td className={styles.total_cell}>
                      ₹{formatNumberWithCommas(order.totalAmount)}
                    </td>
                    <td className={styles.status_cell}>
                      <span
                        className={
                          order.paymentStatus === "Paid"
                            ? styles.status_paid
                            : styles.status_due
                        }
                      >
                        {order.paymentStatus === "Paid" ? "Paid" : "Due"}
                      </span>
                    </td>
                    <AdminSummary><td className={styles.invoice_cell}>
                      <button data-button="table-icon"
                        onClick={() => handleSingleInvoice(order)}
                        className={styles.export_btn_table}
                        disabled={loading}
                        title="Download invoice"
                      >
                        <Image
                          src="/invoice-download.png"
                          alt="invoice"
                          width={20}
                          height={20}
                        />
                      </button>
                    </td></AdminSummary>
                    <td className={styles.comment_cell}>
                      <CommentEditor
                        canEdit={session?.user?.role === "admin"}
                        orderId={order._id}
                        initialComment={order.comment}
                        onSave={handleCommentUpdate}
                        isSaving={savingCommentId === order._id}
                      />
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

export default function OrderHistoryPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <OrderHistoryContent />
    </Suspense>
  );
}
