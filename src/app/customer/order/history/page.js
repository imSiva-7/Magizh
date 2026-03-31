"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/order-history.module.css"; // Reuse your history design
import { getPreviousMonthDate, getTodayDate } from "@/utils/dateUtils";
import { formatNumberWithCommasNoDecimal } from "@/utils/formatNumberWithComma";
import { exportToCSV, exportToPDF } from "@/utils/exportUtils";
import Link from "next/link";
// import LoadingSpinner from "@/components/LoadingSpinner";

const LoadingSpinner = () => (
  <div className={styles.page_container}>
    <div className={styles.loading_container}>
      <div className={styles.spinner}></div>
      <span className={styles.loading_text}>Loading orders...</span>
    </div>
  </div>
);

function OrderHistoryContent() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ orders: [], summary: {} });
  const [filters, setFilters] = useState({
    startDate: getPreviousMonthDate(),
    endDate: getTodayDate(),
  });

  

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams(filters);
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

  // Handle repeated date "arrow" logic
  const decoratedOrders = useMemo(() => {
    const dateCounts = {};
    return data.orders.map((order) => {
      const dateKey = order.date.split("T")[0];
      dateCounts[dateKey] = (dateCounts[dateKey] || 0) + 1;
      return {
        ...order,
        isFirstOfDate: dateCounts[dateKey] === 1,
        displayDate: new Date(order.date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "2-digit",
        }),
      };
    });
  }, [data.orders]);

  return (
    <div className={styles.page_container}>
      <ToastContainer />
      <div className={styles.page_header}>
        <h1 className={styles.page_title}>Orders History</h1>
      </div>

      {/* Filter Section */}
      <div className={styles.filter_card}>
        <div className={styles.date_inputs_grid}>
          <div className={styles.date_field}>
            <label>From Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) =>
                setFilters((p) => ({ ...p, startDate: e.target.value }))
              }
              className={styles.date_input}
            />
          </div>
          <div className={styles.date_field}>
            <label>To Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) =>
                setFilters((p) => ({ ...p, endDate: e.target.value }))
              }
              className={styles.date_input}
            />
          </div>
          <div className={styles.filter_buttons}>
            <button
              onClick={() =>
                setFilters({
                  startDate: getTodayDate(),
                  endDate: getTodayDate(),
                })
              }
              className={styles.btn_primary}
            >
              Today
            </button>
            <button
              onClick={() => setFilters({ startDate: "", endDate: "" })}
              className={styles.btn_secondary}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {!loading && data.summary.orderCount > 0 && (
        <div className={styles.stats_grid}>
          <div className={styles.stat_item}>
            <span className={styles.stat_label}>Total Orders</span>
            <span className={styles.stat_value}>{data.summary.orderCount}</span>
          </div>
          <div className={styles.stat_item}>
            <span className={styles.stat_label}>Total Amount</span>
            <span className={styles.stat_value}>
              ₹{formatNumberWithCommasNoDecimal(data.summary.totalAmount)}
            </span>
          </div>
          <div className={`${styles.stat_item} ${styles.paid_border}`}>
            <span className={styles.stat_label}>Total Paid</span>
            <span className={styles.stat_value} style={{ color: "green" }}>
              ₹{formatNumberWithCommasNoDecimal(data.summary.paidAmount)}
            </span>
          </div>
          <div className={`${styles.stat_item} ${styles.due_border}`}>
            <span className={styles.stat_label}>Total Due</span>
            <span className={styles.stat_value} style={{ color: "red" }}>
              ₹{formatNumberWithCommasNoDecimal(data.summary.dueAmount)}
            </span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className={styles.table_wrapper}>
        {loading ? (
          <LoadingSpinner />
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
                    <td> <Link
                              href={`/customer/order?customerId=${order.customerId}`}
                              className={styles.customer_name}
                            >
                             {order.customerName}
                            </Link></td>
                    <td className={styles.total_cell}>
                      {formatNumberWithCommasNoDecimal(order.totalAmount)}
                    </td>
                    <td>
                      <span
                        className={
                          order.paymentStatus === "Paid"
                            ? styles.status_paid
                            : styles.status_due
                        }
                      >
                        {order.paymentStatus}
                      </span>
                    </td>
                    <td className={styles.comment_cell}>
                      {order.comment || "-"}
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
