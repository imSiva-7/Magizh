"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/order.module.css";
import {
  formatNumberWithCommas,
  formatNumberWithCommasNoDecimal,
} from "@/utils/formatNumberWithComma";
import { getPreviousMonthDate, getTodayDate } from "@/utils/dateUtils";
import { exportToCSV, exportToPDF } from "@/utils/exportUtils";

// List of products with their price key in customer data
const productFields = [
  { name: "Milk", priceKey: "milkPrice" },
  { name: "Butter", priceKey: "butterPrice" },
  { name: "Fresh Cream", priceKey: "freshCreamPrice" },
  { name: "Curd", priceKey: "curdPrice" },
  { name: "Ghee", priceKey: "gheePrice" },
  { name: "Soft Paneer", priceKey: "softPaneerPrice" },
  { name: "Premium Paneer", priceKey: "premiumPaneerPrice" },
];

const GST_RATE = 5; // 5% GST
const GST_OPTIONS = [
  { value: "inclusive", label: "Price includes GST" },
  { value: "exclusive", label: "Add GST (5%) extra" },
];

const LoadingSpinner = () => (
  <div className={styles.page_container}>
    <div className={styles.loading_container}>
      <div className={styles.spinner}></div>
      <span className={styles.loading_text}>Loading orders...</span>
    </div>
  </div>
);

const initialOrder = {
  date: getTodayDate(),
  paymentStatus: "Not Paid",
  comment: "",
  gstType: "inclusive", // default to inclusive (price already includes GST)
};

const initialFilters = {
  startDate: getPreviousMonthDate(),
  endDate: getTodayDate(),
};

// ========== REUSABLE COMPONENTS ==========
const InputGroup = ({ label, error, required, readOnly, suffix, ...props }) => (
  <div className={styles.input_group}>
    <label className={required ? styles.required_label : ""}>
      {label}
      {required && <span className={styles.required_asterisk}>*</span>}
    </label>
    <div className={styles.input_wrapper}>
      <input
        className={`${styles.input} ${error ? styles.input_error : ""} ${
          readOnly ? styles.read_only_input : ""
        }`}
        autoComplete="off"
        readOnly={readOnly}
        {...props}
      />
      {suffix && <span className={styles.input_suffix}>{suffix}</span>}
    </div>
    {error && <span className={styles.error_text}>{error}</span>}
  </div>
);

const StatItem = ({ label, value, unit, prefix = "" }) => (
  <div className={styles.stat_item}>
    <span className={styles.stat_label}>{label}</span>
    <span className={styles.stat_value}>
      {prefix}
      {value}
      <span className={styles.stat_unit}>{unit}</span>
    </span>
  </div>
);
const StatItemGColor = ({ label, value, unit, prefix = "" }) => (
  <div className={styles.stat_item}>
    <span className={styles.stat_label}>{label}</span>
    <span className={`${styles.stat_value} ${styles.text_green}`}>
      {prefix}
      {value}
      <span className={styles.stat_unit}>{unit}</span>
    </span>
  </div>
);
const StatItemRColor = ({ label, value, unit, prefix = "" }) => (
  <div className={styles.stat_item}>
    <span className={styles.stat_label}>{label}</span>
    <span className={`${styles.stat_value} ${styles.text_red}`}>
      {prefix}
      {value}
      <span className={styles.stat_unit}>{unit}</span>
    </span>
  </div>
);

const SummaryStats = ({ summary, filters }) => (
  <div className={styles.summary_box}>
    <h3>
      Summary{" "}
      <span className={styles.date_range_badge}>
        {getDateRangeLabel(filters.startDate, filters.endDate)}
      </span>
    </h3>
    <div className={styles.stats_grid}>
      <StatItem label="Total Orders" value={summary.orderCount} unit="" />
      <StatItem
        label="Total Amount"
        value={formatNumberWithCommasNoDecimal(summary.totalAmount)}
        prefix="₹"
      />

      <StatItemGColor
        label="Paid Amount"
        value={formatNumberWithCommasNoDecimal(summary.paidAmount)}
        prefix="₹"
      />

      <StatItemRColor
        label="Due Amount"
        value={formatNumberWithCommasNoDecimal(summary.dueAmount)}
        prefix="₹"
      />
      <StatItem
        label="Avg Order Value"
        value={summary.avgOrderValue.toFixed(2)}
        prefix="₹"
      />
    </div>
  </div>
);

// ========== HELPER FUNCTIONS ==========
const getDateRangeLabel = (startDate, endDate) => {
  if (startDate && endDate) {
    return startDate === endDate
      ? startDate
      : `${new Date(startDate).toLocaleDateString("en-IN")} to ${new Date(
          endDate,
        ).toLocaleDateString("en-IN")}`;
  }
  if (startDate)
    return `From ${new Date(startDate).toLocaleDateString("en-IN")}`;
  if (endDate) return `Till ${new Date(endDate).toLocaleDateString("en-IN")}`;
  return "All Records";
};

const sanitizeNumericInput = (value) => {
  let sanitized = value.replace(/[^\d.]/g, "");
  const parts = sanitized.split(".");
  if (parts.length > 2) {
    sanitized = parts[0] + "." + parts.slice(1).join("");
  }
  if (parts[1]) {
    sanitized = parts[0] + "." + parts[1].substring(0, 2);
  }
  return sanitized;
};

const getCustomerTypeClass = (customerType) => {
  const typeClassMap = {
    Regular: styles.type_regular_badge,
    Wholesale: styles.type_wholesale_badge,
    Retail: styles.type_retail_badge,
    Other: styles.type_other_badge,
  };
  return typeClassMap[customerType] || styles.default_customer;
};

// ========== MAIN COMPONENT ==========
function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customerId");

  const [loading, setLoading] = useState(true);
  const [checkedIds, setCheckedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState({ customer: null, orders: [] });
  const [editingId, setEditingId] = useState({});
  const [errors, setErrors] = useState({});
  const [orderForm, setOrderForm] = useState(initialOrder);
  const [quantities, setQuantities] = useState({});
  const [openActionMenuId, setOpenActionMenuId] = useState(null);

  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  // Initialize quantities for all products
  const initializeQuantities = useCallback(() => {
    const initialQuantities = {};
    productFields.forEach((product) => {
      initialQuantities[product.name] = "";
    });
    setQuantities(initialQuantities);
  }, []);

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

  // Fetch customer and orders
  const fetchAllData = useCallback(async () => {
    if (!customerId) return;
    try {
      setLoading(true);
      const [custRes, ordersRes] = await Promise.all([
        fetch(`/api/customer?customerId=${customerId}`),
        fetch(`/api/customer/order?customerId=${customerId}`),
      ]);

      if (!custRes.ok) throw new Error("Failed to load customer");
      if (!ordersRes.ok) throw new Error("Failed to load orders");

      const [customerData, ordersData] = await Promise.all([
        custRes.json(),
        ordersRes.json(),
      ]);

      setData({
        customer: customerData,
        orders: Array.isArray(ordersData) ? ordersData : [],
      });

      initializeQuantities();
    } catch (error) {
      console.error("Load error:", error);
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [customerId, initializeQuantities]);

  useEffect(() => {
    if (!customerId) {
      toast.error("No customer ID provided");
      router.push("/customer");
      return;
    }
    fetchAllData();
  }, [customerId, router, fetchAllData]);

  // When editing an order, populate quantities from order items
  const populateQuantitiesFromOrder = (order) => {
    const newQuantities = {};
    productFields.forEach((product) => {
      const item = order.items.find((i) => i.product === product.name);
      newQuantities[product.name] = item ? item.quantity.toString() : "";
    });
    setQuantities(newQuantities);
    // Also populate GST type from order (if stored)
    if (order.gstType) {
      setOrderForm((prev) => ({ ...prev, gstType: order.gstType }));
    }
  };

  // Handle quantity change for a product
  const handleQuantityChange = (productName, value) => {
    const sanitized = sanitizeNumericInput(value);
    setQuantities((prev) => ({ ...prev, [productName]: sanitized }));
    if (errors[productName]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[productName];
        return newErrors;
      });
    }
  };

  // Calculate total amount for the order with GST
  const orderTotal = useMemo(() => {
    let subtotal = 0;
    productFields.forEach((product) => {
      const price = data.customer?.[product.priceKey] || 0;
      const quantity = parseFloat(quantities[product.name] || 0);
      if (quantity > 0) {
        subtotal += price * quantity;
      }
    });

    if (orderForm.gstType === "exclusive") {
      // Add GST (5%) to subtotal
      return subtotal * (1 + GST_RATE / 100);
    }
    // inclusive – price already includes GST, so no extra
    return subtotal;
  }, [data.customer, quantities, orderForm.gstType]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === "date" || name === "comment" || name === "gstType") {
      setOrderForm((prev) => ({ ...prev, [name]: value }));
    }
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  // Filter Orders based on Date Range
  const filteredOrders = useMemo(() => {
    if (!data.orders.length) return [];
    const start = filters.startDate;
    const end = filters.endDate;
    return data.orders.filter((order) => {
      const recordDate = order.date.split("T")[0];
      if (start && recordDate < start) return false;
      if (end && recordDate > end) return false;
      return true;
    });
  }, [data.orders, filters]);

  // Flatten orders for export (each item as a row)
  const flattenedTableData = useMemo(() => {
    const rows = [];
    filteredOrders.forEach((order) => {
      order.items.forEach((item, idx) => {
        rows.push({
          _id: `${order._id}_${idx}`,
          orderId: order._id,
          date: new Date(order.date).toLocaleDateString("en-IN"),
          product: item.product,
          quantity: item.quantity,
          ratePerUnit: item.ratePerUnit,
          totalAmount: item.totalAmount,
          paymentStatus: order.paymentStatus,
        });
      });
    });
    return rows;
  }, [filteredOrders]);

  // Handle select all orders (all orders, not only unpaid)
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = filteredOrders.map((order) => order._id);
      setCheckedIds(allIds);
    } else {
      setCheckedIds([]);
    }
  };

  // Handle individual order selection
  const handleCheck = (orderId) => {
    setCheckedIds((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId],
    );
  };

  // Bulk update status
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

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Bulk update failed");
      }
      toast.success(
        `Successfully marked ${checkedIds.length} order(s) as ${status}`,
      );
      setCheckedIds([]);
      await fetchAllData();
    } catch (error) {
      console.error("Bulk action error:", error);
      toast.error(error.message || "Failed to update payment status");
    } finally {
      setSubmitting(false);
    }
  };

  // Export data
  const handleExport = (format) => {
    if (!flattenedTableData.length) {
      toast.error("No data to export");
      return;
    }
    const dateRange = {
      start: filters.startDate || "all",
      end: filters.endDate || "all",
    };
    const customerName = data.customer?.customerName || "Unknown";
    const fileName = `${customerName}_orders_${dateRange.start}_to_${dateRange.end}`;

    if (format === "csv") {
      exportToCSV(flattenedTableData, data.customer, dateRange, fileName);
      toast.success("CSV exported successfully");
    } else if (format === "pdf") {
      exportToPDF(flattenedTableData, data.customer, dateRange, fileName);
      toast.success("PDF exported successfully");
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const todayFilter = () =>
    setFilters({ startDate: getTodayDate(), endDate: getTodayDate() });
  const clearFilters = () => setFilters({ startDate: "", endDate: "" });
  const resetFilterForm = () => setFilters(initialFilters);

  const validateForm = () => {
    const newErrors = {};
    if (!orderForm.date) newErrors.date = "Date is required";

    let hasQuantity = false;
    productFields.forEach((product) => {
      const qty = parseFloat(quantities[product.name] || 0);
      if (qty < 0) {
        newErrors[product.name] = "Quantity must be ≥ 0";
      } else if (qty > 0) {
        hasQuantity = true;
      }
    });
    if (!hasQuantity) {
      newErrors.general = "At least one product must have a positive quantity";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error("Please fix form errors");
      return;
    }

    const items = [];
    productFields.forEach((product) => {
      const price = data.customer[product.priceKey] || 0;
      const quantity = parseFloat(quantities[product.name] || 0);
      if (quantity > 0) {
        // Calculate per‑item total with GST
        let total = price * quantity;
        if (orderForm.gstType === "exclusive") {
          total = total * (1 + GST_RATE / 100);
        }
        items.push({
          product: product.name,
          quantity: quantity,
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
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Submission failed");

      toast.success(
        editingId._id
          ? "Order updated successfully"
          : "Order created successfully",
      );
      await fetchAllData();
      resetForm();
    } catch (error) {
      toast.error(error.message || "Failed to save order");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this order?")) return;
    setDeleteLoading(id);
    try {
      const res = await fetch(`/api/customer/order?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      await fetchAllData();
      toast.success("Order deleted successfully");
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
    setCheckedIds([]);
    setEditingId(order);
    setOrderForm({
      date: order.date.split("T")[0],
      paymentStatus: order.paymentStatus || "Not Paid",
      comment: order.comment || "",
      gstType: order.gstType || "inclusive",
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

  const summary = useMemo(() => {
    if (!filteredOrders.length) {
      return { orderCount: 0, totalAmount: 0, avgOrderValue: 0 };
    }
    const orderCount = filteredOrders.length;
    const totalAmount = filteredOrders.reduce(
      (sum, order) => sum + (order.totalAmount || 0),
      0,
    );
    const paidAmount = filteredOrders.reduce(
      (sum, order) =>
        order.paymentStatus == "Paid" ? sum + order.totalAmount : sum + 0,
      0,
    );
    const dueAmount = filteredOrders.reduce(
      (sum, order) =>
        order.paymentStatus == "Not Paid" ? sum + order.totalAmount : sum + 0,
      0,
    );
    return {
      orderCount,
      totalAmount,
      paidAmount,
      dueAmount,
      avgOrderValue: orderCount ? totalAmount / orderCount : 0,
    };
  }, [filteredOrders]);

  if (!data.customer && !loading) {
    return (
      <div className={styles.error_state}>
        <h2>Customer Not Found</h2>
        <button
          onClick={() => router.push("/customer")}
          className={styles.primary_btn}
        >
          Back to Customers
        </button>
      </div>
    );
  }

  const isSelectAllChecked =
    filteredOrders.length > 0 && checkedIds.length === filteredOrders.length;

  return (
    <div className={styles.page_container}>
      <ToastContainer position="top-right" autoClose={3000} />

      {/* HEADER */}
      <div className={styles.header}>
        {loading ? (
          <span className={styles.loading_text}>Loading customer info...</span>
        ) : (
          <div className={styles.header_title}>
            <h1>{data.customer?.customerName}</h1>
            <div className={styles.customer_info_badges}>
              <span
                className={getCustomerTypeClass(data.customer?.customerType)}
              >
                {data.customer?.customerType}
              </span>
              {data.customer?.customerGST && (
                <span className={styles.gst_tag}>
                  GST: {data.customer.customerGST}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* FORM SECTION */}
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

            {productFields.map((product) => {
              const quantity = quantities[product.name] || "";
              return (
                <InputGroup
                  key={product.name}
                  label={`${product.name}`}
                  name={product.name}
                  type="text"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) =>
                    handleQuantityChange(product.name, e.target.value)
                  }
                  placeholder={`Enter ${product.name} quantity`}
                  error={errors[product.name]}
                  disabled={submitting}
                />
              );
            })}
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
          </div>

          {errors.general && (
            <div className={styles.error_text}>{errors.general}</div>
          )}

          {editingId._id && (
            <div className={styles.edit_payment_wrapper}>
              <label className={styles.edit_payment_label}>
                Payment Status:
              </label>
              <div className={styles.payment_toggle}>
                <input
                  type="checkbox"
                  className={styles.payment_checkbox}
                  checked={orderForm.paymentStatus === "Paid"}
                  onChange={(e) =>
                    setOrderForm((prev) => ({
                      ...prev,
                      paymentStatus: e.target.checked ? "Paid" : "Not Paid",
                    }))
                  }
                />
                <span
                  className={
                    orderForm.paymentStatus === "Paid"
                      ? styles.status_paid
                      : styles.status_due
                  }
                >
                  {orderForm.paymentStatus === "Paid" ? "Paid" : "Due"}
                </span>
              </div>
            </div>
          )}

          <div className={styles.form_actions}>
            <button
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
              <button
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

      {/* FILTER SECTION */}
      {data.orders.length > 0 && (
        <div className={styles.filter_section}>
          <div className={styles.form_header}>
            <h2>Filter by Date Range</h2>
          </div>
          <div className={styles.filter_row}>
            <div className={styles.date_input_group}>
              <div className={styles.date_field}>
                <label>From Date</label>
                <input
                  type="date"
                  name="startDate"
                  value={filters.startDate}
                  onChange={handleFilterChange}
                  className={styles.filter_input}
                />
              </div>
              <div className={styles.date_field}>
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
            <div className={styles.filter_actions}>
              <button
                type="button"
                onClick={resetFilterForm}
                className={styles.btn_secondary}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className={styles.btn_secondary_2}
              >
                Clear
              </button>
              <button
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

      {/* EXPORT BUTTONS */}
      {/* {filteredOrders.length > 0 && (
        <div className={styles.export_section}>
          <div className={styles.entry_count}>
            {filteredOrders.length} order(s) found
          </div>
          <div className={styles.export_buttons}>
            <button
              onClick={() => handleExport("csv")}
              className={styles.export_btn}
              disabled={!filteredOrders.length}
            >
              Export as CSV
            </button>
            <button
              onClick={() => handleExport("pdf")}
              className={styles.export_btn}
              disabled={!filteredOrders.length}
            >
              Export as PDF
            </button>
          </div>
        </div>
      )} */}

      {summary.orderCount > 0 && (
        <SummaryStats summary={summary} filters={filters} />
      )}

      {/* BULK ACTIONS BANNER */}
      {checkedIds.length > 0 && (
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
              {submitting ? "Processing..." : "Mark  as Unpaid"}
            </button>
            <button
              onClick={() => {
                setCheckedIds([]);
              }}
              disabled={submitting}
              className={styles.clear_filter_link}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ORDERS TABLE */}
      <div className={styles.table_wrapper}>
        {loading ? (
          <LoadingSpinner />
        ) : filteredOrders.length === 0 ? (
          <div className={styles.empty_state}>
            <p>No orders found for the selected criteria.</p>
          </div>
        ) : (
          <>
            <div className={styles.table_container}>
              <table className={styles.table} aria-label="Orders list">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    {productFields.map((p) => (
                      <th key={p.name} scope="col">
                        {p.name}
                      </th>
                    ))}
                    <th scope="col">Order Total</th>
                    <th scope="col">Comment</th>
                    <th scope="col">
                      {" "}
                      <div className={styles.select_all_wrapper}>
                        <input
                          type="checkbox"
                          checked={isSelectAllChecked}
                          onChange={handleSelectAll}
                          disabled={submitting}
                        />*
                      </div>
                    </th>

                    <th scope="col">Status</th>
                    {isAdmin && <th scope="col">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const quantityMap = {};
                    order.items.forEach((item) => {
                      quantityMap[item.product] = item.quantity;
                    });

                    return (
                      <tr
                        key={order._id}
                        className={
                          editingId._id === order._id ? styles.active_row : ""
                        }
                      >
                        <td className={styles.date_cell}>
                          {new Date(order.date).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "2-digit",
                          })}
                        </td>
                        {productFields.map((product) => (
                          <td
                            key={product.name}
                            className={styles.quantity_cell}
                          >
                            {quantityMap[product.name] || "-"}
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
                        <td>
                          <input
                            type="checkbox"
                            className={styles.row_checkbox}
                            checked={checkedIds.includes(order._id)}
                            onChange={() => handleCheck(order._id)}
                            disabled={!!editingId._id}
                            title="Select order"
                          />
                        </td>
                        <td className={styles.payment_cell}>
                          {order.paymentStatus === "Not Paid" ? (
                            <span className={styles.status_due}>Due</span>
                          ) : (
                            <span className={styles.status_paid}>Paid</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className={styles.actions_cell}>
                            <div className={styles.actionMenuWrapper}>
                              <button
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
                                title="Actions"
                              >
                                ⋮
                              </button>
                              {openActionMenuId === order._id && (
                                <div className={styles.actionMenuPopup}>
                                  <button
                                    onClick={() => handleEdit(order)}
                                    className={styles.actionEditButton}
                                    disabled={
                                      loading || deleteLoading === order._id
                                    }
                                  >
                                    Edit
                                  </button>
                                  <button
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
          </>
        )}
      </div>
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
