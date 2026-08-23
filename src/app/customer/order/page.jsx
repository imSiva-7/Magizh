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
const getCustomerTypeClass = (customerType) => {
  switch (customerType?.toLowerCase()) {
    case "distributor":
      return styles.type_distributor_badge;
    case "wholesale":
      return styles.type_wholesale_badge;
    case "retail":
      return styles.type_retail_badge;
    case "restaurant":
      return styles.type_restaurant_badge;
    case "other":
      return styles.type_other_badge;
    default:
      return styles.default_customer;
  }
};

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

const StatItem = ({ label, value, unit, prefix = "", colorClass = "" }) => (
  <div className={styles.stat_item}>
    <span className={styles.stat_label}>{label}</span>
    <span className={`${styles.stat_value} ${colorClass}`}>
      {prefix}
      {value}
      <span className={styles.stat_unit}>{unit}</span>
    </span>
  </div>
);

const AmountStatItem = ({ label, value, unit, prefix = "", colorClass = "", onEdit }) => (
  <div className={styles.stat_item}>
    <span className={styles.stat_label}>{label}</span>
    <span className={`${styles.stat_value} ${colorClass}`}>
      {prefix}
      {value}
      <span className={styles.stat_unit}>{unit}</span>
    </span>
    {onEdit && (
      <button onClick={onEdit} className={styles.edit_btn}>Add Amount</button>
    )}
  </div>
);

const AmountReceivedPopup = ({ isOpen, currentValue, onClose, onSubmit }) => {
  const [inputValue, setInputValue] = useState("");

  // Update input value when popup opens with new currentValue
  useEffect(() => {
    if (isOpen) {
      // Use a small delay to avoid synchronous state update
      const timer = setTimeout(() => {
        setInputValue("");
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [currentValue, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    const amount = parseFloat(inputValue);
    if (isNaN(amount)) {
      toast.error("Please enter a valid amount");
      return;
    }
    onSubmit(amount);
  };

  return (
    <div className={styles.modal_overlay}>
      <div className={styles.modal_content}>
        <h3>Modify Received Amount</h3>
        <label>
           Received amount:
          <input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            // min="0"
            autoFocus
            step="1"
            placeholder="postive or negative number"


          />
        </label>
        <div className={styles.modal_actions}>
          <button onClick={handleSubmit}>Submit</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

const SummaryStats = ({ summary, filters, onEditPaid }) => {
  const getDateRangeLabel = (startDate, endDate) => {
    if (startDate && endDate) {
      return startDate === endDate
        ? startDate
        : `${new Date(startDate).toLocaleDateString("en-IN")} to ${new Date(endDate).toLocaleDateString("en-IN")}`;
    }
    if (startDate) return `From ${new Date(startDate).toLocaleDateString("en-IN")}`;
    if (endDate) return `Till ${new Date(endDate).toLocaleDateString("en-IN")}`;
    return "All Records";
  };

  return (
    <div className={styles.summary_box}>
      <h3>
        Summary{" "}
        <span className={styles.date_range_badge}>
          {getDateRangeLabel(filters.startDate, filters.endDate)}
        </span>
      </h3>
      <div className={styles.stats_grid}>
        <StatItem label="No. Of. Orders" value={summary.orderCount} unit="" />
        <StatItem
          label="Total Amount"
          value={formatNumberWithCommasNoDecimal(summary.totalAmount)}
          prefix="₹"
        />
        <StatItem
          label="Avg Order Value"
          value={formatNumberWithCommasNoDecimal(summary.avgOrderValue)}
          prefix="₹"
        />
        <AmountStatItem
          label="Amount Received"
          value={formatNumberWithCommasNoDecimal(summary.paidAmount)}
          prefix="₹"
          colorClass={styles.text_green}
          onEdit={onEditPaid}
        />
        <StatItem
          label="Amount Due"
          value={formatNumberWithCommasNoDecimal(summary.dueAmount)}
          prefix="₹"
          colorClass={styles.text_red}
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

  // New state for balance
  const [customerBalance, setCustomerBalance] = useState(null);
  const [showPaidPopup, setShowPaidPopup] = useState(false);

  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  // Initialize quantities - defined first to avoid circular dependency
  const initializeQuantities = useCallback(() => {
    const initial = {};
    PRODUCT_FIELDS.forEach((p) => (initial[p.name] = ""));
    setQuantities(initial);
  }, []);

  // Fetch customer balance from total_orders
  const fetchCustomerBalance = useCallback(async () => {
    if (!customerId) return;
    try {
      const res = await fetch(`/api/customer/total_orders?customerId=${customerId}`);
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
      if (openActionMenuId && !event.target.closest(`.${styles.actionMenuWrapper}`)) {
        setOpenActionMenuId(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [openActionMenuId]);

  const populateQuantitiesFromOrder = useCallback((order) => {
    const newQuantities = {};
    PRODUCT_FIELDS.forEach((product) => {
      const item = order.items.find((i) => i.product === product.name);
      newQuantities[product.name] = item ? item.quantity.toString() : "";
    });
    setQuantities(newQuantities);
    setOrderForm((prev) => ({
      ...prev,
      gstType: order.gstType || "inclusive",
      affectStockValue: order.affectStockValue !== undefined ? order.affectStockValue : true,
    }));
  }, []);

  const handleQuantityChange = (productName, value) => {
    const sanitized = sanitizeNumericInput(value);
    setQuantities((prev) => ({ ...prev, [productName]: sanitized }));
    if (errors[productName]) setErrors((prev) => ({ ...prev, [productName]: null }));
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
    if (customerBalance) {
      return {
        orderCount: customerBalance.totalOrders || 0,
        totalAmount: customerBalance.totalAmount || 0,
        paidAmount: customerBalance.paidAmount || 0,
        dueAmount: customerBalance.dueAmount || 0,
        avgOrderValue: customerBalance.totalOrders
          ? customerBalance.totalAmount / customerBalance.totalOrders
          : 0,
      };
    }
    // Fallback to order-based summary if balance not loaded
    if (!filteredOrders.length)
      return { orderCount: 0, totalAmount: 0, paidAmount: 0, dueAmount: 0, avgOrderValue: 0 };
    const orderCount = filteredOrders.length;
    const totalAmount = filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const paidAmount = filteredOrders.reduce(
      (sum, o) => sum + (o.paymentStatus === "Paid" ? o.totalAmount : 0),
      0
    );
    const dueAmount = filteredOrders.reduce(
      (sum, o) => sum + (o.paymentStatus === "Not Paid" ? o.totalAmount : 0),
      0
    );
    return {
      orderCount,
      totalAmount,
      paidAmount,
      dueAmount,
      avgOrderValue: orderCount ? totalAmount / orderCount : 0,
    };
  }, [filteredOrders, customerBalance]);

  const handlePaidSubmit = async (newPaidAmount) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/customer/total_orders?customerId=${customerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAmount: newPaidAmount }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update balance");
      }
      toast.success("Balance updated");
      fetchCustomerBalance(); 
      setShowPaidPopup(false);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ... other handlers (filter, export, validate, submit, delete, edit) remain the same ...

  // We'll include them unchanged for completeness
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

  const handleSelectAll = (e) => {
    setCheckedIds(e.target.checked ? filteredOrders.map((o) => o._id) : []);
  };

  const handleCheck = (orderId) => {
    setCheckedIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const handleBulkUpdateStatus = async (status) => {
    if (!checkedIds.length) return;
    if (!window.confirm(`Mark ${checkedIds.length} order(s) as ${status}?`)) return;
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
      if (!res.ok) throw new Error("Bulk update failed");
      toast.success(`Marked ${checkedIds.length} order(s) as ${status}`);
      setCheckedIds([]);
      await fetchAllData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
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
    if (!hasQuantity) newErrors.general = "At least one product must have a positive quantity";
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
      const res = await fetch(`/api/customer/order?id=${id}`, { method: "DELETE" });
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
    setCheckedIds([]);
    setEditingId(order);
    setOrderForm({
      date: order.date.split("T")[0],
      paymentStatus: order.paymentStatus || "Not Paid",
      comment: order.comment || "",
      gstType: order.gstType || "inclusive",
      affectStockValue: order.affectStockValue !== undefined ? order.affectStockValue : true,
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

  const isSelectAllChecked =
    filteredOrders.length > 0 && checkedIds.length === filteredOrders.length;

  if (!data.customer && !loading) {
    return (
      <div className={styles.error_state}>
        <h2>Customer Not Found</h2>
        <button onClick={() => router.push("/customer")} className={styles.error_state_primary_btn}>
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
              <span className={getCustomerTypeClass(data.customer?.customerType)}>
                {data.customer?.customerType}
              </span>
              {data.customer?.customerGST && (
                <span className={styles.gst_tag}>GST: {data.customer.customerGST}</span>
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
                onChange={(e) => handleQuantityChange(product.name, e.target.value)}
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

          {errors.general && <div className={styles.error_text}>{errors.general}</div>}

          <div className={styles.form_actions}>
            <button type="submit" disabled={submitting} className={styles.primary_btn}>
              {submitting ? "Processing..." : editingId._id ? "Update Order" : "Create Order"}
            </button>
            {editingId._id && (
              <button type="button" onClick={resetForm} className={styles.secondary_btn}>
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Filter Section */}
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
              <button type="button" onClick={resetFilterForm} className={styles.btn_secondary}>
                Reset
              </button>
              <button type="button" onClick={clearFilters} className={styles.btn_secondary_2}>
                Clear
              </button>
              <button type="button" onClick={todayFilter} className={styles.btn_primary}>
                Today
              </button>
            </div>
          </div>
        </div>
      )}

      {summary.orderCount > 0 && (
        <SummaryStats
          summary={summary}
          filters={filters}
          onEditPaid={() => setShowPaidPopup(true)}
        />
      )}

      {/* Export & Bulk Actions */}
      {filteredOrders.length > 0 && (
        <div className={styles.export_section}>
          <div className={styles.entry_count}>
            {filteredOrders.length} order(s) found
          </div>
          <div className={styles.export_buttons}>
            <button onClick={() => handleExport("pdf", filteredOrders)} className={styles.export_btn}>
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
                  order.items.forEach((item) => (quantityMap[item.product] = item.quantity));
                  return (
                    <tr key={order._id} className={editingId._id === order._id ? styles.active_row : ""}>
                      <td className={styles.date_cell}>{formatDate(order.date)}</td>
                      {PRODUCT_FIELDS.map((p) => (
                        <td key={p.name} className={styles.quantity_cell}>
                          {quantityMap[p.name] || "-"}
                        </td>
                      ))}
                      <td className={styles.total_cell}>₹{formatNumberWithCommasNoDecimal(order.totalAmount)}</td>
                      <td className={styles.comment_cell}>
                        {order.comment ? (
                          <span className={styles.comment} data-text={order.comment}>
                            i
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className={styles.invoice_cell}>
                        <button
                          onClick={() => handleExport("pdf", [order], formatDateForDisplay(order.date))}
                          className={styles.export_btn_table}
                          disabled={!filteredOrders.length}
                        >
                          <Image alt="Download" src="/invoice-download.png" width={20} height={20} />
                        </button>
                      </td>
                      {isAdmin && (
                        <td className={styles.actions_cell}>
                          <div className={styles.actionMenuWrapper}>
                            <button
                              className={styles.actionMenuButton}
                              onClick={() =>
                                setOpenActionMenuId(openActionMenuId === order._id ? null : order._id)
                              }
                              disabled={loading || deleteLoading === order._id || !!editingId._id}
                            >
                              ⋮
                            </button>
                            {openActionMenuId === order._id && (
                              <div className={styles.actionMenuPopup}>
                                <button
                                  onClick={() => handleEdit(order)}
                                  className={styles.actionEditButton}
                                  disabled={loading || deleteLoading === order._id}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(order._id)}
                                  className={styles.actionDeleteButton}
                                  disabled={loading || deleteLoading === order._id}
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
      <AmountReceivedPopup
        isOpen={showPaidPopup}
        currentValue={customerBalance?.paidAmount?.toString() || "0"}
        onClose={() => setShowPaidPopup(false)}
        onSubmit={handlePaidSubmit}
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