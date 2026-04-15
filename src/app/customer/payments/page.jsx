"use client";

import { getPreviousMonthDate, getTodayDate } from "@/utils/dateUtils";
import { useState, useMemo, useEffect, useCallback } from "react";
import styles from "@/css/customer-payment.module.css";
import {
  formatNumberWithCommas,
  formatNumberWithCommasNoDecimal,
} from "@/utils/formatNumberWithComma";
import { useSession } from "next-auth/react";
import { ToastContainer, toast } from "react-toastify";
import Link from "next/link";
import Image from "next/image";

// ========== CONSTANTS ==========
const INITIAL_FILTERS = {
  startDate: "",
  endDate: "",
};

const INITIAL_VISIBLE_COUNT = 20;

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

const getCustomerTypeClass = (customerType) => {
  const typeClassMap = {
    Distributor: styles.type_distributor_badge,
    Wholesale: styles.type_wholesale_badge,
    Retail: styles.type_retail_badge,
    Restaurant: styles.type_restaurant_badge,
    Other: styles.type_other_badge,
  };
  return typeClassMap[customerType] || styles.default_customer;
};

// ========== REUSABLE COMPONENTS ==========
const LoadingSpinner = () => (
  <div className={styles.loading_container}>
    <div className={styles.spinner}></div>
    <span className={styles.loading_text}>Loading customer orders...</span>
  </div>
);

const StatItem = ({ label, value, unit = "", colorClass = "" }) => (
  <div className={styles.stat_card}>
    <div className={styles.stat_card_label}>{label}</div>
    <div className={`${styles.stat_card_value} ${colorClass}`}>
      {value}
      {unit && <span className={styles.stat_unit}>{unit}</span>}
    </div>
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
      <span className={styles.comment_text}>{comment || "—"}</span>
      <button
        onClick={() => setIsEditing(true)}
        className={styles.comment_edit_btn}
        title="Edit comment"
      >
        <Image src="/edit.png" alt="edit" width={20} height={20} />
      </button>
    </div>
  );
};

// ========== MAIN COMPONENT ==========
export default function CustomerPayments() {
  const [customerList, setCustomerList] = useState([]);
  const [ordersData, setOrdersData] = useState([]);
  const { data: session } = useSession();

  const [checkedIds, setCheckedIds] = useState([]);
  const [checkedCustomerId, setCheckedCustomerId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [statusFilter, setStatusFilter] = useState("");
  const [visibleCounts, setVisibleCounts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingCommentId, setSavingCommentId] = useState(null);

  // Fetch all customers
  useEffect(() => {
    async function fetchCustomers() {
      try {
        const res = await fetch("/api/customer");
        if (!res.ok) throw new Error("Failed to fetch customers");
        const data = await res.json();
        setCustomerList(Array.isArray(data) ? data : data.data || []);
      } catch (error) {
        console.error(error);
        setCustomerList([]);
        toast.error(error.message);
      }
    }
    fetchCustomers();
  }, []);

  // Fetch orders with date filters
  const fetchOrders = useCallback(
    async (signal) => {
      setIsLoading(true);
      try {
        const queryParams = new URLSearchParams();
        if (filters.startDate)
          queryParams.append("startDate", filters.startDate);
        if (filters.endDate) queryParams.append("endDate", filters.endDate);

        const res = await fetch(`/api/customer/order/history?${queryParams}`, {
          cache: "no-store",
          signal,
        });
        if (!res.ok) throw new Error("Failed to load order history");

        const data = await res.json();
        const orders = Array.isArray(data.orders) ? data.orders : [];
        setOrdersData(orders);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error(error);
          toast.error(error.message);
        }
      } finally {
        setCheckedIds([]);
        setCheckedCustomerId("");
        setIsLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchOrders(controller.signal);
    return () => controller.abort();
  }, [fetchOrders]);

  // Bulk update payment status
  const handleBulkUpdateStatus = async (status) => {
    if (checkedIds.length === 0) return;
    if (!window.confirm(`Mark ${checkedIds.length} order(s) as ${status}?`))
      return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/customer/order", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: checkedIds,
          status,
          actionDoneBy: session?.user?.email,
        }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Bulk update failed");

      toast.success(
        `Successfully marked ${checkedIds.length} order(s) as ${status}`,
      );

      setOrdersData((prevOrders) =>
        prevOrders.map((order) =>
          checkedIds.includes(order._id)
            ? { ...order, paymentStatus: status }
            : order,
        ),
      );
      setCheckedIds([]);
      setCheckedCustomerId("");
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Failed to process bulk payment");
    } finally {
      setSubmitting(false);
    }
  };

  // Selection logic
  const handleCheck = (id, customerId) => {
    if (!checkedCustomerId) setCheckedCustomerId(customerId);
    setCheckedIds((prev) => {
      const newSelected = prev.includes(id)
        ? prev.filter((itemId) => itemId !== id)
        : [...prev, id];
      if (newSelected.length === 0) setCheckedCustomerId("");
      return newSelected;
    });
  };

  const handleSelectAll = (e, customerId, orders) => {
    const eligibleIds = orders.map((order) => order._id);
    if (e.target.checked) {
      setCheckedCustomerId(customerId);
      setCheckedIds((prev) => [...new Set([...prev, ...eligibleIds])]);
    } else {
      setCheckedIds((prev) => {
        const newSelected = prev.filter((id) => !eligibleIds.includes(id));
        if (newSelected.length === 0) setCheckedCustomerId("");
        return newSelected;
      });
    }
  };

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

  // Filter handlers with confirmation
  const confirmClearChecked = () => {
    if (checkedIds.length > 0) {
      return window.confirm("Selected orders will be deselected. Continue?");
    }
    return true;
  };

  const handleFilterChange = (e) => {
    if (!confirmClearChecked()) return;
    setCheckedIds([]);
    setCheckedCustomerId("");
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleStatusChange = (newStatus) => {
    if (!confirmClearChecked()) return;
    setCheckedIds([]);
    setCheckedCustomerId("");
    setStatusFilter(newStatus);
  };

  const resetFilters = () => {
    if (!confirmClearChecked()) return;
    setCheckedIds([]);
    setCheckedCustomerId("");
    setFilters({
      startDate: getPreviousMonthDate(),
      endDate: getTodayDate(),
    });
    setStatusFilter("");
    toast.info("Filters reset to default.");
  };

  const clearFilters = () => {
    if (!confirmClearChecked()) return;
    setCheckedIds([]);
    setCheckedCustomerId("");
    setFilters({ startDate: "", endDate: "" });
    setStatusFilter("");
    toast.info("Date filters cleared.");
  };

  const loadTodayData = () => {
    if (!confirmClearChecked()) return;
    setCheckedIds([]);
    setCheckedCustomerId("");
    setFilters({ startDate: getTodayDate(), endDate: getTodayDate() });
    setStatusFilter("");
    toast.info("Loaded today's records.");
  };

  // Build customer totals and filtered orders
  const customerTotalsMap = useMemo(() => {
    const totals = {
      all: {
        totalAmount: 0,
        paidAmount: 0,
        dueAmount: 0,
        orders: [],
        uniqueDates: new Set(),
      },
    };

    if (ordersData.length === 0) return totals;

    ordersData.forEach((order) => {
      const custId = order.customerId;
      if (!totals[custId]) {
        totals[custId] = {
          totalAmount: 0,
          paidAmount: 0,
          dueAmount: 0,
          orders: [],
          uniqueDates: new Set(),
        };
      }

      const amount = parseFloat(order.totalAmount) || 0;
      const isPaid = order.paymentStatus === "Paid";
      const date = order.date;

      totals[custId].totalAmount += amount;
      totals[custId].uniqueDates.add(date);
      if (isPaid) {
        totals[custId].paidAmount += amount;
      } else {
        totals[custId].dueAmount += amount;
      }

      if (statusFilter === "Paid" && isPaid) {
        totals[custId].orders.push(order);
      } else if (statusFilter === "Not Paid" && !isPaid) {
        totals[custId].orders.push(order);
      } else if (statusFilter === "") {
        totals[custId].orders.push(order);
      }
      totals.all.orders.push(order);
      totals.all.totalAmount += amount;

      totals.all.uniqueDates.add(date);
      if (isPaid) {
        totals.all.paidAmount += amount;
      } else {
        totals.all.dueAmount += amount;
      }
    });

    return totals;
  }, [ordersData, statusFilter]);

  // Filter customers by search
  const filteredCustomerList = useMemo(() => {
    if (!searchQuery.trim()) return customerList;
    return customerList.filter((cust) =>
      cust.customerName?.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [customerList, searchQuery]);

  const globalStats = customerTotalsMap.all;

  return (
    <div className={styles.page_container}>
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Header */}
      <div className={styles.header_content}>
        <h1 className={styles.page_title}>Customer Payments</h1>
      </div>

      {/* Search Section */}
      <div className={styles.filter_section}>
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
              <button
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
      </div>

      {/* Date & Status Filters */}
      <div className={styles.filter_section}>
        <div className={styles.filter_title}>
          <h2>Filter by Date Range & Status</h2>
        </div>

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
            <span>All Orders</span>
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

        <div className={styles.date_input_group}>
          <div className={styles.date_field}>
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
          <div className={styles.date_field}>
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

        <div className={styles.filter_actions}>
          <button
            type="button"
            onClick={resetFilters}
            className={`${styles.btn} ${styles.btn_reset}`}
            disabled={isLoading}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className={`${styles.btn} ${styles.btn_clear}`}
            disabled={(!filters.endDate && !filters.startDate) || isLoading}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={loadTodayData}
            className={`${styles.btn} ${styles.btn_today}`}
            disabled={isLoading}
          >
            Today
          </button>
        </div>
      </div>

      {/* Global Summary */}
      {!isLoading && globalStats.totalAmount > 0 && !searchQuery && (
        <div className={styles.global_summary_card}>
          <div className={styles.global_header}>
            <h2 className={styles.global_title}>All Customers Summary</h2>
            <span className={styles.date_range_badge}>
              {getFormattedDateRange(filters.startDate, filters.endDate)}
            </span>
          </div>
          <div className={styles.global_stats_grid}>
            <StatItem
              label="Total Orders"
              value={globalStats.orders?.length || 0}
            />
            <StatItem
              label="Total Amount"
              value={`₹${formatNumberWithCommas(globalStats.totalAmount.toFixed(2))}`}
            />
            <StatItem
              label="Total Paid"
              value={`₹${formatNumberWithCommas(globalStats.paidAmount.toFixed(2))}`}
              colorClass={styles.text_green}
            />
            <StatItem
              label="Total Due"
              value={`₹${formatNumberWithCommas(globalStats.dueAmount.toFixed(2))}`}
              colorClass={styles.text_red}
            />
          </div>
        </div>
      )}

      {/* Customer Cards Grid */}
      {isLoading ? (
        <div className={styles.supplier_card}>
          <LoadingSpinner />
        </div>
      ) : (
        <div className={styles.supplier_grid}>
          {filteredCustomerList.map((customer) => {
            const stats = customerTotalsMap[customer._id];
            if (!stats || stats.totalAmount === 0 || stats.orders.length === 0)
              return null;

            const orders = stats.orders;
            const visibleCount =
              visibleCounts[customer._id] || INITIAL_VISIBLE_COUNT;
            const displayedOrders = orders.slice(0, visibleCount);
            const hasMore = orders.length > visibleCount;

            const isAllChecked =
              orders.length > 0 &&
              orders.every((o) => checkedIds.includes(o._id));
            const isCustomerDisabled =
              checkedCustomerId !== "" && checkedCustomerId !== customer._id;

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
                    <span
                      className={getCustomerTypeClass(customer.customerType)}
                    >
                      {customer.customerType || "Other"}
                    </span>
                  </div>
                </div>

                {/* Quick Stats Row */}
                <div className={styles.quick_stats}>
                  <StatItem label="Total Orders" value={orders.length} />
                  <StatItem
                    label="Total Amount"
                    value={`₹${formatNumberWithCommasNoDecimal(stats.totalAmount)}`}
                  />
                  <StatItem
                    label="Paid"
                    value={`₹${formatNumberWithCommasNoDecimal(stats.paidAmount)}`}
                    colorClass={styles.text_green}
                  />
                  <StatItem
                    label="Due"
                    value={`₹${formatNumberWithCommasNoDecimal(stats.dueAmount)}`}
                    colorClass={styles.text_red}
                  />
                </div>

                {/* Bulk Action Banner */}
                {checkedIds.length > 0 &&
                  customer._id === checkedCustomerId && (
                    <div className={styles.bulk_actions_banner}>
                      <span className={styles.bulk_actions_text}>
                        {checkedIds.length} order(s) selected
                      </span>
                      <div className={styles.bulk_buttons}>
                        <button
                          onClick={() => handleBulkUpdateStatus("Paid")}
                          disabled={submitting}
                          className={styles.primary_btn}
                        >
                          {submitting ? "Processing..." : "Mark as Paid"}
                        </button>
                        <button
                          onClick={() => handleBulkUpdateStatus("Not Paid")}
                          disabled={submitting}
                          className={styles.secondary_btn}
                        >
                          {submitting ? "Processing..." : "Mark as Unpaid"}
                        </button>
                        <button
                          onClick={() => {
                            setCheckedIds([]);
                            setCheckedCustomerId("");
                          }}
                          disabled={submitting}
                          className={styles.clear_filter_link}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                {/* Orders Table */}
                <div className={styles.table_wrapper}>
                  <table className={styles.procurement_table}>
                    <thead>
                      <tr className={styles.table_head_row}>
                        <th className={styles.table_header_cell}>Date</th>
                        <th className={styles.table_header_cell}>
                          Order Total (₹)
                        </th>
                        <th className={styles.table_header_cell}>Status</th>
                        <th className={styles.table_header_cell}>
                          <div className={styles.select_all_wrapper}>
                            <input
                              type="checkbox"
                              className={styles.payment_checkbox}
                              onChange={(e) =>
                                handleSelectAll(e, customer._id, orders)
                              }
                              disabled={isCustomerDisabled}
                              checked={isAllChecked}
                              title={
                                isCustomerDisabled
                                  ? "Complete active customer's payment first"
                                  : "Select All"
                              }
                            />
                            *
                          </div>
                        </th>
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
                                new Date(order.date).toLocaleDateString(
                                  "en-IN",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                  },
                                )
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
                            <td className={styles.table_cell}>
                              {order.paymentStatus === "Paid" ? (
                                <span className={styles.status_paid}>Paid</span>
                              ) : (
                                <span className={styles.status_due}>Due</span>
                              )}
                            </td>
                            <td className={styles.table_cell}>
                              <input
                                type="checkbox"
                                className={styles.payment_checkbox}
                                checked={checkedIds.includes(order._id)}
                                onChange={() =>
                                  handleCheck(order._id, customer._id)
                                }
                                disabled={isCustomerDisabled}
                              />
                            </td>
                            <td className={styles.table_cell}>
                              <CommentEditor
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
                      <button
                        onClick={() => handleShowMore(customer._id)}
                        className={styles.show_more_btn}
                        disabled={submitting}
                      >
                        Show 20 More ({orders.length - visibleCount} more)
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
    </div>
  );
}
