"use client";
import AdminSummary from "@/components/AdminSummary";
import DataSkeleton from "@/components/DataSkeleton";
import { formatDateForDisplay, getIndiaTimePeriod as getCurrentTimePeriod } from "@/lib/india-date.mjs";

import { statNumberTone } from "@/lib/stat-number-tone";
import RowActionPopup from "@/components/RowActionPopup";
import { formatStat } from "@/utils/formatNumberWithComma";
import StatTrendBackground from "@/components/StatTrendBackground";
import trendStyles from "@/css/stat-trend.module.css";
import { procurementCardTrends } from "@/lib/history-card-trends";
import CategoryBadge from "@/components/CategoryBadge";

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
import { getCurrentMonthStartDate, getTodayDate } from "@/utils/dateUtils";
import { exportToCSV, exportToPDF } from "@/utils/exportUtils";
import { getProcurementSummary } from "@/utils/procurementSummary";

// ========== CONSTANTS & UTILITIES ==========

const LoadingSpinner = () => <DataSkeleton label="Loading procurement records..." />;

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
  startDate: getCurrentMonthStartDate(),
  endDate: getTodayDate(),
};

const InputGroup = ({ label, error, required, readOnly, ...props }) => (
  <div className={styles.input_group}>
    <label
      htmlFor={`procurement-${props.name}`}
      className={required ? styles.required_label : ""}
    >
      {label}
      {required && (
        <span aria-hidden="true" className={styles.required_asterisk}>
          *
        </span>
      )}
    </label>
    <input
      className={`${styles.input} ${error ? styles.input_error : ""} ${
        readOnly ? styles.read_only_input : ""
      }`}
      autoComplete="off"
      id={`procurement-${props.name}`}
      aria-label={label}
      aria-required={Boolean(required)}
      aria-invalid={Boolean(error)}
      readOnly={readOnly}
      {...props}
    />
    {error && <span className={styles.error_text}>{error}</span>}
  </div>
);

const TimePeriodSelect = ({ value, onChange, error }) => (
  <div className={styles.input_group}>
    <label htmlFor="procurement-time" className={styles.required_label}>
      Time Period
      <span aria-hidden="true" className={styles.required_asterisk}>
        *
      </span>
    </label>
    <select
      name="time"
      id="procurement-time"
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

const StatItem = ({ label, value, unit, prefix = "", trend, tone = "milk" }) => (
  <div className={`${styles.stat_item} ${trendStyles.card}`}>
    <StatTrendBackground points={trend} tone={tone} />

    <span className={styles.stat_label}>{label}</span>
    <span data-stat-tone={statNumberTone(label, value)} className={styles.stat_value}>
      {prefix}
      {value}
      <span className={styles.stat_unit}>{unit}</span>
    </span>
  </div>
);

const SummaryStats = ({ summary, filters, trends }) => (
  <AdminSummary><div className={styles.summary_box}>
    <h3>
      Summary{" "}
      <span className={styles.date_range_badge}>
        {getDateRangeLabel(filters.startDate, filters.endDate)}
      </span>
    </h3>
    <div className={styles.stats_grid}>
      <StatItem
        label="Milk / day" trend={trends.milk}
        value={formatNumberWithCommas(summary.avgMilkDaily, 2)}
        unit="L/day"
      />
      <StatItem
        label="Fat / SNF" trend={trends.quality}
        value={`${formatNumberWithCommas(summary.avgFat, 1)} / ${formatNumberWithCommas(summary.avgSnf, 1)}`}
        unit="%"
      />
      <StatItem
        label="Value / day" trend={trends.amount} tone="amount"
        value={formatStat(summary.avgRateDaily)}
        prefix="₹"
      />
      <StatItem label="Avg Rate" trend={trends.rate} tone="amount" value={formatNumberWithCommas(summary.avgRate, 2)} unit="/L" prefix="₹" />
      <StatItem
        label="Milk" trend={trends.milk}
        value={formatNumberWithCommas(summary.milk, 2)}
        unit="L"


      />
      <StatItem
        label="Value" trend={trends.amount} tone="amount"
        value={formatStat(summary.amount)}
        unit=""
        prefix="₹"


      />
    </div>
  </div></AdminSummary>
);

// ========== HELPER FUNCTIONS ==========
const getDateRangeLabel = (startDate, endDate) => {
  if (startDate && endDate) {
    return startDate === endDate
      ? formatDateForDisplay(startDate)
      : `${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`;
  }
  if (startDate)
    return `From ${formatDateForDisplay(startDate)}`;
  if (endDate) return `Till ${formatDateForDisplay(endDate)}`;
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

  // NEW: head supplier entries
  const [headData, setHeadData] = useState(null);
  const [headLoading, setHeadLoading] = useState(false);

  // ---- Effective TSR (subtract cut % for child suppliers) ----
  const effectiveTSRate = useMemo(() => {
    const s = data.supplier;
    if (!s) return 0;
    if (s.supplierCustomRate) return 0;
    const base = Number(s.supplierTSRate) || 0;
    const cut =
      s.isChildSupplier && s.cutPercentage ? Number(s.cutPercentage) : 0;
    return cut > 0 ? base - cut : base;
  }, [data.supplier]);

  const hasCut =
    !!data.supplier?.isChildSupplier &&
    !data.supplier?.supplierCustomRate &&
    Number(data.supplier?.cutPercentage) > 0;

  const calculateTotals = useCallback(
    (quantity, fat, snf, effectiveRate, customRate) => {
      const q = parseFloat(quantity) || 0;
      const f = parseFloat(fat) || 0;
      const s = parseFloat(snf) || 0;
      const tsRate = parseFloat(effectiveRate) || 0;
      const custom = parseFloat(customRate) || 0;

      let calculatedRate = 0;
      let calculatedTotal = 0;

      if (f > 0 && s > 0 && q > 0) {
        const totalSolids = f + s;

        if (editingId && editingId.customRate) {
          calculatedRate = editingId.rate;
          calculatedTotal = calculatedRate * q;
        } else if (custom) {
          calculatedRate = custom;
          calculatedTotal = custom * q;
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

  // ---- Fetch head entries ----
  const fetchHeadEntries = useCallback(async () => {
    if (!supplierId) return;
    setHeadLoading(true);
    try {
      const query = new URLSearchParams({ headSupplierId: supplierId });
      if (filters.startDate) query.set("startDate", filters.startDate);
      if (filters.endDate) query.set("endDate", filters.endDate);
      const res = await fetch(`/api/supplier/head-entries?${query}`);
      if (!res.ok) {
        throw new Error("Failed to load head entries");
      }
      const headRes = await res.json();
      setHeadData(headRes);
    } catch (error) {
      console.error("Head entries load error:", error);
      toast.error(error.message || "Failed to load head entries");
      setHeadData(null);
    } finally {
      setHeadLoading(false);
    }
  }, [supplierId, filters.startDate, filters.endDate]);

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

      if (!supplierData?.isHeadSupplier) {
        setHeadData(null);
      }
    } catch (error) {
      console.error("Load error:", error);
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    if (data.supplier?.isHeadSupplier) fetchHeadEntries();
  }, [data.supplier, fetchHeadEntries]);

  useEffect(() => {
    if (!supplierId) {
      toast.error("No supplier ID provided");
      setLoading(false);
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
        editingId._id
          ? Number(
              editingId.supplierTSRate ??
                Number(editingId.parentTsr) -
                  Number(editingId.cutPercentage || 0),
            )
          : effectiveTSRate,
        editingId._id
          ? editingId.customRate
            ? editingId.rate
            : undefined
          : data.supplier?.supplierCustomRate,
      );
    }
    return { rate: "", totalAmount: "" };
  }, [
    formData.milkQuantity,
    formData.fatPercentage,
    formData.snfPercentage,
    effectiveTSRate,
    editingId,
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
      resetForm(formData.date, formData.time);
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
      comment: item.comment || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = (Pdate, timePeriod = getCurrentTimePeriod()) => {
    setFormData({
      ...initialForm,
      time: timePeriod,
      ...(Pdate && { date: Pdate }),
    });
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

  const cardTrends = useMemo(() => procurementCardTrends(filteredProcurements), [filteredProcurements]);
  const summary = useMemo(
    () => getProcurementSummary(filteredProcurements),
    [filteredProcurements],
  );


  const handleExport = (format) => {
    if (!filteredProcurements.length) {
      toast.error("No data to export");
      return;
    }
    const dateRange = {
      start:
        formatDateForDisplay(filteredProcurements.at(-1).date) || "----",
      end:
        formatDateForDisplay(filteredProcurements[0].date) || "----",
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
          <button data-button="secondary"
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
            <h1>{data.supplier?.supplierName}</h1>

            <div className={styles.supplier_info}>
              <CategoryBadge kind="supplier" value={data.supplier?.supplierType} />

              {data.supplier?.supplierCustomRate ? (
                <CategoryBadge kind="rate" value={`Rate: ₹${formatNumberWithCommas(data.supplier.supplierCustomRate, 2)}`} />
              ) : (
                <CategoryBadge kind="rate" value={`TSR: ${effectiveTSRate.toFixed(0)}`} />
              )}

              {data.supplier?.isHeadSupplier && (
                <CategoryBadge kind="supplierRole" value="Head supplier" />
              )}
              {data.supplier?.isChildSupplier && !data.supplier?.isHeadSupplier && (
                <CategoryBadge kind="supplierRole" value="Child supplier" />
              )}
            </div>
            {data.supplier?.isChildSupplier && !data.supplier?.isHeadSupplier && (
              <p className={styles.supplier_relationship}>
                <span>Linked to <strong>{data.supplier.headSupplierName || "Head supplier"}</strong></span>
                <span>Cut TSR: <strong>{Number(data.supplier.cutPercentage || 0)}</strong></span>
                {hasCut && <span>Base TSR: <strong>{Number(data.supplier.supplierTSRate || 0)}</strong></span>}
              </p>
            )}
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
              step="0.01"
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
              step="0.1"
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
              step="0.1"
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
                  : hasCut
                    ? `Based on reduced TSR (${effectiveTSRate.toFixed(0)})`
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

          {hasCut && currentPricing.totalAmount && (
            <div className={styles.cut_info_banner}>
              <span className={styles.cut_info_icon}>ℹ️</span>
              <span>
                TSR includes a cut of{" "}
                {parseFloat(data.supplier.cutPercentage).toFixed(1)} for{" "}
                <strong>
                  {data.supplier.headSupplierName || "the head supplier"}
                </strong>
                .
              </span>
            </div>
          )}

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
            {editingId._id && (
              <button data-button="secondary"
                type="button"
                disabled={submitting}
                className={styles.secondary_btn}
                onClick={() => resetForm()}
              >
                Cancel edit
              </button>
            )}
            <button data-button="primary"
              type="submit"
              disabled={submitting || loading || !data.supplier}
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
        <AdminSummary><form data-filter="card" className={styles.filter_form}>
          <div data-filter="title" className={styles.filter_header}>
            <h2>Filter by Date Range</h2>
          </div>
          <div data-filter="content" className={styles.filter_row}>
            <div data-filter="section" className={styles.date_filter_section}>
              <div data-filter="grid" className={styles.date_input_group}>
                <div data-filter="field" className={styles.date_field}>
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
                <div data-filter="field" className={styles.date_field}>
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
            <div data-filter="actions" className={styles.filter_actions}>
              <button data-button="secondary"
                type="button"
                onClick={resetFilterForm}
                className={`${styles.btn} ${styles.btn_reset}`}
              >
                Reset
              </button>
              <button data-button="secondary"
                type="button"
                onClick={clearFilters}
                className={`${styles.btn} ${styles.btn_clear}`}
                disabled={!filters.endDate}
              >
                Clear
              </button>
              <button data-button="secondary"
                type="button"
                onClick={loadTodayData}
                className={`${styles.btn} ${styles.btn_today}`}
              >
                Today
              </button>
            </div>
          </div>
        </form></AdminSummary>
      )}

      {/* SUMMARY SECTION */}
      {summary.count > 0 && (
        <SummaryStats summary={summary} filters={filters} trends={cardTrends} />
      )}

      {/* EXPORT SECTION */}

      {summary.count > 0 && (
        <AdminSummary><div className={styles.export_section}>
          <span className={styles.entry_count}>
            {summary.count} record{summary.count !== 1 ? "s" : ""} found
          </span>
          <div className={styles.export_buttons}>
            <button data-button="secondary"
              onClick={() => handleExport("csv")}
              className={styles.export_btn}
              disabled={!filteredProcurements.length}
              aria-label="Export data as CSV"
            >
              Export as CSV
            </button>
            <button data-button="secondary"
              onClick={() => handleExport("pdf")}
              className={styles.export_btn}
              disabled={!filteredProcurements.length}
              aria-label="Export data as PDF"
            >
              Export as PDF
            </button>
          </div>
        </div></AdminSummary>
      )}

      {/* BULK ACTIONS BANNER */}
      {checkedIds.length > 0 && (
        <div className={styles.bulk_actions_banner}>
          <span className={styles.bulk_actions_text}>
            {checkedIds.length} record(s) selected
          </span>
          <div className={styles.bulk_buttons}>
            <button data-button="primary"
              onClick={() => handleBulkUpdateStatus("Paid")}
              disabled={submitting}
              className={styles.primary_btn}
            >
              {submitting ? "Processing..." : "Mark as Paid"}
            </button>
            <button data-button="secondary"
              onClick={() => handleBulkUpdateStatus("Not Paid")}
              disabled={submitting}
              className={styles.secondary_btn}
            >
              {submitting ? "Processing..." : "Mark as Unpaid"}
            </button>
            <AdminSummary><button data-button="secondary"
              onClick={() => setCheckedIds([])}
              disabled={submitting}
              className={styles.clear_filter_link}
            >
              Cancel
            </button></AdminSummary>
          </div>
        </div>
      )}

      {/* ==================== HEAD SUPPLIER EARNINGS ==================== */}
      {data.supplier?.isHeadSupplier && (
        <div className={styles.head_earnings_section}>
          <div className={styles.head_earnings_header}>
            <div>
              <h2>Head Supplier Earnings</h2>
              <span className={styles.head_earnings_subtitle}>
                TSR cuts received from child suppliers
              </span>
            </div>
            <button data-button="secondary"
              type="button"
              onClick={fetchHeadEntries}
              className={styles.refresh_btn}
              disabled={headLoading}
              title="Refresh earnings"
            >
              {headLoading ? "..." : "↻ Refresh"}
            </button>
          </div>

          {headData?.reviewCount > 0 && (
            <p className={styles.cut_info_banner} role="status">
              {headData.reviewCount} recovered commission
              {headData.reviewCount === 1 ? " needs" : "s need"} payment review.
              Confirm their payment status before treating the outstanding total
              as final.
            </p>
          )}

          {headLoading && !headData ? (
            <DataSkeleton label="Loading earnings..." />
          ) : !headData || headData.entries.length === 0 ? (
            <div className={styles.empty_state}>
              <span className={styles.empty_icon}>📭</span>
              <p>
                No cuts received yet. Child procurements will appear here
                automatically.
              </p>
            </div>
          ) : (
            <>
              {/* Totals cards */}
              <div className={styles.head_totals_grid}>
                <div className={styles.head_total_card}>
                  <span className={styles.head_total_label}>Entries</span>
                  <span className={styles.head_total_value}>
                    {headData.totals.entries}
                  </span>
                </div>
                <div className={styles.head_total_card}>
                  <span className={styles.head_total_label}>Milk</span>
                  <span className={styles.head_total_value}>
                    {formatNumberWithCommas(
                      Number(headData.totals.milk || 0), 2,
                    )}
                    <span className={styles.head_total_unit}>L</span>
                  </span>
                </div>
                <div className={styles.head_total_card}>
                  <span className={styles.head_total_label}>Earned</span>
                  <span className={styles.head_total_value}>
                    ₹
                    {formatStat(
                      headData.totals.earned || 0,
                    )}
                  </span>
                </div>
                <div className={styles.head_total_card}>
                  <span className={styles.head_total_label}>Paid</span>
                  <span
                    className={`${styles.head_total_value} ${styles.text_paid}`}
                  >
                    ₹
                    {formatStat(headData.totals.paid || 0)}
                  </span>
                </div>
                <div className={styles.head_total_card}>
                  <span className={styles.head_total_label}>Due</span>
                  <span
                    className={`${styles.head_total_value} ${styles.text_due}`}
                  >
                    ₹{formatStat(headData.totals.due || 0)}
                  </span>
                </div>
              </div>

              {/* Entries table */}
              <div className={styles.table_container}>
                <table
                  className={styles.table}
                  aria-label="Head supplier earnings"
                >
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">AM/PM</th>
                      <th scope="col">From Child</th>
                      <th scope="col">Milk (L)</th>
                      <th scope="col">Fat %</th>
                      <th scope="col">SNF %</th>
                      <th scope="col">Parent TSR</th>
                      <th scope="col">Cut</th>
                      <th scope="col">Child TSR</th>
                      <th scope="col">Rate/L (₹)</th>
                      <th scope="col">Earned (₹)</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headData.entries.map((row, idx) => (
                      <tr key={`${row.procurementId}-${idx}`}>
                        <td className={styles.date_cell}>
                          {formatDateForDisplay(row.date)}
                        </td>
                        <td className={styles.time_cell}>
                          <span
                            className={
                              row.time === "AM"
                                ? styles.am_badge
                                : styles.pm_badge
                            }
                          >
                            {row.time}
                          </span>
                        </td>
                        <td className={styles.child_name_cell}>
                          {row.childSupplierName || "-"}
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
                        <td className={styles.rate_cell}>{row.parentTsr}</td>
                        <td className={styles.cut_cell}>
                          −{row.cutPercentage}
                        </td>
                        <td className={styles.rate_cell}>{row.childTsr}</td>
                        <td className={styles.rate_cell}>
                          ₹{parseFloat(row.ratePerLiter).toFixed(2)}
                        </td>
                        <td className={styles.total_cell}>
                          ₹{formatNumberWithCommasNoDecimal(row.totalAmount)}
                        </td>
                        <td className={styles.payment_cell}>
                          {row.paymentReviewRequired ? (
                            <span className={styles.status_due}>
                              Review payment
                            </span>
                          ) : row.paymentStatus === "Paid" ? (
                            <span className={styles.status_paid}>Paid</span>
                          ) : (
                            <span className={styles.status_due}>Due</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
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
                <button data-button="secondary"
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
                <AdminSummary><button data-button="secondary"
                  onClick={clearFilters}
                  className={styles.clear_filter_link}
                >
                  clear filters to see all {data.allProcurements.length} records
                </button></AdminSummary>
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
                          <span className={styles.date_text}>
                            {formatDateForDisplay(row.date)}
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
                          <button data-button="icon"
                            className={styles.actionMenuButton}
                            onClick={() =>
                              setOpenActionMenuId(
                                openActionMenuId === row._id ? null : row._id,
                              )
                            }
                            disabled={submitting || !!editingId._id}
                            title="Actions"
                            aria-label={`Actions for ${row.date.split("T")[0]} ${row.time || "AM"} record`}
                            aria-expanded={openActionMenuId === row._id}
                          >
                            ⋮
                          </button>
                          {openActionMenuId === row._id && (
                            <RowActionPopup className={styles.actionMenuPopup} onClose={() => setOpenActionMenuId(null)}>
                              <button data-button="menu"
                                onClick={() => handleEdit(row)}
                                className={styles.actionEditButton}
                                disabled={submitting}
                              >
                                {editingId._id === row._id ? "Cancel" : "Edit"}
                              </button>
                              <button data-button="menu-danger"
                                onClick={() => handleDelete(row._id)}
                                className={styles.actionDeleteButton}
                                disabled={submitting}
                              >
                                Delete
                              </button>
                            </RowActionPopup>
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
          <DataSkeleton label="Loading procurement page..." />
        </div>
      }
    >
      <ProcurementContent />
    </Suspense>
  );
}
