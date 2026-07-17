"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/order-history.module.css";
import { getCurrentMonthStartDate, getTodayDate } from "@/utils/dateUtils";
import { formatNumberWithCommasNoDecimal } from "@/utils/formatNumberWithComma";
import { formatDateForDisplay } from "@/utils/dateUtils";
import { exportInvoiceToPDF } from "@/utils/exportInvoice";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";

const LoadingSpinner = () => (
  <div className={styles.loading_container}>
    <div className={styles.spinner}></div>
    <span className={styles.loading_text}>Loading orders...</span>
  </div>
);

// Comment editor component with button toggle
const CommentEditor = ({ orderId, initialComment, onSave, isSaving }) => {
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
          <button
            onClick={handleSave}
            className={styles.comment_save_btn}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button
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
      <button
        onClick={() => setIsEditing(true)}
        className={styles.comment_edit_btn}
        title="Edit comment"
      >
        <Image src="/edit-comment.png" alt="edit" width={20} height={20} />
      </button>
    </div>
  );
};

function OrderHistoryContent() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ orders: [], summary: {} });
  const [filters, setFilters] = useState({
    startDate: getCurrentMonthStartDate(),
    endDate: getTodayDate(),
  });
  const [savingCommentId, setSavingCommentId] = useState(null);
  const { data: session } = useSession();

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);
      const res = await fetch(`/api/customer/order/history?${params}`);
      if (!res.ok) throw new Error("Failed to fetch history");
      const json = await res.json();
      setData(json);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Handle repeated date "arrow" logic (like procurement history)
  const decoratedOrders = useMemo(() => {
    const dateCounts = {};
    return data.orders.map((order) => {
      const dateKey = order.date.split("T")[0];
      dateCounts[dateKey] = (dateCounts[dateKey] || 0) + 1;
      const isFirstOfDate = dateCounts[dateKey] === 1;
      const displayDate = new Date(order.date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      });
      return {
        ...order,
        isFirstOfDate,
        displayDate,
        occurrence: dateCounts[dateKey],
      };
    });
  }, [data.orders]);

  const handleExport = (format) => {
    if (!data.orders.length) {
      toast.error("No data to export");
      return;
    }
    const dateRange = {
      start: formatDateForDisplay(filters.startDate) || "all",
      end: formatDateForDisplay(filters.endDate) || "all",
    };

    const fileName = `orders_${dateRange.start}_to_${dateRange.end}`;

    exportInvoiceToPDF(data.orders, "Orders History", dateRange, fileName);
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
    setFilters({ startDate: getCurrentMonthStartDate(), endDate: getTodayDate() });
  const clearFilters = () => setFilters({ startDate: "", endDate: "" });

  return (
    <div className={styles.page_container}>
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Header */}
      <div className={styles.page_header}>
        <h1 className={styles.page_title}>Order History</h1>
      </div>

      {/* Filter Card */}
      <div className={styles.filter_card}>
        <div className={styles.filter_title}>
          <h2>Filter by Date Range</h2>
        </div>
        <div className={styles.filter_content}>
          <div className={styles.date_section}>
            <div className={styles.date_inputs_grid}>
              <div className={styles.date_field}>
                <label className={styles.date_label}>From Date</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) =>
                    setFilters((p) => ({ ...p, startDate: e.target.value }))
                  }
                  className={styles.date_input}
                  max={filters.endDate || getTodayDate()}
                />
              </div>
              <div className={styles.date_field}>
                <label className={styles.date_label}>To Date</label>
                <input
                  type="date"
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
          <div className={styles.filter_actions}>
            <div className={styles.filter_buttons}>
              <button
                type="button"
                onClick={resetFilters}
                className={`${styles.btn} ${styles.btn_primary}`}
                disabled={loading}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className={`${styles.btn} ${styles.btn_secondary}`}
                disabled={loading || (!filters.startDate && !filters.endDate)}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={todayFilter}
                className={`${styles.btn} ${styles.btn_primary2}`}
                disabled={loading}
              >
                Today
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {!loading && data.summary?.orderCount > 0 && (
        <div className={styles.stats_card}>
          <h3 className={styles.stats_header}>
            Summary
            <span className={styles.date_range_badge}>
              {filters.startDate && filters.endDate
                ? `${new Date(filters.startDate).toLocaleDateString("en-IN")} – ${new Date(filters.endDate).toLocaleDateString("en-IN")}`
                : "All records"}
            </span>
          </h3>
          <div className={styles.stats_grid}>
            <div className={styles.stat_item}>
              <span className={styles.stat_label}>No. Of. Orders</span>
              <span className={styles.stat_value}>
                {data.summary.orderCount}
              </span>
            </div>
            <div className={styles.stat_item}>
              <span className={styles.stat_label}>Total Amount</span>
              <span className={styles.stat_value}>
                ₹{formatNumberWithCommasNoDecimal(data.summary.totalAmount)}
              </span>
            </div>
            <div className={styles.stat_item}>
              <span className={styles.stat_label}> Amount Recevied</span>
              <span className={`${styles.stat_value} ${styles.text_green}`}>
                ₹{formatNumberWithCommasNoDecimal(data.summary.paidAmount)}
              </span>
            </div>
            <div className={styles.stat_item}>
              <span className={styles.stat_label}>Amount Due</span>
              <span className={`${styles.stat_value} ${styles.text_red}`}>
                ₹{formatNumberWithCommasNoDecimal(data.summary.dueAmount)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Export Section */}
      {!loading && data.summary?.orderCount > 0 && (
        <div className={styles.exportSection}>
          <span className={styles.entryCount}>
            {data.summary.orderCount} order
            {data.summary.orderCount !== 1 ? "s" : ""} found
          </span>

          <button
            onClick={() => handleExport("pdf")}
            className={styles.exportBtn}
            disabled={!data.orders.length}
          >
            Export as PDF
          </button>
        </div>
      )}

      {/* Table */}
      <div className={styles.table_wrapper}>
        {loading ? (
          <LoadingSpinner />
        ) : data.orders.length === 0 ? (
          <div className={styles.empty_state}>
            <span className={styles.empty_icon}>📋</span>
            <h3 className={styles.empty_title}>No Orders Found</h3>
            <p className={styles.empty_message}>
              No orders found for the selected date range.
            </p>
            <button
              onClick={clearFilters}
              className={styles.clear_filter_btn}
              disabled={loading}
            >
              Clear filters
            </button>
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
                      ₹{formatNumberWithCommasNoDecimal(order.totalAmount)}
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
                    <td className={styles.comment_cell}>
                      <CommentEditor
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
