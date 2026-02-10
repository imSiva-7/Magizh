"use client";

import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
      <div className={`${styles.spinner}`}></div>
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
  rate: "",
  totalAmount: "",
};

const initialFilters = {
  startDate: getPreviousMonthDate(),
  endDate: getTodayDate(),
};

// ========== REUSABLE COMPONENTS ==========
const InputGroup = ({ label, error, required, readOnly, ...props }) => (
  <div className={styles.inputGroup}>
    <label className={required ? styles.requiredLabel : ""}>
      {label}
      {required && <span className={styles.requiredAsterisk}>*</span>}
    </label>
    <input
      className={`${styles.input} ${error ? styles.inputError : ""} ${
        readOnly ? styles.readOnlyInput : ""
      }`}
      autoComplete="off"
      readOnly={readOnly}
      {...props}
    />
    {error && <span className={styles.errorText}>{error}</span>}
  </div>
);

const TimePeriodSelect = ({ value, onChange, error }) => (
  <div className={styles.inputGroup}>
    <label className={styles.requiredLabel}>
      Time Period
      <span className={styles.requiredAsterisk}>*</span>
    </label>
    <select
      name="time"
      value={value}
      onChange={onChange}
      className={styles.select}
      aria-label="Select time period"
    >
      <option value="AM">AM (Morning)</option>
      <option value="PM">PM (Evening)</option>
    </select>
    {error && <span className={styles.errorText}>{error}</span>}
  </div>
);

const StatItem = ({ label, value, unit, prefix = "" }) => (
  <div className={styles.statItem}>
    <span className={styles.statLabel}>{label}</span>
    <span className={styles.statValue}>
      {prefix}
      {value}
      <span className={styles.statUnit}>{unit}</span>
    </span>
  </div>
);

const SummaryStats = ({ summary, filters }) => (
  <div className={styles.summaryBox}>
    <h3>
      Summary{" "}
      <span className={styles.dateRange}>
        {getDateRangeLabel(filters.startDate, filters.endDate)}
      </span>
    </h3>
    <div className={styles.statsGrid}>
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
  return typeClassMap[supplierType] || styles.defaultSupplier;
};

// ========== MAIN COMPONENT ==========
function ProcurementContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supplierId = searchParams.get("supplierId");

  // ========== STATE MANAGEMENT ==========
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState({
    supplier: null,
    allProcurements: [],
  });
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState(initialForm);

  // ========== DATA CALCULATIONS ==========
  const calculateTotals = useCallback(
    (quantity, fat, snf, supplierRate, supplierCustomRate) => {
      const q = parseFloat(quantity) || 0;
      const f = parseFloat(fat) || 0;
      const s = parseFloat(snf) || 0;
      const tsRate = parseFloat(supplierRate) || 0;
      let calculatedRate = 0;
      let calculatedTotal = 0;

      if (f > 0 && s > 0 && tsRate > 0 && q > 0) {
        const totalSolids = f + s;

        if (supplierCustomRate) {
          calculatedRate = supplierCustomRate;
          calculatedTotal = supplierCustomRate * q;
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
    [],
  );

  // ========== DATA FETCHING ==========
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

  // ========== EFFECTS ==========
  useEffect(() => {
    if (!supplierId) {
      toast.error("No supplier ID provided");
      router.push("/supplier");
      return;
    }
    fetchAllData();
  }, [supplierId, router, fetchAllData]);

  // Fix: Optimized calculation with useMemo
  const calculatedValues = useMemo(() => {
    const hasValues =
      formData.milkQuantity || formData.fatPercentage || formData.snfPercentage;

    if (!hasValues) {
      return { rate: "", totalAmount: "" };
    }

    return calculateTotals(
      formData.milkQuantity,
      formData.fatPercentage,
      formData.snfPercentage,
      data.supplier?.supplierTSRate,
      data.supplier?.supplierCustomRate,
    );
  }, [
    formData.milkQuantity,
    formData.fatPercentage,
    formData.snfPercentage,
    data.supplier?.supplierTSRate,
    data.supplier?.supplierCustomRate,
    calculateTotals,
  ]);

  // Fix: Only update when calculated values change
  useEffect(() => {
    if (
      calculatedValues.rate !== formData.rate ||
      calculatedValues.totalAmount !== formData.totalAmount
    ) {
      setFormData((prev) => ({
        ...prev,
        rate: calculatedValues.rate,
        totalAmount: calculatedValues.totalAmount,
      }));
    }
  }, [calculatedValues, formData.rate, formData.totalAmount]);

  // ========== FORM HANDLERS ==========
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Validate negative values
    if (["milkQuantity", "fatPercentage", "snfPercentage"].includes(name)) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue < 0) return;
    }

    // Sanitize numeric inputs
    let sanitizedValue = value;
    if (["milkQuantity", "fatPercentage", "snfPercentage"].includes(name)) {
      sanitizedValue = sanitizeNumericInput(value, name);
    }

    setFormData((prev) => ({ ...prev, [name]: sanitizedValue }));

    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const clearFilters = () => {
    setFilters({ startDate: "", endDate: "" });
  };

  const resetFilterForm = () => {
    setFilters(initialFilters);
  };

  // ========== FORM VALIDATION ==========
  const validateForm = () => {
    const newErrors = {};

    // Date validation
    if (!formData.date) {
      newErrors.date = "Date is required";
    } 

    // Time validation
    if (!formData.time) {
      newErrors.time = "Time period is required";
    } else if (!["AM", "PM"].includes(formData.time)) {
      newErrors.time = "Invalid time period";
    }

    // Milk quantity validation
    const milkQty = parseFloat(formData.milkQuantity);
    if (!formData.milkQuantity) {
      newErrors.milkQuantity = "Quantity is required";
    } else if (isNaN(milkQty) || milkQty <= 0) {
      newErrors.milkQuantity = "Quantity must be greater than 0";
    } else if (milkQty > 10000) {
      newErrors.milkQuantity = "Quantity seems too high";
    }

    // Fat percentage validation
    const fatPct = parseFloat(formData.fatPercentage);
    if (!formData.fatPercentage) {
      newErrors.fatPercentage = "Fat % is required";
    } else if (isNaN(fatPct) || fatPct <= 0) {
      newErrors.fatPercentage = "Fat % must be greater than 0";
    } else if (fatPct > 9) {
      newErrors.fatPercentage = "Fat % seems too high";
    }

    // SNF percentage validation
    const snfPct = parseFloat(formData.snfPercentage);
    if (!formData.snfPercentage) {
      newErrors.snfPercentage = "SNF % is required";
    } else if (isNaN(snfPct) || snfPct <= 0) {
      newErrors.snfPercentage = "SNF % must be greater than 0";
    } else if (snfPct > 12) {
      newErrors.snfPercentage = "SNF % seems too high";
    }

    // Rate validation
    const rateValue = parseFloat(formData.rate);
    if (!formData.rate || isNaN(rateValue) || rateValue <= 0) {
      newErrors.rate = "Invalid calculation. Check Fat/SNF values";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ========== FORM SUBMISSION ==========
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error("Please fix form errors");
      return;
    }

    setSubmitting(true);
    try {
      const method = editingId ? "PUT" : "POST";
      const url = editingId
        ? `/api/supplier/procurement?id=${editingId}`
        : "/api/supplier/procurement";

      const payload = {
        supplierId,
        supplierName: data.supplier?.supplierName,
        supplierType: data.supplier?.supplierType,
        supplierTSRate: data.supplier?.supplierCustomRate
          ? "N/A"
          : data.supplier?.supplierTSRate,
        date: formData.date,
        time: formData.time,
        milkQuantity: parseFloat(formData.milkQuantity),
        fatPercentage: parseFloat(formData.fatPercentage),
        snfPercentage: parseFloat(formData.snfPercentage),
        rate: parseFloat(formData.rate),
        totalAmount: parseFloat(formData.totalAmount),
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Submission failed");

      toast.success(editingId ? "Updated successfully" : "Added successfully");
      await fetchAllData();
      resetForm();
    } catch (error) {
      console.error("Submit error:", error);
      toast.error(error.message || "Failed to save record");
    } finally {
      setSubmitting(false);
    }
  };

  // ========== CRUD OPERATIONS ==========
  const handleDelete = async (id) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this record? This action cannot be undone.",
      )
    ) {
      return;
    }

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

      if (editingId === id) {
        resetForm();
      }
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error.message || "Failed to delete record");
    }
  };

  const handleEdit = (item) => {
    if (editingId) {
      setEditingId(null);
      resetForm();
      return;
    }
    setEditingId(item._id);
    setFormData({
      date: item.date.split("T")[0],
      time: item.time || "AM",
      milkQuantity: item.milkQuantity.toString(),
      fatPercentage: item.fatPercentage.toString(),
      snfPercentage: item.snfPercentage.toString(),
      rate: item.rate.toString(),
      totalAmount: item.totalAmount.toString(),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setFormData({
      ...initialForm,
      time: getCurrentTimePeriod(),
    });
    setEditingId(null);
    setErrors({});
  };

  // Fix: Proper date filtering with timezone handling
  const filteredProcurements = useMemo(() => {
    if (!data.allProcurements.length) return [];

    return data.allProcurements.filter((record) => {
      const recordDate = new Date(record.date.split("T")[0]); // Extract date only
      const startDate = filters.startDate
        ? new Date(filters.startDate + "T00:00:00")
        : null;
      const endDate = filters.endDate
        ? new Date(filters.endDate + "T23:59:59")
        : null;

      if (startDate && recordDate < startDate) return false;
      if (endDate && recordDate > endDate) return false;
      return true;
    });
  }, [filters, data.allProcurements]);

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

  // ========== EXPORT HANDLERS ==========
  const handleExport = (format) => {
    if (!filteredProcurements.length) {
      toast.error("No data to export");
      return;
    }

    // Fix: Handle cases where .at() might not be available
    let fileName;
    const firstRecord = filteredProcurements[0];
    const lastRecord = filteredProcurements[filteredProcurements.length - 1];

    const dateRange = {
      start: firstRecord
        ? new Date(firstRecord.date).toLocaleDateString()
        : "----",
      end: lastRecord ? new Date(lastRecord.date).toLocaleDateString() : "----",
    };

    const supplierName = data.supplier?.supplierName || "Unknown";
    dateRange.start == dateRange.end
      ? (fileName = `${supplierName}_${dateRange.end}`.replace(/\//g, "-"))
      : (fileName =
          `${supplierName}_${dateRange.start}_to_${dateRange.end}`.replace(
            /\//g,
            "-",
          ));

    if (format === "csv") {
      exportToCSV(filteredProcurements, data.supplier, dateRange, fileName);
      toast.success("CSV exported successfully");
    } else if (format === "pdf") {
      exportToPDF(filteredProcurements, data.supplier, dateRange, fileName);
      toast.success("PDF exported successfully");
    }
  };

  // ========== RENDER CONDITIONS ==========
  if (loading) {
    return <LoadingSpinner />;
  }

  if (!data.supplier) {
    return (
      <div className={styles.errorState}>
        <h2>Supplier Not Found</h2>
        <p>
          {
            " The supplier you're looking for doesn't exist or has been removed."
          }
        </p>
        <div className={styles.errorActions}>
          <button
            onClick={() => router.push("/supplier")}
            className={styles.primaryBtn}
            aria-label="Go back to suppliers"
          >
            Back to Suppliers
          </button>
        </div>
      </div>
    );
  }

  const isFormDirty = Object.values(formData).some(
    (val, idx) => idx > 1 && val && val !== "",
  );

  // ========== RENDER ==========
  return (
    <div className={styles.container}>
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
        <div className={styles.headerTitle}>
          <h1> {data.supplier?.supplierName}</h1>
          <div className={styles.supplierInfo}>
            <span className={getSupplierTypeClass(data.supplier?.supplierType)}>
              {data.supplier?.supplierType}
            </span>

            {data.supplier?.supplierCustomRate ? (
              <span className={styles.tsRateTag}>
                Custom Rate: ₹
                {parseFloat(data.supplier?.supplierCustomRate || 0).toFixed(0)}
              </span>
            ) : (
              <span className={styles.tsRateTag}>
                Total Solids Rate:{" "}
                {parseFloat(data.supplier?.supplierTSRate || 0).toFixed(0)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* FORM SECTION */}
      <div className={styles.formSection}>
        <div className={styles.formHeader}>
          <h2>{editingId ? "Edit Record" : `Procurement Entry`}</h2>
        </div>

        <form onSubmit={handleSubmit} className={styles.procurementForm}>
          {Object.keys(errors).length > 0 && (
            <div className={styles.errorAlert}>
              <span className={styles.errorIcon}>⚠️</span>
              Please fix the errors in the form
            </div>
          )}

          <div className={styles.formGrid}>
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
              step="0.01"
              min="0"
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
              step="0.1"
              min="0"
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
              step="0.1"
              min="0"
            />

            <InputGroup
              label="Rate per Liter (₹)"
              name="rate"
              value={formData.rate ? formatNumberWithCommas(formData.rate) : ""}
              readOnly
              placeholder={
                data.supplier?.supplierCustomRate
                  ? ` Rs: ${data.supplier?.supplierCustomRate}`
                  : "Auto-calculated based on 'Total Solids' rate"
              }
              error={errors.rate}
            />

            <InputGroup
              label="Total Amount (₹)"
              name="totalAmount"
              value={
                formData.totalAmount
                  ? formatNumberWithCommas(formData.totalAmount)
                  : ""
              }
              readOnly
              placeholder="Auto-calculated"
            />
          </div>

          <div className={styles.formActions}>
            <button
              type="submit"
              disabled={submitting}
              className={styles.primaryBtn_}
              aria-label={editingId ? "Update record" : "Add new record"}
            >
              {submitting ? (
                <>
                  <span className={styles.buttonSpinner}></span>
                  {editingId ? "Updating..." : "Saving..."}
                </>
              ) : editingId ? (
                "Update Record"
              ) : (
                "Add Record"
              )}
            </button>
          </div>
        </form>
      </div>

      {/* FILTER SECTION */}
      {data.allProcurements.length > 0 && (
        <form className={styles.filterForm}>
          <div className={styles.filterHeader}>
            <h2>Filter by Date Range</h2>
          </div>

          <div className={styles.filterRow}>
            <div className={styles.dateFilterSection}>
              <div className={styles.dateInputGroup}>
                <div className={styles.dateField}>
                  <label htmlFor="startDate">From Date</label>
                  <input
                    id="startDate"
                    type="date"
                    name="startDate"
                    value={filters.startDate}
                    onChange={handleFilterChange}
                    className={styles.filterInput}
                    max={filters.endDate || getTodayDate()}
                    aria-label="Select start date"
                  />
                </div>

                <div className={styles.dateField}>
                  <label htmlFor="endDate">To Date</label>
                  <input
                    id="endDate"
                    type="date"
                    name="endDate"
                    value={filters.endDate}
                    onChange={handleFilterChange}
                    className={styles.filterInput}
                    max={getTodayDate()}
                    min={filters.startDate}
                    aria-label="Select end date"
                  />
                </div>
              </div>
            </div>

            <div className={styles.filterActions}>
              <div className={styles.buttonGroup}>
                <button
                  type="button"
                  onClick={resetFilterForm}
                  className={styles.primaryBtn}
                  aria-label="Reset filters to default"
                >
                  Reset Filters
                </button>
                <button
                  type="button"
                  onClick={clearFilters}
                  className={styles.secondaryBtn}
                  disabled={!filters.startDate && !filters.endDate}
                  aria-label="Clear date filters"
                >
                  Clear Filters
                </button>
              </div>
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
        <div className={styles.exportSection}>
          <span className={styles.entryCount}>
            {summary.count} record{summary.count !== 1 ? "s" : ""} found
          </span>
          <div className={styles.exportButtons}>
            <button
              onClick={() => handleExport("csv")}
              className={styles.exportBtn}
              disabled={!filteredProcurements.length}
              aria-label="Export data as CSV"
            >
              Export as CSV
            </button>
            <button
              onClick={() => handleExport("pdf")}
              className={styles.exportBtn}
              disabled={!filteredProcurements.length}
              aria-label="Export data as PDF"
            >
              Export as PDF
            </button>
          </div>
        </div>
      )}

      {/* TABLE SECTION */}
      <div className={styles.tableWrapper}>
        {loading ? (
          <LoadingSpinner />
        ) : summary.count === 0 ? (
          <div className={styles.emptyState}>
            {data.allProcurements.length === 0 ? (
              <>
                <span className={styles.emptyIcon}>📊</span>
                <p>No procurement records, start by adding the first record</p>
              </>
            ) : (
              <>
                <span className={styles.emptyIcon}>📊</span>
                <p>No procurement records found for the selected date range</p>
                {
                  <button
                    onClick={clearFilters}
                    className={styles.clearFilterLink}
                  >
                    clear filters to see all {data.allProcurements.length}{" "}
                    records
                  </button>
                }
              </>
            )}
          </div>
        ) : (
          <div className={styles.tableContainer}>
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
                  <th scope="col">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredProcurements.map((row) => (
                  <tr
                    key={row._id}
                    className={editingId === row._id ? styles.activeRow : ""}
                  >
                    <td className={styles.dateCell}>
                      {new Date(row.date).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>

                    <td className={styles.timeCell}>
                      <span
                        className={
                          row.time === "AM" ? styles.amBadge : styles.pmBadge
                        }
                      >
                        {row.time || "AM"}
                      </span>
                    </td>

                    <td className={styles.quantityCell}>
                      {parseFloat(row.milkQuantity).toFixed(2)}
                    </td>

                    <td className={styles.fatCell}>
                      {parseFloat(row.fatPercentage).toFixed(1)}
                    </td>

                    <td className={styles.snfCell}>
                      {parseFloat(row.snfPercentage).toFixed(1)}
                    </td>
                    <td className={styles.rateCell}>
                      {row.supplierTSRate || "N/A"}
                    </td>

                    <td className={styles.rateCell}>
                      ₹{parseFloat(row.rate).toFixed(1)}
                    </td>

                    <td className={styles.totalCell}>
                      ₹{formatNumberWithCommasNoDecimal(row.totalAmount)}
                    </td>

                    <td className={styles.actionsCell}>
                      <div className={styles.actionButtons}>
                        <button
                          onClick={() => handleEdit(row)}
                          className={styles.editBtn}
                          disabled={
                            submitting ||
                            new Date() - new Date(row.createdAt) <
                              2 * 24 * 60 * 60 * 1000
                              ? false
                              : true
                          }
                          aria-label="Edit record"
                          title="Edit record"
                        >
                          {editingId == row._id ? "Cancel" : "Edit"}
                        </button>
                        <button
                          onClick={() => handleDelete(row._id)}
                          className={styles.deleteBtn}
                          disabled={
                            submitting ||
                            new Date() - new Date(row.createdAt) <
                              2 * 24 * 60 * 60 * 1000
                              ? false
                              : true
                          }
                          aria-label="Delete record"
                          title="Delete record"
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
export default function ProcurementPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.container}>
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <span className={styles.loadingText}>
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
