"use client";

import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/order.module.css"; // renamed CSS module
import {
  formatNumberWithCommas,
  formatNumberWithCommasNoDecimal,
} from "@/utils/formatNumberWithComma";
import { getPreviousMonthDate, getTodayDate } from "@/utils/dateUtils";
import { exportToCSV, exportToPDF } from "@/utils/exportUtils";

// ========== CONSTANTS & UTILITIES ==========

const PRODUCT_TYPES = [
  { value: "", label: "Select Product" },
  { value: "Soft Paneer", label: "Soft Paneer" },
  { value: "Premium Paneer", label: "Premium Paneer" },
  { value: "Cream", label: "Cream" },
  { value: "Ghee", label: "Ghee" },
  { value: "Curd", label: "Curd" },
];

const LoadingSpinner = () => (
  <div className={styles.page_container}>
    <div className={styles.loading_container}>
      <div className={styles.spinner}></div>
      <span className={styles.loading_text}>Loading orders...</span>
    </div>
  </div>
);

const getCurrentTimePeriod = () => {
  const hour = new Date().getHours();
  return hour >= 12 ? "PM" : "AM";
};

// One order can have multiple items
const initialOrderItem = {
  product: "",
  quantity: "",
  ratePerUnit: "",
  totalAmount: 0,
};

const initialOrder = {
  date: getTodayDate(),
  time: getCurrentTimePeriod(),
  items: [{ ...initialOrderItem }],
  paymentStatus: "Not Paid",
};

const initialFilters = {
  startDate: getPreviousMonthDate(),
  endDate: getTodayDate(),
};

// ========== REUSABLE COMPONENTS ==========
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

const TimePeriodSelect = ({ value, onChange, error }) => (
  <div className={styles.input_group}>
    <label className={styles.required_label}>
      Time Period
      <span className={styles.required_asterisk}>*</span>
    </label>
    <select
      name="time"
      value={value}
      onChange={onChange}
      className={styles.select_input}
      aria-label="Select time period"
    >
      <option value="AM">AM (Morning)</option>
      <option value="PM">PM (Evening)</option>
    </select>
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
      <StatItem label="Total Items" value={summary.itemCount} unit="" />
      <StatItem
        label="Daily Avg (Items)"
        value={summary.avgItemsPerDay.toFixed(1)}
        unit="/day"
      />
      <StatItem
        label="Total Amount"
        value={formatNumberWithCommasNoDecimal(summary.totalAmount)}
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
  const [checkedIds, setCheckedIds] = useState([]); // for bulk actions on order items?
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState({ customer: null, orders: [] });
  const [editingId, setEditingId] = useState({}); // could be order id or item id? We'll use order id for now.
  const [errors, setErrors] = useState({});
  const [orderForm, setOrderForm] = useState(initialOrder);

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
    } catch (error) {
      console.error("Load error:", error);
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (!customerId) {
      toast.error("No customer ID provided");
      // router.push("/customer");
      return;
    }
    fetchAllData();
  }, [customerId, router, fetchAllData]);

  // Handle changes in order items
  const handleItemChange = (index, field, value) => {
    let processedValue = value;
    if (field === "quantity" || field === "ratePerUnit") {
      processedValue = sanitizeNumericInput(value);
    }

    setOrderForm((prev) => {
      const updatedItems = prev.items.map((item, i) => {
        if (i === index) {
          const newItem = { ...item, [field]: processedValue };
          // Recalculate total amount for this item
          if (field === "quantity" || field === "ratePerUnit") {
            const qty = parseFloat(newItem.quantity) || 0;
            const rate = parseFloat(newItem.ratePerUnit) || 0;
            newItem.totalAmount = qty * rate;
          }
          return newItem;
        }
        return item;
      });
      return { ...prev, items: updatedItems };
    });

    // Clear field-specific error if any
    if (errors[`items.${index}.${field}`]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[`items.${index}.${field}`];
        return newErrors;
      });
    }
  };

  const addProduct = () => {
    setOrderForm((prev) => ({
      ...prev,
      items: [...prev.items, { ...initialOrderItem }],
    }));
  };

  const removeProduct = (index) => {
    if (orderForm.items.length === 1) {
      toast.warning("At least one item is required");
      return;
    }
    setOrderForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  // Overall total of the order
  const orderTotal = useMemo(() => {
    return orderForm.items.reduce(
      (sum, item) => sum + (item.totalAmount || 0),
      0,
    );
  }, [orderForm.items]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === "date") {
      setOrderForm((prev) => ({ ...prev, date: value }));
    } else if (name === "time") {
      setOrderForm((prev) => ({ ...prev, time: value }));
    }
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleCheck = (id) => {
    // For bulk actions, we might want to select entire orders or individual items.
    // We'll keep it simple: select order items by their ID (flattened items in table)
    setCheckedIds((prev) =>
      prev.includes(id)
        ? prev.filter((itemId) => itemId !== id)
        : [...prev, id],
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const eligibleIds = flattenedTableData
        .filter((row) => row.paymentStatus === "Not Paid")
        .map((row) => row._id);
      setCheckedIds(eligibleIds);
    } else {
      setCheckedIds([]);
    }
  };

  const handleBulkMarkAsPaid = async () => {
    if (checkedIds.length === 0) return;

    if (!window.confirm(`Mark ${checkedIds.length} items as paid?`)) return;

    setSubmitting(true);
    try {
      // This endpoint should accept an array of item IDs (or order IDs) and update payment status.
      const res = await fetch("/api/customer/order/bulk-update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: checkedIds, status: "Paid" }),
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textError = await res.text();
        console.error("HTML Error:", textError);
        throw new Error(
          `Server routing error (Status: ${res.status}). Restart server.`,
        );
      }

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Bulk update failed");

      toast.success(`Successfully marked ${checkedIds.length} items as paid`);
      setCheckedIds([]);
      await fetchAllData();
    } catch (error) {
      console.error("Bulk action error:", error);
      toast.error(error.message || "Failed to process bulk payment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const todayFilter = () =>
    setFilters({ startDate: getTodayDate(), endDate: getTodayDate() });
  const clearFilters = () => setFilters({ startDate: "", endDate: "" });
  const resetFilterForm = () => {
    setFilters(initialFilters);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!orderForm.date) newErrors.date = "Date is required";
    if (!orderForm.time) newErrors.time = "Time period is required";
    else if (!["AM", "PM"].includes(orderForm.time))
      newErrors.time = "Invalid time period";

    orderForm.items.forEach((item, index) => {
      if (!item.product)
        newErrors[`items.${index}.product`] = "Product is required";
      const qty = parseFloat(item.quantity);
      if (!item.quantity)
        newErrors[`items.${index}.quantity`] = "Quantity is required";
      else if (qty <= 0)
        newErrors[`items.${index}.quantity`] = "Quantity must be > 0";
      const rate = parseFloat(item.ratePerUnit);
      if (!item.ratePerUnit)
        newErrors[`items.${index}.ratePerUnit`] = "Rate is required";
      else if (rate <= 0)
        newErrors[`items.${index}.ratePerUnit`] = "Rate must be > 0";
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error("Please fix form errors");
      return;
    }

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
        time: orderForm.time,
        items: orderForm.items.map((item) => ({
          product: item.product,
          quantity: parseFloat(item.quantity),
          ratePerUnit: parseFloat(item.ratePerUnit),
          totalAmount: item.totalAmount,
        })),
        totalAmount: orderTotal,
        paymentStatus: orderForm.paymentStatus,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Submission failed");

      toast.success(
        editingId._id
          ? "Order updated successfully"
          : "Order created successfully",
      );
      await fetchAllData();
      resetForm();
    } catch (error) {
      console.error("Submit error:", error);
      toast.error(error.message || "Failed to save order");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this order? This action cannot be undone.",
      )
    )
      return;

    try {
      const res = await fetch(`/api/customer/order?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Delete failed");
      }
      await fetchAllData();
      toast.success("Order deleted successfully");
      if (editingId._id === id) resetForm();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error.message || "Failed to delete order");
    }
  };

  const handleEdit = (order) => {
    if (editingId._id && editingId._id === order._id) {
      resetForm();
      return;
    }
    setCheckedIds([]);
    setEditingId(order);
    setOrderForm({
      date: order.date.split("T")[0],
      time: order.time || "AM",
      items: order.items.map((item) => ({
        product: item.product,
        quantity: item.quantity.toString(),
        ratePerUnit: item.ratePerUnit.toString(),
        totalAmount: item.totalAmount,
      })),
      paymentStatus: order.paymentStatus || "Not Paid",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setOrderForm({ ...initialOrder, time: getCurrentTimePeriod() });
    setEditingId({});
    setErrors({});
  };

  // Flatten orders into rows for table (each order item becomes a row)
  const flattenedTableData = useMemo(() => {
    const rows = [];
    data.orders.forEach((order) => {
      order.items.forEach((item, idx) => {
        rows.push({
          _id: `${order._id}_${idx}`, // unique id for each item
          orderId: order._id,
          date: order.date,
          time: order.time,
          product: item.product,
          quantity: item.quantity,
          ratePerUnit: item.ratePerUnit,
          totalAmount: item.totalAmount,
          paymentStatus: order.paymentStatus, // payment status at order level, could be per item if needed
        });
      });
    });
    return rows;
  }, [data.orders]);

  // Apply date filters
  const filteredRows = useMemo(() => {
    if (!flattenedTableData.length) return [];
    const start = filters.startDate;
    const end = filters.endDate;
    return flattenedTableData.filter((row) => {
      const recordDate = row.date.split("T")[0];
      if (start && recordDate < start) return false;
      if (end && recordDate > end) return false;
      return true;
    });
  }, [filters, flattenedTableData]);

  // Summary stats
  const summary = useMemo(() => {
    if (!filteredRows.length) {
      return {
        orderCount: 0,
        itemCount: 0,
        totalAmount: 0,
        avgOrderValue: 0,
        avgItemsPerDay: 0,
      };
    }

    const uniqueOrderIds = new Set(filteredRows.map((row) => row.orderId));
    const orderCount = uniqueOrderIds.size;
    const itemCount = filteredRows.length;
    const totalAmount = filteredRows.reduce(
      (sum, row) => sum + (row.totalAmount || 0),
      0,
    );

    // Get unique dates
    const uniqueDates = new Set(
      filteredRows.map((row) => row.date.split("T")[0]),
    );
    const daysWithData = uniqueDates.size || 1;

    return {
      orderCount,
      itemCount,
      totalAmount,
      avgOrderValue: orderCount ? totalAmount / orderCount : 0,
      avgItemsPerDay: itemCount / daysWithData,
    };
  }, [filteredRows]);

  const handleExport = (format) => {
    if (!filteredRows.length) {
      toast.error("No data to export");
      return;
    }
    const dateRange = {
      start: filters.startDate || "all",
      end: filters.endDate || "all",
    };
    const customerName = data.customer?.customerName || "Unknown";
    const fileName = `${customerName}_orders_${dateRange.start}_to_${dateRange.end}`;

    // For export, we might want to include order details. We'll use the filtered rows.
    if (format === "csv") {
      exportToCSV(filteredRows, data.customer, dateRange, fileName);
      toast.success("CSV exported successfully");
    } else if (format === "pdf") {
      exportToPDF(filteredRows, data.customer, dateRange, fileName);
      toast.success("PDF exported successfully");
    }
  };

  if (!data.customer && !loading) {
    return (
      <div className={styles.error_state}>
        <h2>Customer Not Found</h2>
        {/* <p>The customer you're looking for doesn't exist or has been removed.</p> */}
        <div className={styles.error_actions}>
          <button
            onClick={() => router.push("/customer")}
            className={styles.primary_btn}
            aria-label="Go back to customers"
          >
            Back to Customers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page_container}>
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
        {loading ? (
          <span className={styles.loading_text}>Loading customer info...</span>
        ) : (
          <div className={styles.header_title}>
            <h1>{data.customer?.customerName}</h1>
            <div className={styles.customer_info}>
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
          <h2>{editingId._id ? "Edit Order" : "Create New Order"}</h2>
        </div>

        <form onSubmit={handleSubmit} className={styles.order_form}>
          {Object.keys(errors).length > 0 && (
            <div className={styles.error_alert}>
              <span className={styles.error_icon}>⚠️</span>
              Please fix the errors in the form
            </div>
          )}

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
            <TimePeriodSelect
              value={orderForm.time}
              onChange={handleInputChange}
              error={errors.time}
            />
          </div>

          <h3 className={styles.items_header}>Order Items</h3>
          {orderForm.items.map((item, index) => (
            <div key={index} className={styles.item_row}>
              <div className={styles.item_fields}>
                <div className={styles.input_group} style={{ flex: 2 }}>
                  <label>Product</label>
                  <select
                    value={item.product}
                    onChange={(e) =>
                      handleItemChange(index, "product", e.target.value)
                    }
                    className={`${styles.select_input} ${errors[`items.${index}.product`] ? styles.input_error : ""}`}
                  >
                    {PRODUCT_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {errors[`items.${index}.product`] && (
                    <span className={styles.error_text}>
                      {errors[`items.${index}.product`]}
                    </span>
                  )}
                </div>

                <div className={styles.input_group} style={{ flex: 1 }}>
                  <label>Quantity</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.quantity}
                    onChange={(e) =>
                      handleItemChange(index, "quantity", e.target.value)
                    }
                    className={`${styles.input} ${errors[`items.${index}.quantity`] ? styles.input_error : ""}`}
                  />
                  {errors[`items.${index}.quantity`] && (
                    <span className={styles.error_text}>
                      {errors[`items.${index}.quantity`]}
                    </span>
                  )}
                </div>

                <div className={styles.input_group} style={{ flex: 1 }}>
                  <label>Rate/Unit</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.ratePerUnit}
                    onChange={(e) =>
                      handleItemChange(index, "ratePerUnit", e.target.value)
                    }
                    className={`${styles.input} ${errors[`items.${index}.ratePerUnit`] ? styles.input_error : ""}`}
                  />
                  {errors[`items.${index}.ratePerUnit`] && (
                    <span className={styles.error_text}>
                      {errors[`items.${index}.ratePerUnit`]}
                    </span>
                  )}
                </div>

                <div className={styles.input_group} style={{ flex: 1 }}>
                  <label>Total</label>
                  <input
                    type="text"
                    value={
                      item.totalAmount
                        ? formatNumberWithCommas(item.totalAmount)
                        : ""
                    }
                    readOnly
                    className={`${styles.input} ${styles.read_only_input}`}
                  />
                </div>

                {orderForm.items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeProduct(index)}
                    className={styles.remove_item_btn}
                    aria-label="Remove item"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}

          <div className={styles.add_item_btn_container}>
            <button
              type="button"
              onClick={addProduct}
              className={styles.secondary_btn}
            >
              + Add Another Product
            </button>
          </div>

          <div className={styles.order_total}>
            <strong>Order Total: ₹{formatNumberWithCommas(orderTotal)}</strong>
          </div>

          {editingId._id && (
            <div className={styles.edit_payment_wrapper}>
              <label className={styles.edit_payment_label}>
                Payment Status:
              </label>
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
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
                  title="Toggle payment status"
                />
                {orderForm.paymentStatus === "Paid" ? (
                  <span className={styles.status_paid}>Paid</span>
                ) : (
                  <span className={styles.status_due}>Due</span>
                )}
              </div>
            </div>
          )}

          <div className={styles.form_actions}>
            <button
              type="submit"
              disabled={submitting}
              className={styles.primary_btn}
            >
              {submitting ? (
                <>
                  <span className={styles.button_spinner}></span>
                  {editingId._id ? "Updating..." : "Creating..."}
                </>
              ) : editingId._id ? (
                "Update Order"
              ) : (
                "Create Order"
              )}
            </button>
          </div>
        </form>
      </div>

      {data.orders.length > 0 && (
        <form className={styles.filter_form}>
          <div className={styles.filter_header}>
            <h2>Filter by Date Range</h2>
          </div>
          <div className={styles.filter_row}>
            <div className={styles.date_filter_section}>
              <div className={styles.date_input_group}>
                <div className={styles.date_field}>
                  <label htmlFor="startDate">From Date</label>
                  <input
                    id="startDate"
                    type="date"
                    name="startDate"
                    value={filters.startDate}
                    onChange={handleFilterChange}
                    className={styles.filter_input}
                    max={filters.endDate || getTodayDate()}
                    aria-label="Select start date"
                  />
                </div>
                <div className={styles.date_field}>
                  <label htmlFor="endDate">To Date</label>
                  <input
                    id="endDate"
                    type="date"
                    name="endDate"
                    value={filters.endDate}
                    onChange={handleFilterChange}
                    className={styles.filter_input}
                    max={getTodayDate()}
                    min={filters.startDate}
                    aria-label="Select end date"
                  />
                </div>
              </div>
            </div>
            <div className={styles.filter_actions}>
              <button
                onClick={resetFilterForm}
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
            </div>
          </div>
        </form>
      )}

      {/* SUMMARY SECTION */}
      {summary.itemCount > 0 && (
        <SummaryStats summary={summary} filters={filters} />
      )}

      {/* EXPORT SECTION */}
      {/* {summary.itemCount > 0 && (
        <div className={styles.export_section}>
          <span className={styles.entry_count}>
            {summary.itemCount} item{summary.itemCount !== 1 ? "s" : ""} found
          </span>
          <div className={styles.export_buttons}>
            <button
              onClick={() => handleExport("csv")}
              className={styles.export_btn}
              disabled={!filteredRows.length}
              aria-label="Export data as CSV"
            >
              Export as CSV
            </button>
            <button
              onClick={() => handleExport("pdf")}
              className={styles.export_btn}
              disabled={!filteredRows.length}
              aria-label="Export data as PDF"
            >
              Export as PDF
            </button>
          </div>
        </div>
      )} */}

      {/* BULK ACTIONS BANNER */}
      {checkedIds.length > 0 && (
        <div className={styles.bulk_actions_banner}>
          <span className={styles.bulk_actions_text}>
            {checkedIds.length} item(s) selected
          </span>
          <button
            onClick={handleBulkMarkAsPaid}
            disabled={submitting}
            className={styles.primary_btn}
          >
            {submitting ? "Processing..." : "Mark Selected as Paid"}
          </button>
          <button
            onClick={() => setCheckedIds([])}
            disabled={submitting}
            className={styles.clear_filter_link}
          >
            Cancel
          </button>
        </div>
      )}

      {/* TABLE SECTION */}
      <div className={styles.table_wrapper}>
        {loading ? (
          <LoadingSpinner />
        ) : summary.itemCount === 0 ? (
          <div className={styles.empty_state}>
            {!data.customer ? (
              <>
                <span className={styles.empty_icon}>⚠️</span>
                <h3>Customer not found</h3>
                <button
                  onClick={() => router.push("/customer")}
                  className={styles.secondary_btn}
                >
                  Back to Customers
                </button>
              </>
            ) : data.orders.length === 0 ? (
              <>
                <span className={styles.empty_icon}>📦</span>
                <p>No orders yet, start by creating the first order</p>
              </>
            ) : (
              <>
                <span className={styles.empty_icon}>📊</span>
                <p>No orders found for the selected date range</p>
                <button
                  onClick={clearFilters}
                  className={styles.clear_filter_link}
                >
                  clear filters to see all {data.orders.length} orders
                </button>
              </>
            )}
          </div>
        ) : (
          <div className={styles.table_container}>
            <table className={styles.table} aria-label="Order history">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Time</th>
                  <th scope="col">Product</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Rate/Unit</th>
                  <th scope="col">Total (₹)</th>
                  <th scope="col">
                    <div className={styles.select_all_wrapper}>
                      {/* {filteredRows.filter((r) => r.paymentStatus === "Not Paid").length > 1 && (
                        <input
                          type="checkbox"
                          className={styles.payment_checkbox}
                          onChange={handleSelectAll}
                          disabled={!!editingId._id}
                          checked={
                            filteredRows.filter((r) => r.paymentStatus === "Not Paid").length > 0 &&
                            checkedIds.length ===
                              filteredRows.filter((r) => r.paymentStatus === "Not Paid").length
                          }
                          title="Select All Eligible"
                        />
                      )} */}
                      Status
                    </div>
                  </th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((row) => (
                  <tr
                    key={row._id}
                    className={
                      editingId._id === row.orderId ? styles.active_row : ""
                    }
                  >
                    <td className={styles.date_cell}>
                      {new Date(row.date).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className={styles.time_cell}>
                      <span
                        className={
                          row.time === "AM" ? styles.am_badge : styles.pm_badge
                        }
                      >
                        {row.time || "AM"}
                      </span>
                    </td>
                    {row.items.map((prod) => (
                      <div key={prod.product}>
                        <td className={styles.product_cell}>{prod.product}</td>
                        <td className={styles.quantity_cell}>
                          {parseFloat(prod.quantity).toFixed(2)}
                        </td>
                        <td className={styles.rate_cell}>
                          ₹{parseFloat(prod.ratePerUnit).toFixed(2)}
                        </td>
                        <td className={styles.total_cell}>
                          ₹{formatNumberWithCommasNoDecimal(prod.totalAmount)}
                        </td>
                      </div>
                    ))}

                    <td className={styles.payment_cell}>
                      {row.paymentStatus === "Not Paid" ? (
                        <div className={styles.unpaid_wrapper}>
                          <input
                            type="checkbox"
                            className={styles.payment_checkbox}
                            value={row._id}
                            disabled={!!editingId._id}
                            checked={checkedIds.includes(row._id)}
                            onChange={() => handleCheck(row._id)}
                            title="Select to pay"
                          />
                          <span className={styles.status_due}>Due</span>
                        </div>
                      ) : row.paymentStatus === "Paid" ? (
                        <span className={styles.status_paid}>Paid</span>
                      ) : (
                        <span className={styles.status_na}>N/A</span>
                      )}
                    </td>
                    <td className={styles.actions_cell}>
                      <div className={styles.action_buttons}>
                        <button
                          onClick={() => {
                            // Find full order to edit
                            const fullOrder = data.orders.find(
                              (o) => o._id === row.orderId,
                            );
                            if (fullOrder) handleEdit(fullOrder);
                          }}
                          className={styles.edit_btn}
                          disabled={submitting}
                          title="Edit order"
                        >
                          {editingId._id === row.orderId ? "Cancel" : "Edit"}
                        </button>
                        <button
                          onClick={() => handleDelete(row._id)}
                          className={styles.delete_btn}
                          disabled={submitting}
                          title="Delete order"
                        >
                          Delete
                        </button>
                      </div>
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

// ========== EXPORT WITH SUSPENSE ==========
export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.page_container}>
          <div className={styles.loading_container}>
            <div className={styles.spinner}></div>
            <span className={styles.loading_text}>Loading orders page...</span>
          </div>
        </div>
      }
    >
      <OrdersContent />
    </Suspense>
  );
}
