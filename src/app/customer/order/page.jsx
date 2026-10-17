"use client";
import { formatStat } from "@/utils/formatNumberWithComma";
import StatTrendBackground from "@/components/StatTrendBackground";
import trendStyles from "@/css/stat-trend.module.css";
import { customerAccountTrends } from "@/lib/history-card-trends";
import CategoryBadge from "@/components/CategoryBadge";
import CustomerPaymentDialog from "@/components/CustomerPaymentDialog";

import { useSession } from "next-auth/react";
import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/order.module.css";
import {
  formatNumberWithCommasNoDecimal,
} from "@/utils/formatNumberWithComma";
import { getCurrentMonthStartDate, getTodayDate } from "@/utils/dateUtils";
import { exportInvoiceToPDF } from "@/utils/exportInvoice";
import { formatDateForDisplay, formatDate } from "@/utils/dateUtils";
import Image from "next/image";

const PRODUCT_FIELDS = [
  { name: "Milk", priceKey: "milkPrice" },
  { name: "Butter", priceKey: "butterPrice" },
  { name: "Fresh Cream", priceKey: "freshCreamPrice" },
  { name: "Curd", priceKey: "curdPrice" },
  { name: "Ghee", priceKey: "gheePrice" },
  { name: "Soft Paneer", priceKey: "softPaneerPrice" },
  { name: "Premium Paneer", priceKey: "premiumPaneerPrice" },
];

const GST_RATE = 5;
const GST_OPTIONS = [
  { value: "inclusive", label: "Price includes GST" },
  { value: "exclusive", label: "Add GST (5%) extra" },
];

const initialOrder = {
  date: getTodayDate(),
  paymentStatus: "Not Paid",
  comment: "",
  gstType: "inclusive",
  affectStockValue: false,
};

const initialFilters = {
  startDate: getCurrentMonthStartDate(),
  endDate: getTodayDate(),
};

// ---------- Helper Functions ----------


const sanitizeNumericInput = (value) => {
  return value.replace(/[^0-9.]/g, "");
};

// ---------- Helper Components ----------
const LoadingSpinner = () => (
  <div className={styles.page_container}>
    <div className={styles.loading_container}>
      <div className={styles.spinner}></div>
      <span className={styles.loading_text}>Loading orders...</span>
    </div>
  </div>
);

const InputGroup = ({ label, error, required, readOnly, ...props }) => (
  <div className={styles.input_group}>
    <label className={required ? styles.required_label : ""}>
      {label}
      {required && <span className={styles.required_asterisk}>*</span>}
    </label>
    <input
      className={`${styles.input} ${error ? styles.input_error : ""} ${
        readOnly ? styles.read_only_input : ""
      }`}
      autoComplete="off"
      readOnly={readOnly}
      {...props}
    />
    {error && <span className={styles.error_text}>{error}</span>}
  </div>
);

const StatItem = ({ label, value, unit, prefix = "", colorClass = "", trend, tone = "milk" }) => (
  <div className={`${styles.stat_item} ${trendStyles.card}`}>
    <StatTrendBackground points={trend} tone={tone} />
    <span className={styles.stat_label}>{label}</span>
    <span className={`${styles.stat_value} ${colorClass}`}>
      {prefix}
      {value}
      <span className={styles.stat_unit}>{unit}</span>
    </span>
  </div>
);

const SummaryStats = ({ summary, customerBalance, onEditPaid, trends }) => {
  const dateRangeLabel = "All Time";

  return (
    <div className={styles.summary_box}>
      <div className={styles.summary_header}>
        <h3>
          Summary{" "}
          <span className={styles.date_range_badge}>{dateRangeLabel}</span>
        </h3>
        {customerBalance && (
          <div className={styles.header_actions}>
            <button data-button="primary"
              onClick={onEditPaid}
              className={styles.header_payment_btn}
              title="Record Payment"
            >
              <span>Record payment</span>
            </button>
          </div>
        )}
      </div>
      <div className={styles.stats_grid}>
        <StatItem label="Orders" trend={trends.orders} value={summary.orderCount} unit="" />
        <StatItem
          label="Sales" trend={trends.sales} tone="amount"
          value={formatStat(summary.totalAmount)}
          prefix="₹"
        />
        <StatItem
          label="Received" trend={trends.received}
          value={formatStat(summary.paidAmount)}
          prefix="₹"
          colorClass={styles.text_green}
        />
        <StatItem
          label={summary.dueAmount < 0 ? "Credit" : "Due"} trend={trends.due} tone="amount"
          value={formatStat(Math.abs(summary.dueAmount))}
          prefix="₹"
          colorClass={summary.dueAmount < 0 ? styles.text_green : styles.text_red}
        />
      </div>
    </div>
  );
};

// ---------- Main Component ----------
function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customerId");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState({ customer: null, orders: [] });
  const [editingId, setEditingId] = useState({});
  const [errors, setErrors] = useState({});
  const [orderForm, setOrderForm] = useState(initialOrder);
  const [quantities, setQuantities] = useState({});
  const [openActionMenuId, setOpenActionMenuId] = useState(null);

  // New state for balance
  const [customerBalance, setCustomerBalance] = useState(null);
  const [payments, setPayments] = useState(null);
  const cardTrends = useMemo(() => customerAccountTrends(data.orders, payments, customerBalance), [data.orders, payments, customerBalance]);
  const [showPaidPopup, setShowPaidPopup] = useState(false);

  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  // Initialize quantities - defined first to avoid circular dependency
  const initializeQuantities = useCallback(() => {
    const initial = {};
    PRODUCT_FIELDS.forEach((p) => (initial[p.name] = ""));
    setQuantities(initial);
  }, []);

  const fetchPaymentHistory = useCallback(async () => {
    if (!customerId) return;
    try {
      const response = await fetch(`/api/customer/ledger?customerId=${customerId}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Payment history unavailable");
      const result = await response.json();
      setPayments(result.payments || []);
    } catch { setPayments(null); }
  }, [customerId]);
  useEffect(() => { setPayments(null); fetchPaymentHistory(); }, [fetchPaymentHistory]);

  // Fetch customer balance from total_orders
  const fetchCustomerBalance = useCallback(async () => {
    if (!customerId) return;
    try {
      const res = await fetch(
        `/api/customer/total_orders?customerId=${customerId}`,
      );
      if (res.ok) {
        const data = await res.json();
        setCustomerBalance(data);
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    }
  }, [customerId]);

  // Fetch all data (customer + orders + balance)
  const fetchAllData = useCallback(async () => {
    if (!customerId) return;
    try {
      setLoading(true);
      const [custRes, ordersRes] = await Promise.all([
        fetch(`/api/customer?customerId=${customerId}`),
        fetch(`/api/customer/order?customerId=${customerId}`),
      ]);
      if (!custRes.ok || !ordersRes.ok) throw new Error("Failed to load data");
      const [customerData, ordersData] = await Promise.all([
        custRes.json(),
        ordersRes.json(),
      ]);
      setData({
        customer: customerData,
        orders: Array.isArray(ordersData) ? ordersData : [],
      });
      initializeQuantities();
      fetchCustomerBalance(); // refresh balance after orders load
    } catch (error) {
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [customerId, initializeQuantities, fetchCustomerBalance]);

  useEffect(() => {
    if (!customerId) {
      toast.error("No customer ID provided");
      router.push("/customer");
      return;
    }
    fetchAllData();
  }, [customerId, router, fetchAllData]);

  // Click outside for action menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        openActionMenuId &&
        !event.target.closest(`.${styles.actionMenuWrapper}`)
      ) {
        setOpenActionMenuId(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [openActionMenuId]);

  const populateQuantitiesFromOrder = useCallback((order) => {
    const newQuantities = {};
    const items = Array.isArray(order.items) ? order.items : [];
    PRODUCT_FIELDS.forEach((product) => {
      const item = items.find((i) => i.product === product.name);
      newQuantities[product.name] = item ? String(item.quantity) : "";
    });
    setQuantities(newQuantities);
    setOrderForm((prev) => ({
      ...prev,
      gstType: order.gstType || "inclusive",
      affectStockValue:
        order.affectStockValue !== undefined ? order.affectStockValue : true,
    }));
  }, []);

  const handleQuantityChange = (productName, value) => {
    const sanitized = sanitizeNumericInput(value);
    setQuantities((prev) => ({ ...prev, [productName]: sanitized }));
    if (errors[productName])
      setErrors((prev) => ({ ...prev, [productName]: null }));
  };

  const orderTotal = useMemo(() => {
    let subtotal = 0;
    PRODUCT_FIELDS.forEach((product) => {
      const price = data.customer?.[product.priceKey] || 0;
      const qty = parseFloat(quantities[product.name] || 0);
      if (qty > 0) subtotal += price * qty;
    });
    return orderForm.gstType === "exclusive"
      ? subtotal * (1 + GST_RATE / 100)
      : subtotal;
  }, [data.customer, quantities, orderForm.gstType]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (["date", "comment", "gstType"].includes(name)) {
      setOrderForm((prev) => ({ ...prev, [name]: value }));
    }
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const filteredOrders = useMemo(() => {
    if (!data.orders.length) return [];
    const start = filters.startDate;
    const end = filters.endDate;
    return data.orders.filter((order) => {
      const recordDate = order.date.split("T")[0];
      if (start && start !== "" && recordDate < start) return false;
      if (end && end !== "" && recordDate > end) return false;
      return true;
    });
  }, [data.orders, filters]);

  // Summary now uses total_orders balance if available
  const summary = useMemo(() => {
    return {
      orderCount: customerBalance?.totalOrders || 0,
      totalAmount: customerBalance?.totalAmount || 0,
      paidAmount: customerBalance?.paidAmount || 0,
      dueAmount: customerBalance?.dueAmount || 0,
      avgOrderValue: customerBalance?.totalOrders
        ? customerBalance.totalAmount / customerBalance.totalOrders
        : 0,
    };
  }, [customerBalance]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const resetFilterForm = () => setFilters(initialFilters);
  const clearFilters = () => setFilters({ startDate: "", endDate: "" });
  const todayFilter = () => {
    const today = getTodayDate();
    setFilters({ startDate: today, endDate: today });
  };

  const handleExport = async (format, orders, date) => {
    if (!orders?.length) {
      toast.error("No data to export");
      return;
    }
    const dateRange = date
      ? { start: date, end: date }
      : {
          start: formatDateForDisplay(filters.startDate) || "all",
          end: formatDateForDisplay(filters.endDate) || "all",
        };
    const customerName = data.customer?.customerName || "Unknown";
    const fileName = date
      ? `${customerName}_invoice_${date}`
      : `${customerName}_invoice_${dateRange.start}_to_${dateRange.end}`;
    const customerDetails = {
      customerName: data.customer?.customerName,
      customerType: data.customer?.customerType,
      address: data.customer?.customerAddress,
      mobile: data.customer?.customerMobile,
      customerGST: data.customer?.customerGST,
    };
    if (format === "pdf") {
      await exportInvoiceToPDF(orders, customerDetails, dateRange, fileName);
      toast.success("PDF exported");
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!orderForm.date) newErrors.date = "Date is required";
    let hasQuantity = false;
    PRODUCT_FIELDS.forEach((product) => {
      const qty = parseFloat(quantities[product.name] || 0);
      if (qty < 0) newErrors[product.name] = "Quantity must be ≥ 0";
      else if (qty > 0) hasQuantity = true;
    });
    if (!hasQuantity)
      newErrors.general = "At least one product must have a positive quantity";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return toast.error("Please fix form errors");

    const items = [];
    PRODUCT_FIELDS.forEach((product) => {
      const price = data.customer[product.priceKey] || 0;
      const quantity = parseFloat(quantities[product.name] || 0);
      if (quantity > 0) {
        let total = price * quantity;
        if (orderForm.gstType === "exclusive") total *= 1 + GST_RATE / 100;
        items.push({
          product: product.name,
          quantity,
          ratePerUnit: price,
          totalAmount: total,
        });
      }
    });

    setSubmitting(true);
    try {
      const method = editingId._id ? "PUT" : "POST";
      const url = editingId._id
        ? `/api/customer/order?id=${editingId._id}`
        : "/api/customer/order";
      const payload = {
        customerId,
        customerName: data.customer.customerName,
        customerType: data.customer.customerType,
        date: orderForm.date,
        items,
        comment: orderForm.comment,
        totalAmount: orderTotal,
        paymentStatus: orderForm.paymentStatus,
        actionDoneBy: session?.user?.email,
        gstRate: GST_RATE,
        gstType: orderForm.gstType,
        affectStockValue: orderForm.affectStockValue,
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Submission failed");
      toast.success(editingId._id ? "Order updated" : "Order created");
      await fetchAllData(); // this now also refreshes balance
      resetForm();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this order?")) return;
    setDeleteLoading(id);
    try {
      const res = await fetch(`/api/customer/order?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Order deleted");
      await fetchAllData();
      if (editingId._id === id) resetForm();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleteLoading(null);
      setOpenActionMenuId(null);
    }
  };

  const handleEdit = (order) => {
    if (editingId._id === order._id) {
      resetForm();
      setOpenActionMenuId(null);
      return;
    }
    setEditingId(order);
    setOrderForm({
      date: order.date.split("T")[0],
      paymentStatus: order.paymentStatus || "Not Paid",
      comment: order.comment || "",
      gstType: order.gstType || "inclusive",
      affectStockValue:
        order.affectStockValue !== undefined ? order.affectStockValue : true,
    });
    populateQuantitiesFromOrder(order);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setOpenActionMenuId(null);
  };

  const resetForm = () => {
    setOrderForm({ ...initialOrder });
    setEditingId({});
    setErrors({});
    initializeQuantities();
  };

  if (!data.customer && !loading) {
    return (
      <div className={styles.error_state}>
        <h2>Customer Not Found</h2>
        <button data-button="secondary"
          onClick={() => router.push("/customer")}
          className={styles.error_state_primary_btn}
        >
          Back to Customers
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page_container}>
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Header */}
      <div className={styles.header}>
        {loading ? (
          <span className={styles.loading_text}>Loading customer info...</span>
        ) : (
          <div className={styles.header_title}>
            <h1>{data.customer?.customerName}</h1>
            <div className={styles.customer_info_badges}>
              <CategoryBadge kind="customer" value={data.customer?.customerType} />
              {data.customer?.customerGST && (
                <span className={styles.gst_tag}>
                  GST: {data.customer.customerGST}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Form Section */}
      <div className={styles.form_section}>
        <div className={styles.form_header}>
          <h2>{editingId._id ? "Edit Order" : "New Order"}</h2>
        </div>
        <form onSubmit={handleSubmit} className={styles.order_form}>
          <div className={styles.form_grid}>
            <InputGroup
              label="Date"
              name="date"
              type="date"
              value={orderForm.date}
              onChange={handleInputChange}
              max={getTodayDate()}
              error={errors.date}
              required
            />
            {PRODUCT_FIELDS.map((product) => (
              <InputGroup
                key={product.name}
                label={product.name}
                name={product.name}
                type="text"
                inputMode="numeric"
                value={quantities[product.name] || ""}
                onChange={(e) =>
                  handleQuantityChange(product.name, e.target.value)
                }
                placeholder={`Enter ${product.name} quantity`}
                error={errors[product.name]}
                disabled={submitting}
              />
            ))}
          </div>

          <div className={styles.form_grid_orders_comment}>
            <InputGroup
              label="Comment"
              name="comment"
              type="text"
              placeholder="Enter comments"
              value={orderForm.comment}
              onChange={handleInputChange}
              disabled={submitting}
            />
            <div className={styles.input_group}>
              <label>GST Option</label>
              <select
                name="gstType"
                value={orderForm.gstType}
                onChange={handleInputChange}
                className={styles.select_input}
                disabled={submitting}
              >
                {GST_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <InputGroup
              label="Order Total"
              name="orderTotal"
              value={`₹${formatNumberWithCommasNoDecimal(orderTotal)}`}
              readOnly
              placeholder="0"
            />
            <div className={styles.input_group}>
              <label>
                <input
                  type="checkbox"
                  checked={orderForm.affectStockValue}
                  onChange={(e) =>
                    setOrderForm((prev) => ({
                      ...prev,
                      affectStockValue: e.target.checked,
                    }))
                  }
                  className={styles.checkbox}
                  disabled={submitting}
                />
                <span className={styles.checkboxLabel}>Affect Stock Value</span>
              </label>
            </div>
          </div>

          {errors.general && (
            <div className={styles.error_text}>{errors.general}</div>
          )}

          <div className={styles.form_actions}>
            <button data-button="primary"
              type="submit"
              disabled={submitting}
              className={styles.primary_btn}
            >
              {submitting
                ? "Processing..."
                : editingId._id
                  ? "Update Order"
                  : "Create Order"}
            </button>
            {editingId._id && (
              <button data-button="secondary"
                type="button"
                onClick={resetForm}
                className={styles.secondary_btn}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </div>

      {customerBalance && (
        <SummaryStats
          summary={summary}
          trends={cardTrends}
          customerBalance={customerBalance}
          onEditPaid={() => setShowPaidPopup(true)}
        />
      )}

      {/* Filter Section */}
      {data.orders.length > 0 && (
        <div data-filter="card" className={styles.filter_section}>
          <div className={styles.form_header}>
            <h2>Filter by Date Range</h2>
          </div>
          <div data-filter="content" className={styles.filter_row}>
            <div data-filter="grid" className={styles.date_input_group}>
              <div data-filter="field" className={styles.date_field}>
                <label>From Date</label>
                <input
                  type="date"
                  name="startDate"
                  value={filters.startDate}
                  onChange={handleFilterChange}
                  className={styles.filter_input}
                />
              </div>
              <div data-filter="field" className={styles.date_field}>
                <label>To Date</label>
                <input
                  type="date"
                  name="endDate"
                  value={filters.endDate}
                  onChange={handleFilterChange}
                  className={styles.filter_input}
                />
              </div>
            </div>
            <div data-filter="actions" className={styles.filter_actions}>
              <button data-button="secondary"
                type="button"
                onClick={resetFilterForm}
                className={styles.btn_secondary}
              >
                Reset
              </button>
              <button data-button="secondary"
                type="button"
                onClick={clearFilters}
                className={styles.btn_secondary_2}
              >
                Clear
              </button>
              <button data-button="secondary"
                type="button"
                onClick={todayFilter}
                className={styles.btn_primary}
              >
                Today
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export & Bulk Actions */}
      {filteredOrders.length > 0 && (
        <div className={styles.export_section}>
          <div className={styles.entry_count}>
            {filteredOrders.length} order(s) found
          </div>
          <div className={styles.export_buttons}>
            <button data-button="secondary"
              onClick={() => handleExport("pdf", filteredOrders)}
              className={styles.export_btn}
            >
              DOWNLOAD INVOICE
            </button>
          </div>
        </div>
      )}


      {/* Orders Table */}
      <div className={styles.table_wrapper}>
        {loading ? (
          <LoadingSpinner />
        ) : filteredOrders.length === 0 ? (
          <div className={styles.empty_state}>
            <p>No orders found for the selected criteria.</p>
          </div>
        ) : (
          <div className={styles.table_container}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  {PRODUCT_FIELDS.map((p) => (
                    <th key={p.name}>{p.name}</th>
                  ))}
                  <th>Order Total</th>
                  <th>Comment</th>
                  <th>Invoice</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const quantityMap = {};
                  (order.items || []).forEach(
                    (item) => (quantityMap[item.product] = item.quantity),
                  );
                  return (
                    <tr
                      key={order._id}
                      className={
                        editingId._id === order._id ? styles.active_row : ""
                      }
                    >
                      <td className={styles.date_cell}>
                        {formatDate(order.date)}
                      </td>
                      {PRODUCT_FIELDS.map((p) => (
                        <td key={p.name} className={styles.quantity_cell}>
                          {quantityMap[p.name] || "-"}
                        </td>
                      ))}
                      <td className={styles.total_cell}>
                        ₹{formatNumberWithCommasNoDecimal(order.totalAmount)}
                      </td>
                      <td className={styles.comment_cell}>
                        {order.comment ? (
                          <span
                            className={styles.comment}
                            data-text={order.comment}
                          >
                            i
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className={styles.invoice_cell}>
                        <button data-button="icon"
                          onClick={() =>
                            handleExport(
                              "pdf",
                              [order],
                              formatDateForDisplay(order.date),
                            )
                          }
                          className={styles.export_btn_table}
                          disabled={!filteredOrders.length}
                        >
                          <Image
                            alt="Download"
                            src="/invoice-download.png"
                            width={20}
                            height={20}
                          />
                        </button>
                      </td>
                      {isAdmin && (
                        <td className={styles.actions_cell}>
                          <div className={styles.actionMenuWrapper}>
                            <button data-button="icon"
                              className={styles.actionMenuButton}
                              onClick={() =>
                                setOpenActionMenuId(
                                  openActionMenuId === order._id
                                    ? null
                                    : order._id,
                                )
                              }
                              disabled={
                                loading ||
                                deleteLoading === order._id ||
                                !!editingId._id
                              }
                            >
                              ⋮
                            </button>
                            {openActionMenuId === order._id && (
                              <div className={styles.actionMenuPopup}>
                                <button data-button="menu"
                                  onClick={() => handleEdit(order)}
                                  className={styles.actionEditButton}
                                  disabled={
                                    loading || deleteLoading === order._id
                                  }
                                >
                                  Edit
                                </button>
                                <button data-button="menu-danger"
                                  onClick={() => handleDelete(order._id)}
                                  className={styles.actionDeleteButton}
                                  disabled={
                                    loading || deleteLoading === order._id
                                  }
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Paid Amount Modal */}
      <CustomerPaymentDialog
        isOpen={showPaidPopup}
        currentPaid={customerBalance?.paidAmount || 0}
        currentDue={customerBalance?.dueAmount || 0}
        customerName={data.customer?.customerName || "Customer"}
        customerId={customerId}
        onClose={() => setShowPaidPopup(false)}
        onSuccess={(result) => { setCustomerBalance(previous => ({ ...previous, paidAmount: result.paidAmount, dueAmount: result.dueAmount })); fetchPaymentHistory(); }}
      />
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <OrdersContent />
    </Suspense>
  );
}
