"use client";

import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/procurement.module.css";
import {
  formatNumberWithCommas,
  formatNumberWithCommasNoDecimal,
} from "@/utils/formatNumberWithComma";
import { getPreviousMonthDate, getTodayDate } from "@/utils/dateUtils";
import { exportToCSV, exportToPDF } from "@/utils/exportUtils";

// ========== CONSTANTS & UTILITIES ==========

const LoadingSpinner = () => (
  <div className={styles.page_container}>
    <div className={styles.loading_container}>
      <div className={styles.spinner}></div>
      <span className={styles.loading_text}>
        Loading procurement records...
      </span>
    </div>
  </div>
);

const getCurrentTimePeriod = () => {
  const hour = new Date().getHours();
  return hour >= 12 ? "PM" : "AM";
};

const initialForm = {
  date: getTodayDate(),
  time: getCurrentTimePeriod(),
  milkQuantity: "",
  fatPercentage: "",
  snfPercentage: "",
  paymentStatus: "Not Paid",
  comment: "",
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
      <StatItem label="Milk" value={summary.milk.toFixed(2)} unit="L" />
      <StatItem
        label="Daily Avg"
        value={
          summary.daysWithData
            ? (summary.milk / summary.daysWithData).toFixed(2)
            : "0.00"
        }
        unit="L/day"
      />
      <StatItem label="Avg Fat" value={summary.avgFat} unit="%" />
      <StatItem label="Avg SNF" value={summary.avgSnf} unit="%" />
      <StatItem label="Avg Rate" value={summary.avgRate} unit="/L" prefix="₹" />
      <StatItem
        label="Total Amount"
        value={formatNumberWithCommasNoDecimal(summary.amount)}
        unit=""
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

const sanitizeNumericInput = (value, fieldName) => {
  let sanitized = value.replace(/[^\d.]/g, "");
  const parts = sanitized.split(".");

  if (parts.length > 2) {
    sanitized = parts[0] + "." + parts.slice(1).join("");
  }

  if (parts[1]) {
    const maxDecimals = fieldName === "milkQuantity" ? 2 : 1;
    sanitized = parts[0] + "." + parts[1].substring(0, maxDecimals);
  }

  return sanitized;
};

const getSupplierTypeClass = (supplierType) => {
  const typeClassMap = {
    Society: styles.type_society_badge,
    Milkman: styles.type_milkman_badge,
    Farmer: styles.type_farmer_badge,
    Other: styles.type_other_badge,
  };
  return typeClassMap[supplierType] || styles.default_supplier;
};

// ========== MAIN COMPONENT ==========
function ProcurementContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supplierId = searchParams.get("supplierId");
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [loading, setLoading] = useState(true);
  const [checkedIds, setCheckedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState({ supplier: null, allProcurements: [] });
  const [editingId, setEditingId] = useState({});
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState(initialForm);
  const [openActionMenuId, setOpenActionMenuId] = useState(null);

  const calculateTotals = useCallback(
    (quantity, fat, snf, supplierRate, supplierCustomRate) => {
      const q = parseFloat(quantity) || 0;
      const f = parseFloat(fat) || 0;
      const s = parseFloat(snf) || 0;
      const tsRate = parseFloat(supplierRate) || 0;
      const customRate = parseFloat(supplierCustomRate) || 0;

      let calculatedRate = 0;
      let calculatedTotal = 0;

      if (f > 0 && s > 0 && q > 0) {
        const totalSolids = f + s;

        if (editingId && editingId.customRate) {
          calculatedRate = editingId.rate;
          calculatedTotal = calculatedRate * q;
        } else if (customRate) {
          calculatedRate = customRate;
          calculatedTotal = customRate * q;
        } else {
          calculatedRate = (totalSolids * tsRate) / 100;
          calculatedTotal = calculatedRate * q;
        }

        return {
          rate: calculatedRate.toFixed(2),
          totalAmount: calculatedTotal.toFixed(2),
        };
      }

      return { rate: "", totalAmount: "" };
    },
    [editingId],
  );

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

  const fetchAllData = useCallback(async () => {
    if (!supplierId) return;

    try {
      setLoading(true);
      const [suppRes, procRes] = await Promise.all([
        fetch(`/api/supplier?supplierId=${supplierId}`),
        fetch(`/api/supplier/procurement?supplierId=${supplierId}`),
      ]);

      if (!suppRes.ok) throw new Error("Failed to load supplier");
      if (!procRes.ok) throw new Error("Failed to load procurements");

      const [supplierData, procurementData] = await Promise.all([
        suppRes.json(),
        procRes.json(),
      ]);

      setData({
        supplier: supplierData,
        allProcurements: Array.isArray(procurementData) ? procurementData : [],
      });
    } catch (error) {
      console.error("Load error:", error);
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    if (!supplierId) {
      toast.error("No supplier ID provided");
      return;
    }
    fetchAllData();
  }, [supplierId, router, fetchAllData]);

  const currentPricing = useMemo(() => {
    if (
      formData.milkQuantity ||
      formData.fatPercentage ||
      formData.snfPercentage
    ) {
      return calculateTotals(
        formData.milkQuantity,
        formData.fatPercentage,
        formData.snfPercentage,
        data.supplier?.supplierTSRate,
        data.supplier?.supplierCustomRate,
      );
    }
    return { rate: "", totalAmount: "" };
  }, [
    formData.milkQuantity,
    formData.fatPercentage,
    formData.snfPercentage,
    data.supplier?.supplierTSRate,
    data.supplier?.supplierCustomRate,
    calculateTotals,
  ]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (["milkQuantity", "fatPercentage", "snfPercentage"].includes(name)) {
      if (parseFloat(value) < 0) return;
    }

    let sanitizedValue = value;
    if (["milkQuantity", "fatPercentage", "snfPercentage"].includes(name)) {
      sanitizedValue = sanitizeNumericInput(value, name);
    }

    setFormData((prev) => ({ ...prev, [name]: sanitizedValue }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleCheck = (id) => {
    setCheckedIds((prev) =>
      prev.includes(id)
        ? prev.filter((itemId) => itemId !== id)
        : [...prev, id],
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = decoratedTableData.map((row) => row._id);
      setCheckedIds(allIds);
    } else {
      setCheckedIds([]);
    }
  };

  // Bulk update function that accepts a status
  const handleBulkUpdateStatus = async (status) => {
    if (checkedIds.length === 0) {
      toast.warn("No records selected");
      return;
    }

    if (!window.confirm(`Mark ${checkedIds.length} records as ${status}?`))
      return;

    setSubmitting(true);
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

      toast.success(
        `Successfully marked ${checkedIds.length} records as ${status}`,
      );
      setCheckedIds([]);
      await fetchAllData();
    } catch (error) {
      console.error("Bulk action error:", error);
      toast.error(error.message || "Failed to process bulk payment");
    } finally {
      setSubmitting(false);
    }
  };

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

    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const resetFilterForm = () => {
    if (!confirmClearChecked()) return;
    setCheckedIds([]);
    setFilters(initialFilters);
    toast.info("Date filters reset to default.");
  };

  const clearFilters = () => {
    if (!confirmClearChecked()) return;
    setCheckedIds([]);
    setFilters({ startDate: "", endDate: "" });
    toast.info("Date filters cleared.");
  };

  const loadTodayData = () => {
    if (!confirmClearChecked()) return;
    setCheckedIds([]);
    setFilters({ startDate: getTodayDate(), endDate: getTodayDate() });
    toast.info("Loaded today's records.");
  };
  // ---------------------------------------

  const validateForm = () => {
    const newErrors = {};
    if (!formData.date) newErrors.date = "Date is required";
    if (!formData.time) newErrors.time = "Time period is required";
    else if (!["AM", "PM"].includes(formData.time))
      newErrors.time = "Invalid time period";

    const milkQty = parseFloat(formData.milkQuantity);
    if (!formData.milkQuantity) newErrors.milkQuantity = "Quantity is required";
    else if (milkQty <= 0)
      newErrors.milkQuantity = "Quantity must be greater than 0";
    else if (milkQty > 10000)
      newErrors.milkQuantity = "Quantity seems too high";

    const fatPct = parseFloat(formData.fatPercentage);
    if (!formData.fatPercentage) newErrors.fatPercentage = "Fat % is required";
    else if (fatPct <= 0)
      newErrors.fatPercentage = "Fat % must be greater than 0";
    else if (fatPct > 9) newErrors.fatPercentage = "Fat % seems too high";

    const snfPct = parseFloat(formData.snfPercentage);
    if (!formData.snfPercentage) newErrors.snfPercentage = "SNF % is required";
    else if (snfPct <= 0)
      newErrors.snfPercentage = "SNF % must be greater than 0";
    else if (snfPct > 12) newErrors.snfPercentage = "SNF % seems too high";

    if (!currentPricing.rate || parseFloat(currentPricing.rate) <= 0) {
      newErrors.rate = "Invalid calculation. Check Fat/SNF values";
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

    setSubmitting(true);
    try {
      const method = editingId._id ? "PUT" : "POST";
      const url = editingId._id
        ? `/api/supplier/procurement?id=${editingId._id}`
        : "/api/supplier/procurement";

      const isCustomRate = !!data.supplier?.supplierCustomRate;

      const payload = {
        supplierId,
        supplierName: data.supplier.supplierName,
        supplierType: data.supplier.supplierType,
        supplierTSRate: isCustomRate ? "N/A" : data.supplier.supplierTSRate,
        date: formData.date,
        time: formData.time,
        milkQuantity: parseFloat(formData.milkQuantity),
        fatPercentage: parseFloat(formData.fatPercentage),
        snfPercentage: parseFloat(formData.snfPercentage),
        customRate: isCustomRate,
        rate: parseFloat(currentPricing.rate),
        totalAmount: parseFloat(currentPricing.totalAmount),
        paymentStatus: formData.paymentStatus,
        comment: formData.comment?.trim() || "",
        actionDoneBy: session?.user?.email,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Submission failed");

      toast.success(
        editingId._id ? "Updated successfully" : "Added successfully",
      );
      await fetchAllData();
      resetForm();
    } catch (error) {
      console.error("Submit error:", error);
      toast.error(error.message || "Failed to save record");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this record? This action cannot be undone.",
      )
    )
      return;

    try {
      const res = await fetch(`/api/supplier/procurement?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Delete failed");
      }
      await fetchAllData();
      toast.success("Deleted successfully");
      if (editingId._id === id) resetForm();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error.message || "Failed to delete record");
    }
  };

  const handleEdit = (item) => {
    if (editingId._id && editingId._id === item._id) {
      resetForm();
      return;
    }
    setCheckedIds([]);
    setEditingId(item);
    setFormData({
      date: item.date.split("T")[0],
      time: item.time || "AM",
      milkQuantity: item.milkQuantity.toString(),
      fatPercentage: item.fatPercentage.toString(),
      snfPercentage: item.snfPercentage.toString(),
      paymentStatus: item.paymentStatus || "Not Paid",
      comment: item.comment || "", // <-- added comment
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setFormData({ ...initialForm, time: getCurrentTimePeriod() });
    setEditingId({});
    setErrors({});
  };

  const filteredProcurements = useMemo(() => {
    if (!data.allProcurements.length) return [];

    const start = filters.startDate;
    const end = filters.endDate;

    return data.allProcurements.filter((record) => {
      const recordDate = record.date.split("T")[0];
      if (start && recordDate < start) return false;
      if (end && recordDate > end) return false;
      return true;
    });
  }, [filters.startDate, filters.endDate, data.allProcurements]);

  const decoratedTableData = useMemo(() => {
    const dateCounts = {};
    return filteredProcurements.map((row) => {
      const dateKey = row.date?.split("T")[0] || "unknown";
      if (!dateCounts[dateKey]) dateCounts[dateKey] = 0;
      dateCounts[dateKey]++;

      return {
        ...row,
        isFirstOfDate: dateCounts[dateKey] === 1,
        occurrenceCount: dateCounts[dateKey],
      };
    });
  }, [filteredProcurements]);

  const summary = useMemo(() => {
    if (!filteredProcurements.length) {
      return {
        milk: 0,
        amount: 0,
        count: 0,
        avgRate: "0.00",
        avgFat: "0.0",
        avgSnf: "0.0",
        daysWithData: 0,
      };
    }

    const uniqueDates = new Set(
      filteredProcurements.map((record) => record.date.split("T")[0]),
    );
    const totals = filteredProcurements.reduce(
      (acc, curr) => ({
        milk: acc.milk + (parseFloat(curr.milkQuantity) || 0),
        amount: acc.amount + (parseFloat(curr.totalAmount) || 0),
        count: acc.count + 1,
      }),
      { milk: 0, amount: 0, count: 0 },
    );

    const avgFat = (
      filteredProcurements.reduce(
        (sum, curr) => sum + parseFloat(curr.fatPercentage),
        0,
      ) / filteredProcurements.length
    ).toFixed(1);
    const avgSnf = (
      filteredProcurements.reduce(
        (sum, curr) => sum + parseFloat(curr.snfPercentage),
        0,
      ) / filteredProcurements.length
    ).toFixed(1);

    return {
      ...totals,
      avgRate: totals.milk ? (totals.amount / totals.milk).toFixed(2) : "0.00",
      avgFat,
      avgSnf,
      daysWithData: uniqueDates.size,
    };
  }, [filteredProcurements]);

  const handleExport = (format) => {
    if (!filteredProcurements.length) {
      toast.error("No data to export");
      return;
    }
    const dateRange = {
      start:
        new Date(filteredProcurements.at(-1).date).toLocaleDateString() ||
        "----",
      end:
        new Date(filteredProcurements[0].date).toLocaleDateString() || "----",
    };
    const supplierName = data.supplier?.supplierName || "Unknown";
    const fileName =
      dateRange.start === dateRange.end
        ? `${supplierName}_${dateRange.start}`
        : `${supplierName}_${dateRange.start}_to_${dateRange.end}`;

    if (format === "csv") {
      exportToCSV(filteredProcurements, data.supplier, dateRange, fileName);
      toast.success("CSV exported successfully");
    } else if (format === "pdf") {
      exportToPDF(filteredProcurements, data.supplier, dateRange, fileName);
      toast.success("PDF exported successfully");
    }
  };

  if (!data.supplier && !loading) {
    return (
      <div className={styles.error_state}>
        <h2>Supplier Not Found</h2>
        <p>
          {
            " The supplier you're looking for doesn't exist or has been removed."
          }
        </p>
        <div className={styles.error_actions}>
          <button
            onClick={() => router.push("/supplier")}
            className={styles.primary_btn}
            aria-label="Go back to suppliers"
          >
            Back to Suppliers
          </button>
        </div>
      </div>
    );
  }

  const isSelectAllChecked =
    decoratedTableData.length > 0 &&
    checkedIds.length === decoratedTableData.length;

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
          <span className={styles.loading_text}> Loading supplier info...</span>
        ) : (
          <div className={styles.header_title}>
            <h1> {data.supplier?.supplierName}</h1>
            <div className={styles.supplier_info}>
              <span
                className={getSupplierTypeClass(data.supplier?.supplierType)}
              >
                {data.supplier?.supplierType}
              </span>
              {data.supplier?.supplierCustomRate ? (
                <span className={styles.ts_rate_tag}>
                  Custom Rate: ₹
                  {parseFloat(data.supplier?.supplierCustomRate || 0).toFixed(
                    0,
                  )}
                </span>
              ) : (
                <span className={styles.ts_rate_tag}>
                  Total Solids Rate:{" "}
                  {parseFloat(data.supplier?.supplierTSRate || 0).toFixed(0)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* FORM SECTION */}
      <div className={styles.form_section}>
        <div className={styles.form_header}>
          <h2>{editingId._id ? "Edit Record" : `Procurement Entry`}</h2>
        </div>

        <form onSubmit={handleSubmit} className={styles.procurement_form}>
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
              value={formData.date}
              onChange={handleInputChange}
              max={getTodayDate()}
              error={errors.date}
              required
            />
            <TimePeriodSelect
              value={formData.time}
              onChange={handleInputChange}
              error={errors.time}
            />
            <InputGroup
              label="Milk Quantity (L)"
              name="milkQuantity"
              type="number"
              inputMode="decimal"
              placeholder="20.5"
              value={formData.milkQuantity}
              onChange={handleInputChange}
              error={errors.milkQuantity}
              required
            />
            <InputGroup
              label="Fat %"
              name="fatPercentage"
              type="number"
              inputMode="decimal"
              placeholder="3.5"
              value={formData.fatPercentage}
              onChange={handleInputChange}
              error={errors.fatPercentage}
              required
            />
            <InputGroup
              label="SNF %"
              name="snfPercentage"
              type="number"
              inputMode="decimal"
              placeholder="8.5"
              value={formData.snfPercentage}
              onChange={handleInputChange}
              error={errors.snfPercentage}
              required
            />

            <InputGroup
              label="Comment"
              name="comment"
              type="text"
              placeholder="Add a comment (optional)"
              value={formData.comment}
              onChange={handleInputChange}
              disabled={submitting}
            />
            <InputGroup
              label="Rate per Liter (₹)"
              name="rate"
              value={
                currentPricing.rate
                  ? formatNumberWithCommas(currentPricing.rate)
                  : ""
              }
              readOnly
              placeholder={
                data.supplier?.supplierCustomRate
                  ? `Custom Rate Rs: ${data.supplier?.supplierCustomRate}`
                  : "Auto-calculated based on 'Total Solids' rate"
              }
              error={errors.rate}
            />
            <InputGroup
              label="Total Amount (₹)"
              name="totalAmount"
              value={
                currentPricing.totalAmount
                  ? formatNumberWithCommas(currentPricing.totalAmount)
                  : ""
              }
              readOnly
              placeholder="Auto-calculated"
            />
          </div>

          {editingId && editingId._id && (
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
                  checked={formData.paymentStatus === "Paid"}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      paymentStatus: e.target.checked ? "Paid" : "Not Paid",
                    }))
                  }
                  title="Toggle payment status"
                />
                {formData.paymentStatus === "Paid" ? (
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
              aria-label={editingId._id ? "Update record" : "Add new record"}
            >
              {submitting ? (
                <>
                  <span className={styles.button_spinner}></span>
                  {editingId._id ? "Updating..." : "Saving..."}
                </>
              ) : editingId._id ? (
                "Update Record"
              ) : (
                "Add Record"
              )}
            </button>
          </div>
        </form>
      </div>

      {data.allProcurements.length > 0 && (
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
                type="button"
                onClick={resetFilterForm}
                className={`${styles.btn} ${styles.btn_reset}`}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className={`${styles.btn} ${styles.btn_clear}`}
                disabled={!filters.endDate}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={loadTodayData}
                className={`${styles.btn} ${styles.btn_today}`}
              >
                Load Today
              </button>
            </div>
          </div>
        </form>
      )}

      {/* SUMMARY SECTION */}
      {summary.count > 0 && (
        <SummaryStats summary={summary} filters={filters} />
      )}

      {/* EXPORT SECTION */}
      {summary.count > 0 && (
        <div className={styles.export_section}>
          <span className={styles.entry_count}>
            {summary.count} record{summary.count !== 1 ? "s" : ""} found
          </span>
          <div className={styles.export_buttons}>
            <button
              onClick={() => handleExport("csv")}
              className={styles.export_btn}
              disabled={!filteredProcurements.length}
              aria-label="Export data as CSV"
            >
              Export as CSV
            </button>
            <button
              onClick={() => handleExport("pdf")}
              className={styles.export_btn}
              disabled={!filteredProcurements.length}
              aria-label="Export data as PDF"
            >
              Export as PDF
            </button>
          </div>
        </div>
      )}

      {/* BULK ACTIONS BANNER - visible to all users */}
      {checkedIds.length > 0 && (
        <div className={styles.bulk_actions_banner}>
          <span className={styles.bulk_actions_text}>
            {checkedIds.length} record(s) selected
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
              onClick={() => setCheckedIds([])}
              disabled={submitting}
              className={styles.clear_filter_link}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* TABLE SECTION */}
      <div className={styles.table_wrapper}>
        {loading ? (
          <LoadingSpinner />
        ) : summary.count === 0 ? (
          <div className={styles.empty_state}>
            {!data.supplier ? (
              <>
                <span className={styles.empty_icon}>⚠️</span>
                <h3>Supplier not found</h3>
                <button
                  onClick={() => router.push("/supplier")}
                  className={styles.secondary_btn}
                >
                  Back to Suppliers
                </button>
              </>
            ) : data.allProcurements.length === 0 ? (
              <>
                <span className={styles.empty_icon}>📊</span>
                <p>No procurement records, start by adding the first record</p>
              </>
            ) : (
              <>
                <span className={styles.empty_icon}>📊</span>
                <p>No procurement records found for the selected date range</p>
                <button
                  onClick={clearFilters}
                  className={styles.clear_filter_link}
                >
                  clear filters to see all {data.allProcurements.length} records
                </button>
              </>
            )}
          </div>
        ) : (
          <div className={styles.table_container}>
            <table className={styles.table} aria-label="Procurement history">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">AM/PM</th>
                  <th scope="col">Milk (L)</th>
                  <th scope="col">Fat %</th>
                  <th scope="col">SNF %</th>
                  <th scope="col">TS Rate</th>
                  <th scope="col">Rate/L (₹)</th>
                  <th scope="col">Total (₹)</th>
                  <th scope="col">Comment</th>
                  <th scope="col">
                    <div className={styles.select_all_wrapper}>
                      <input
                        type="checkbox"
                        className={styles.payment_checkbox}
                        onChange={handleSelectAll}
                        disabled={!!editingId._id}
                        checked={isSelectAllChecked}
                        title="Select All"
                      />{" "}
                      *
                    </div>
                  </th>
                  <th scope="col">Status</th>
                  {isAdmin && <th scope="col">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {decoratedTableData.map((row) => (
                  <tr
                    key={row._id}
                    className={
                      editingId._id === row._id ? styles.active_row : ""
                    }
                  >
                    <td className={styles.date_cell}>
                      {row.isFirstOfDate ? (
                        <div className={styles.continuation_wrapper}>
                          {`(${row.occurrenceCount}) `}
                          <span className={styles.date_text}>
                            {new Date(row.date).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "2-digit",
                            })}
                          </span>
                        </div>
                      ) : (
                        `(${row.occurrenceCount})`
                      )}
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
                    <td className={styles.quantity_cell}>
                      {parseFloat(row.milkQuantity).toFixed(2)}
                    </td>
                    <td className={styles.fat_cell}>
                      {parseFloat(row.fatPercentage).toFixed(1)}
                    </td>
                    <td className={styles.snf_cell}>
                      {parseFloat(row.snfPercentage).toFixed(1)}
                    </td>
                    <td className={styles.rate_cell}>
                      {row.supplierTSRate || "N/A"}
                    </td>
                    <td className={styles.rate_cell}>
                      ₹{parseFloat(row.rate).toFixed(1)}
                    </td>
                    <td className={styles.total_cell}>
                      ₹{formatNumberWithCommasNoDecimal(row.totalAmount)}
                    </td>
                    <td className={styles.comment_cell}>
                      {row.comment ? (
                        <span
                          className={styles.comment}
                          data-text={row.comment}
                          title={row.comment}
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
                        className={styles.payment_checkbox}
                        value={row._id}
                        disabled={!!editingId._id}
                        checked={checkedIds.includes(row._id)}
                        onChange={() => handleCheck(row._id)}
                        title="Select record"
                      />
                    </td>
                    <td className={styles.payment_cell}>
                      <div className={styles.unpaid_wrapper}>
                        {row.paymentStatus === "Paid" ? (
                          <span className={styles.status_paid}>Paid</span>
                        ) : (
                          <span className={styles.status_due}>Due</span>
                        )}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className={styles.actions_cell}>
                        <div className={styles.actionMenuWrapper}>
                          <button
                            className={styles.actionMenuButton}
                            onClick={() =>
                              setOpenActionMenuId(
                                openActionMenuId === row._id ? null : row._id,
                              )
                            }
                            disabled={submitting || !!editingId._id}
                            title="Actions"
                          >
                            ⋮
                          </button>
                          {openActionMenuId === row._id && (
                            <div className={styles.actionMenuPopup}>
                              <button
                                onClick={() => handleEdit(row)}
                                className={styles.actionEditButton}
                                disabled={submitting}
                              >
                                {editingId._id === row._id ? "Cancel" : "Edit"}
                              </button>
                              <button
                                onClick={() => handleDelete(row._id)}
                                className={styles.actionDeleteButton}
                                disabled={submitting}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
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
export default function ProcurementPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.page_container}>
          <div className={styles.loading_container}>
            <div className={styles.spinner}></div>
            <span className={styles.loading_text}>
              Loading procurement page...
            </span>
          </div>
        </div>
      }
    >
      <ProcurementContent />
    </Suspense>
  );
}
