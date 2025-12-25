"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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


// --- HELPER FOR AUTO TIME ---
const getCurrentTimePeriod = () => {
  const hour = new Date().getHours();
  return hour >= 12 ? "PM" : "AM";
};


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

function ProcurementContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supplierId = searchParams.get("supplierId");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState({
    startDate: getPreviousMonthDate(),
    endDate: getTodayDate(),
  });
  const [data, setData] = useState({
    supplier: null,
    allProcurements: [],
  });
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});

  // Updated initialForm to use dynamic time
  const initialForm = {
    date: getTodayDate(),
    time: getCurrentTimePeriod(), // Defaults to current time (Auto)
    milkQuantity: "",
    fatPercentage: "",
    snfPercentage: "",
    rate: "",
    totalAmount: "",
  };

  const [formData, setFormData] = useState(initialForm);

  const calculateTotals = useCallback((quantity, fat, snf, supplierRate) => {
    const q = parseFloat(quantity) || 0;
    const f = parseFloat(fat) || 0;
    const s = parseFloat(snf) || 0;
    const tsRate = parseFloat(supplierRate) || 0;

    let calculatedRate = 0;
    let calculatedTotal = 0;

    if (f > 0 && s > 0 && tsRate > 0) {
      const totalSolids = f + s;
      calculatedRate = (totalSolids * tsRate) / 100;
    }

    if (calculatedRate > 0 && q > 0) {
      calculatedTotal = calculatedRate * q;
    }

    return {
      rate: calculatedRate > 0 ? calculatedRate.toFixed(2) : "",
      totalAmount: calculatedTotal > 0 ? calculatedTotal.toFixed(2) : "",
    };
  }, []);

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

      const supplierData = await suppRes.json();
      const procurementData = await procRes.json();

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
      router.push("/supplier");
      return;
    }
    fetchAllData();
  }, [supplierId, router, fetchAllData]);

  useEffect(() => {
    if (
      formData.milkQuantity ||
      formData.fatPercentage ||
      formData.snfPercentage
    ) {
      const { rate, totalAmount } = calculateTotals(
        formData.milkQuantity,
        formData.fatPercentage,
        formData.snfPercentage,
        data.supplier?.supplierTSRate
      );

      setFormData((prev) => ({
        ...prev,
        rate,
        totalAmount,
      }));
    }
  }, [
    formData.milkQuantity,
    formData.fatPercentage,
    formData.snfPercentage,
    data.supplier?.supplierTSRate,
    calculateTotals,
  ]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (
      name === "milkQuantity" ||
      name === "fatPercentage" ||
      name === "snfPercentage"
    ) {
      if (parseFloat(value) < 0) return;
    }

    // Input sanitization for numeric fields
    let sanitizedValue = value;
    if (["milkQuantity", "fatPercentage", "snfPercentage"].includes(name)) {
      sanitizedValue = value.replace(/[^\d.]/g, "");

      const parts = sanitizedValue.split(".");
      if (parts.length > 2) {
        sanitizedValue = parts[0] + "." + parts.slice(1).join("");
      }
      if (parts[1]) {
        const maxDecimals = name === "milkQuantity" ? 2 : 1;
        sanitizedValue = parts[0] + "." + parts[1].substring(0, maxDecimals);
      }
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
    setFilters({
      startDate: "",
      endDate: "",
    });
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.date) newErrors.date = "Date is required";
    else if (formData.date > getTodayDate())
      newErrors.date = "Date cannot be in the future";

    // Add time validation
    if (!formData.time) newErrors.time = "Time period is required";
    else if (!["AM", "PM"].includes(formData.time))
      newErrors.time = "Invalid time period";

    if (!formData.milkQuantity) newErrors.milkQuantity = "Quantity is required";
    else if (parseFloat(formData.milkQuantity) <= 0)
      newErrors.milkQuantity = "Quantity must be greater than 0";
    else if (parseFloat(formData.milkQuantity) > 10000)
      newErrors.milkQuantity = "Quantity seems too high";

    if (!formData.fatPercentage) newErrors.fatPercentage = "Fat % is required";
    else if (parseFloat(formData.fatPercentage) <= 0)
      newErrors.fatPercentage = "Fat % must be greater than 0";
    else if (parseFloat(formData.fatPercentage) > 7)
      newErrors.fatPercentage = "Fat % seems too high";

    if (!formData.snfPercentage) newErrors.snfPercentage = "SNF % is required";
    else if (parseFloat(formData.snfPercentage) <= 0)
      newErrors.snfPercentage = "SNF % must be greater than 0";
    else if (parseFloat(formData.snfPercentage) > 9)
      newErrors.snfPercentage = "SNF % seems too high";

    if (!formData.rate || parseFloat(formData.rate) <= 0) {
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
      const method = editingId ? "PUT" : "POST";
      const url = editingId
        ? `/api/supplier/procurement?id=${editingId}`
        : "/api/supplier/procurement";

      const payload = {
        supplierId,
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

      await fetchAllData(); // Refresh ALL data
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
        "Are you sure you want to delete this record? This action cannot be undone."
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

      await fetchAllData(); // Refresh ALL data

      toast.success("Deleted successfully");
      if (editingId === id) resetForm();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error.message || "Failed to delete record");
    }
  };

  const handleEdit = (item) => {
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
    // Reset to initial state, but ensuring time is fresh based on current clock
    setFormData({
      ...initialForm,
      time: getCurrentTimePeriod(),
    });
    setEditingId(null);
    setErrors({});
  };
  const resetFilterForm = () => {
    setFilters({ startDate: getPreviousMonthDate(), endDate: getTodayDate() });
  };

  // --- FILTERING LOGIC WITH useMemo ---
  const filteredProcurements = useMemo(() => {
    if (!data.allProcurements.length) return [];

    return data.allProcurements
      .filter((record) => {
        const recordDate = new Date(record.date);

        // Apply date filters
        if (filters.startDate && recordDate < new Date(filters.startDate)) {
          return false;
        }
        if (filters.endDate && recordDate > new Date(filters.endDate)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Sort by date descending, then by time (AM before PM)
        const dateCompare = new Date(b.date) - new Date(a.date);
        if (dateCompare !== 0) return dateCompare;
        return (a.time === "AM" ? -1 : 1) - (b.time === "AM" ? -1 : 1);
      });
  }, [data.allProcurements, filters]);

  // --- SUMMARY CALCULATION ---
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

    // Get unique dates for daily average calculation
    const uniqueDates = new Set(
      filteredProcurements.map((record) => record.date.split("T")[0])
    );

    const totals = filteredProcurements.reduce(
      (acc, curr) => ({
        milk: acc.milk + (parseFloat(curr.milkQuantity) || 0),
        amount: acc.amount + (parseFloat(curr.totalAmount) || 0),
        count: acc.count + 1,
      }),
      { milk: 0, amount: 0, count: 0 }
    );

    return {
      ...totals,
      avgRate: totals.milk ? (totals.amount / totals.milk).toFixed(2) : "0.00",
      avgFat: (
        filteredProcurements.reduce(
          (sum, curr) => sum + parseFloat(curr.fatPercentage),
          0
        ) / filteredProcurements.length
      ).toFixed(1),
      avgSnf: (
        filteredProcurements.reduce(
          (sum, curr) => sum + parseFloat(curr.snfPercentage),
          0
        ) / filteredProcurements.length
      ).toFixed(1),
      daysWithData: uniqueDates.size,
    };
  }, [filteredProcurements]);

  // --- Export Handlers ---
  const handleExport = (format) => {
    if (!filteredProcurements.length) {
      toast.error("No data to export");
      return;
    }

    const dateRange = {
      start: filters.startDate,
      end: filters.endDate,
    };

    const supplierName = data.supplier?.supplierName || "Unknown";
    const fileName = `${supplierName}_${filters.startDate}_to_${filters.endDate}`;

    if (format === "csv") {
      exportToCSV(filteredProcurements, data.supplier, dateRange, fileName);
      toast.success("CSV exported successfully");
    } else if (format === "pdf") {
      exportToPDF(filteredProcurements, data.supplier, dateRange, fileName);
      toast.success("PDF exported successfully");
    }
  };

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

      <div className={styles.header}>
        <button
          onClick={() => router.push("/supplier")}
          className={styles.backButton}
          disabled={submitting}
          aria-label="Go back to suppliers"
        >
          Back
        </button>
        <div className={styles.headerTitle}>
          <h1>{data.supplier?.supplierName}</h1>
          <div className={styles.supplierInfo}>
            <span className={styles.supplierTypeBadge}>
              {data.supplier?.supplierType}
            </span>
            <span className={styles.tsRateTag}>
              Total Solids Rate:{" "}
              {parseFloat(data.supplier?.supplierTSRate || 0).toFixed(0)}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.formSection}>
        <div className={styles.formHeader}>
          <h2>{editingId ? "Edit Record" : "New Procurement Entry"}</h2>
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
              required={true}
            />

            <div className={styles.inputGroup}>
              <label className={styles.requiredLabel}>
                Time Period
                <span className={styles.requiredAsterisk}>*</span>
              </label>
              <select
                name="time"
                value={formData.time}
                onChange={handleInputChange}
                className={styles.select}
                aria-label="Select time period"
              >
                <option value="AM">AM (Morning)</option>
                <option value="PM">PM (Evening)</option>
              </select>
              {errors.time && (
                <span className={styles.errorText}>{errors.time}</span>
              )}
            </div>

            <InputGroup
              label="Milk Quantity (L)"
              name="milkQuantity"
              type="number"
              inputMode="decimal"
              placeholder="20.5"
              value={formData.milkQuantity}
              onChange={handleInputChange}
              error={errors.milkQuantity}
              required={true}
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
              required={true}
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
              required={true}
            />

            <InputGroup
              label="Rate per Liter (₹)"
              name="rate"
              value={formData.rate ? formatNumberWithCommas(formData.rate) : ""}
              readOnly
              placeholder="Auto-calculated"
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
              className={styles.primaryBtn}
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
            {(editingId ||
              Object.values(formData).some(
                (val) =>
                  val && val !== initialForm.date && val !== initialForm.time
              )) && (
              <button
                type="button"
                onClick={resetForm}
                className={styles.secondaryBtn}
                disabled={submitting}
                aria-label={editingId ? "Cancel edit" : "Clear form"}
              >
                {editingId ? "Cancel Edit" : "Clear Form"}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Filter Section */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
        }}
        className={styles.filterSection}
      >
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
              {/* <div className={styles.filterActions}>
            <button
              type="button"
              onClick={clearFilters}
              className={styles.secondaryBtn}
              disabled={!filters.startDate && !filters.endDate}
              aria-label="Clear date filters"
            >
              Clear Filters
            </button>
          </div> */}
              <button
                type="button"
                onClick={resetFilterForm}
                className={styles.secondaryResetBtn}
                disabled={!filters.startDate && !filters.endDate}
                aria-label="Clear date filters"
              >
                Reset Filters
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className={styles.secondaryFilterBtn}
                disabled={!filters.startDate && !filters.endDate}
                aria-label="Clear date filters"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Summary Section - Production History Style */}
      {summary.count > 0 && (
        <div className={styles.statsCard}>
          <h3>
            Procurement Summary{" "}
            <div className={styles.dateRange}>
              {(() => {
                if (filters.startDate && filters.endDate) {
                  return filters.startDate === filters.endDate
                    ? `${filters.startDate}`
                    : `${filters.startDate} to ${filters.endDate}`;
                } else if (filters.startDate) {
                  return `From ${filters.startDate}`;
                } else if (filters.endDate) {
                  return `Till ${filters.endDate}`;
                }
                return "All Records";
              })()}
            </div>
          </h3>
          <div className={styles.statsGrid}>
            {Object.entries({
              totalMilk: {
                value: `${summary.milk.toFixed(2)}`,
                label: "Milk",
                unit: "L",
              },

              dailyAvg: {
                value: summary.daysWithData
                  ? (summary.milk / summary.daysWithData).toFixed(2)
                  : "0.00",
                label: "Daily Avg",
                unit: "L/day",
              },
              // records: {
              //   value: summary.count,
              //   label: "Records",
              //   unit: "Count",
              // },
              avgRate: {
                value: `₹${summary.avgRate}`,
                label: "Avg Rate",
                unit: "/L",
              },
              totalAmount: {
                value: `${formatNumberWithCommasNoDecimal(summary.amount)}`,
                label: "Total Amount",
                unit: "₹",
              },
              avgFat: {
                value: `${summary.avgFat}`,
                label: "Avg Fat",
                unit: "%",
              },
              avgSnf: {
                value: `${summary.avgSnf}`,
                label: "Avg SNF",
                unit: "%",
              },
            }).map(([key, { value, label, unit }]) => (
              <div key={key} className={styles.statItem}>
                <span className={styles.statLabel}>{label}</span>
                <span className={styles.statValue}>
                  {key === "totalAmount" ? "₹" : ""}
                  {value}
                  <span className={styles.statUnit}>{unit}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export & Table Section */}
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

      {/* Table Section */}
      <div className={styles.tableWrapper}>
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <span className={styles.loadingText}>
              Loading procurement data...
            </span>
          </div>
        ) : summary.count === 0 ? (
          <div className={styles.emptyState}>
            {!data.supplier ? (
              <>
                <span className={styles.emptyIcon}>⚠️</span>
                <h3>Supplier not found</h3>
                <button
                  onClick={() => router.push("/supplier")}
                  className={styles.secondaryBtn}
                >
                  Back to Suppliers
                </button>
              </>
            ) : (
              <>
                <span className={styles.emptyIcon}>📊</span>
                <p>No procurement records found for the selected date range</p>
                {(filters.startDate !== getPreviousMonthDate() ||
                  filters.endDate !== getTodayDate()) && (
                  <button
                    onClick={clearFilters}
                    className={styles.clearFilterLink}
                  >
                    Clear filters to see all {data.allProcurements.length}{" "}
                    records
                  </button>
                )}
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
                          disabled={submitting}
                          aria-label="Edit record"
                          title="Edit record"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => handleDelete(row._id)}
                          className={styles.deleteBtn}
                          disabled={submitting}
                          aria-label="Delete record"
                          title="Delete record"
                        >
                          🗑
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

export default ProcurementContent;
