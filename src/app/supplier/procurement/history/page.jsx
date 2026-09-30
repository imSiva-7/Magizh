"use client";

import {
  useState,
  useEffect,
  Suspense,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/procurement-history.module.css";
import { getCurrentMonthStartDate, getTodayDate } from "@/utils/dateUtils";
import {
  formatNumberWithCommas,
  formatNumberWithCommasNoDecimal,
} from "@/utils/formatNumberWithComma";
import { exportToCSV, exportToPDF } from "@/utils/exportUtils";
import Link from "next/link";

const INITIAL_FILTERS = {
  startDate: getCurrentMonthStartDate(),
  endDate: getTodayDate(),
};

const getCurrentTimePeriod = () => {
  const hour = new Date().getHours();
  return hour >= 12 ? "PM" : "AM";
};

const makeInitialForm = () => ({
  date: getTodayDate(),
  time: getCurrentTimePeriod(),
  milkQuantity: "",
  fatPercentage: "",
  snfPercentage: "",
  paymentStatus: "Not Paid",
  comment: "",
});

const LoadingSpinner = () => (
  <div className={styles.loading_container}>
    <div className={styles.spinner}></div>
    <span className={styles.loading_text}>Loading procurement records...</span>
  </div>
);

const validateDateRange = (startDate, endDate) => {
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    return "Start date cannot be after end date";
  }
  if (endDate && new Date(endDate) > new Date(getTodayDate())) {
    return "End date cannot be in the future";
  }
  return null;
};

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

const formatTimeBadge = (time) => {
  if (!time) return "AM";
  return time.toUpperCase() === "PM" ? "PM" : "AM";
};

const sanitizeNumericInput = (value, fieldName) => {
  let sanitized = value.replace(/[^\d.]/g, "");
  const parts = sanitized.split(".");
  if (parts.length > 2) sanitized = parts[0] + "." + parts.slice(1).join("");
  if (parts[1]) {
    const maxDecimals = fieldName === "milkQuantity" ? 2 : 1;
    sanitized = parts[0] + "." + parts[1].substring(0, maxDecimals);
  }
  return sanitized;
};

const StatItem = ({ label, value, unit, prefix = "" }) => (
  <div className={styles.stat_item}>
    <span className={styles.stat_label}>{label}</span>
    <span className={styles.stat_value}>
      {prefix}
      {value}
      {unit && <span className={styles.stat_unit}>{unit}</span>}
    </span>
  </div>
);

// ========== FORM SUBCOMPONENTS ==========
const FormInput = ({ label, error, required, readOnly, ...props }) => (
  <div className={styles.form_input_group}>
    <label className={styles.form_label}>
      {label}
      {required && <span className={styles.required_asterisk}>*</span>}
    </label>
    <input
      className={`${styles.form_input} ${error ? styles.input_error : ""} ${
        readOnly ? styles.readonly_input : ""
      }`}
      autoComplete="off"
      readOnly={readOnly}
      {...props}
    />
    {error && <span className={styles.error_text}>{error}</span>}
  </div>
);

// ========== MAIN COMPONENT ==========
function ProcurementHistoryContent() {
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [procurementData, setProcurementData] = useState([]);
  const [lastFetchTime, setLastFetchTime] = useState(null);

  // ---------- Add Procurement state ----------
  const [showAddForm, setShowAddForm] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [formData, setFormData] = useState(makeInitialForm);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const searchInputRef = useRef(null);

  // Debounced supplier search
  const [supplierSearchDebounced, setSupplierSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSupplierSearchDebounced(supplierSearch), 250);
    return () => clearTimeout(t);
  }, [supplierSearch]);

  // ---- History fetch ----
  const fetchAllData = useCallback(async () => {
    const error = validateDateRange(filters.startDate, filters.endDate);
    if (error) {
      toast.error(error);
      return;
    }

    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (filters.startDate) queryParams.append("startDate", filters.startDate);
      if (filters.endDate) queryParams.append("endDate", filters.endDate);

      const response = await fetch(
        `/api/supplier/procurement/history?${queryParams}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || "Failed to load procurement history",
        );
      }

      const data = await response.json();
      const responseData = Array.isArray(data) ? data : data.data || data;

      if (Array.isArray(responseData)) {
        setProcurementData(responseData);
        setLastFetchTime(new Date());
      } else {
        throw new Error("Invalid data format received from server");
      }
    } catch (error) {
      console.error("Load error:", error);
      toast.error(error.message || "Failed to load procurement history");
      setProcurementData([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchAllData();
  }, [filters, fetchAllData]);

  const fetchSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    try {
      const res = await fetch("/api/supplier");
      if (!res.ok) throw new Error("Failed to load suppliers");
      const data = await res.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Supplier fetch error:", error);
      toast.error(error.message || "Failed to load suppliers");
      setSuppliers([]);
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

  // Load suppliers the first time the form is opened
  useEffect(() => {
    if (showAddForm && suppliers.length === 0 && !suppliersLoading) {
      fetchSuppliers();
    }
  }, [showAddForm, suppliers.length, suppliersLoading, fetchSuppliers]);

  // Focus the search input when form opens
  useEffect(() => {
    if (showAddForm) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [showAddForm]);

  // ---- Filtered supplier list ----
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearchDebounced.trim()) return suppliers;
    const term = supplierSearchDebounced.toLowerCase().trim();
    return suppliers
      .filter((s) => {
        const name = (s.supplierName || "").toLowerCase();
        return (
          name.includes(term)
        );
      }).slice(0, 8);
     
  }, [suppliers, supplierSearchDebounced]);

  // ---- Effective pricing for the selected supplier ----
  const effectiveTSRate = useMemo(() => {
    if (!selectedSupplier) return 0;
    if (selectedSupplier.supplierCustomRate) return 0;
    const base = Number(selectedSupplier.supplierTSRate) || 0;
    const cut =
      selectedSupplier.isChildSupplier && selectedSupplier.cutPercentage
        ? Number(selectedSupplier.cutPercentage)
        : 0;
    return cut > 0 ? base - cut : base;
  }, [selectedSupplier]);

  const hasCut =
    !!selectedSupplier?.isChildSupplier &&
    !selectedSupplier?.supplierCustomRate &&
    Number(selectedSupplier?.cutPercentage) > 0;

  const currentPricing = useMemo(() => {
    if (!selectedSupplier) return { rate: "", totalAmount: "" };
    const q = parseFloat(formData.milkQuantity) || 0;
    const f = parseFloat(formData.fatPercentage) || 0;
    const s = parseFloat(formData.snfPercentage) || 0;

    if (q <= 0 || f <= 0 || s <= 0) return { rate: "", totalAmount: "" };

    const totalSolids = f + s;
    let rate = 0;

    if (selectedSupplier.supplierCustomRate) {
      rate = parseFloat(selectedSupplier.supplierCustomRate);
    } else {
      rate = (totalSolids * effectiveTSRate) / 100;
    }

    return {
      rate: rate.toFixed(2),
      totalAmount: (rate * q).toFixed(2),
    };
  }, [
    selectedSupplier,
    formData.milkQuantity,
    formData.fatPercentage,
    formData.snfPercentage,
    effectiveTSRate,
  ]);

  // ---- Filter handlers ----
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    fetchAllData();
  };

  const todayFilter = () =>
    setFilters({ startDate: getTodayDate(), endDate: getTodayDate() });
  const resetFilters = () => setFilters(INITIAL_FILTERS);
  const clearFilters = () => setFilters({ startDate: "", endDate: "" });

  // ---- Add form handlers ----
  const handleOpenAddForm = () => {
    setShowAddForm(true);
    setSupplierSearch("");
    setSelectedSupplier(null);
    setFormData(makeInitialForm());
    setFormErrors({});
  };

  const handleCloseAddForm = () => {
    setShowAddForm(false);
    setSupplierSearch("");
    setSelectedSupplier(null);
    setFormData(makeInitialForm());
    setFormErrors({});
  };

  const handlePickSupplier = (supplier) => {
    setSelectedSupplier(supplier);
    setSupplierSearch(supplier.supplierName || "");
    setFormErrors({});
  };

  const handleChangeSupplier = () => {
    setSelectedSupplier(null);
    setSupplierSearch("");
    setFormData(makeInitialForm());
    setFormErrors({});
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const handleFormInputChange = (e) => {
    const { name, value } = e.target;
    if (["milkQuantity", "fatPercentage", "snfPercentage"].includes(name)) {
      if (parseFloat(value) < 0) return;
    }
    let sanitized = value;
    if (["milkQuantity", "fatPercentage", "snfPercentage"].includes(name)) {
      sanitized = sanitizeNumericInput(value, name);
    }
    setFormData((prev) => ({ ...prev, [name]: sanitized }));
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateAddForm = () => {
    const errs = {};
    if (!selectedSupplier) {
      toast.error("Select a supplier first");
      return false;
    }
    if (!formData.date) errs.date = "Date is required";
    if (!["AM", "PM"].includes(formData.time)) errs.time = "Invalid time";

    const q = parseFloat(formData.milkQuantity);
    if (!formData.milkQuantity) errs.milkQuantity = "Quantity is required";
    else if (q <= 0) errs.milkQuantity = "Must be > 0";
    else if (q > 10000) errs.milkQuantity = "Seems too high";

    const f = parseFloat(formData.fatPercentage);
    if (!formData.fatPercentage) errs.fatPercentage = "Fat % is required";
    else if (f <= 0) errs.fatPercentage = "Must be > 0";
    else if (f > 9) errs.fatPercentage = "Seems too high";

    const s = parseFloat(formData.snfPercentage);
    if (!formData.snfPercentage) errs.snfPercentage = "SNF % is required";
    else if (s <= 0) errs.snfPercentage = "Must be > 0";
    else if (s > 12) errs.snfPercentage = "Seems too high";

    if (!currentPricing.rate || parseFloat(currentPricing.rate) <= 0) {
      errs.rate = "Invalid rate — check Fat/SNF";
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!validateAddForm()) {
      toast.error("Please fix the form errors");
      return;
    }

    setSubmitting(true);
    try {
      const isCustomRate = !!selectedSupplier.supplierCustomRate;

      const payload = {
        supplierId: selectedSupplier._id,
        supplierName: selectedSupplier.supplierName,
        supplierType: selectedSupplier.supplierType,
        supplierTSRate: isCustomRate
          ? "N/A"
          : selectedSupplier.supplierTSRate,
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
        actionDoneBy: "admin",
      };

      const res = await fetch("/api/supplier/procurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Submission failed");

      toast.success(
        `Recorded ${parseFloat(formData.milkQuantity).toFixed(2)}L for ${
          selectedSupplier.supplierName
        }`,
      );

      // Reset the form but keep the same supplier selected for fast repeat entry
      setFormData({
        ...makeInitialForm(),
        date: formData.date, // preserve the same date for consecutive entries
        time: getCurrentTimePeriod(),
      });
      setFormErrors({});

      // Refresh the history table
      await fetchAllData();
    } catch (error) {
      console.error("Add procurement error:", error);
      toast.error(error.message || "Failed to save record");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Table data ----
  const decoratedTableData = useMemo(() => {
    const dateCounts = {};
    return procurementData.map((row) => {
      const dateKey = row.date?.split("T")[0] || "unknown";
      if (!dateCounts[dateKey]) dateCounts[dateKey] = 0;
      dateCounts[dateKey]++;

      const isFirstOfDate = dateCounts[dateKey] === 1;
      const displayDate = isFirstOfDate
        ? `(${dateCounts[dateKey]}) ${new Date(row.date).toLocaleDateString(
            "en-IN",
            { day: "2-digit", month: "short", year: "2-digit" },
          )} `
        : `(${dateCounts[dateKey]})`;

      return { ...row, displayDate };
    });
  }, [procurementData]);

  const summary = useMemo(() => {
    if (procurementData.length === 0) {
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

    const uniqueDates = new Set();
    let totalMilk = 0,
      totalAmount = 0,
      totalFat = 0,
      totalSnf = 0;

    procurementData.forEach((record) => {
      const milkQty = parseFloat(record.milkQuantity) || 0;
      const amount = parseFloat(record.totalAmount) || 0;
      const fat = parseFloat(record.fatPercentage) || 0;
      const snf = parseFloat(record.snfPercentage) || 0;
      const date = record.date?.split("T")[0];

      if (date) uniqueDates.add(date);

      totalMilk += milkQty;
      totalAmount += amount;
      totalFat += fat;
      totalSnf += snf;
    });

    const count = procurementData.length;
    return {
      milk: totalMilk,
      amount: totalAmount,
      count,
      avgRate: totalMilk > 0 ? (totalAmount / totalMilk).toFixed(2) : "0.00",
      avgFat: count > 0 ? (totalFat / count).toFixed(1) : "0.0",
      avgSnf: count > 0 ? (totalSnf / count).toFixed(1) : "0.0",
      daysWithData: uniqueDates.size,
    };
  }, [procurementData]);

  const handleExport = (format) => {
    if (!procurementData.length) {
      toast.error("No data to export");
      return;
    }

    const dateRange = {
      start:
        new Date(procurementData.at(-1).date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "2-digit",
        }) || "----",
      end:
        new Date(procurementData[0].date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "2-digit",
        }) || "----",
    };
    const supplierName = "All Suppliers records";
    const fileName = `${supplierName}_${dateRange.start}_to_${dateRange.end}`;

    if (format === "csv") {
      exportToCSV(procurementData, supplierName, dateRange, fileName);
      toast.success("CSV exported successfully");
    } else if (format === "pdf") {
      exportToPDF(procurementData, supplierName, dateRange, fileName);
      toast.success("PDF exported successfully");
    }
  };

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
      <div className={styles.page_header}>
        <div>
          <h1>Procurement History</h1>
          <span className={styles.header_subtitle}>
            All suppliers ·{" "}
            {getFormattedDateRange(filters.startDate, filters.endDate)}
          </span>
        </div>
        {!showAddForm && (
          <button
            type="button"
            className={styles.add_procurement_btn}
            onClick={handleOpenAddForm}
          >
            <span className={styles.plus}>+</span> Add Procurement
          </button>
        )}
      </div>

      {/* ==================== ADD PROCUREMENT ==================== */}
      {showAddForm && (
        <div className={styles.add_section}>
          <div className={styles.add_header}>
            <h2>Add Procurement</h2>
            <button
              type="button"
              onClick={handleCloseAddForm}
              className={styles.close_add_btn}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Step 1 — supplier search */}
          {!selectedSupplier && (
            <div className={styles.supplier_picker}>
              <label className={styles.form_label}>Search Supplier</label>
              <input
                ref={searchInputRef}
                type="text"
                className={styles.supplier_search_input}
                placeholder="Type a supplier name, type, or phone..."
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                autoComplete="off"
              />

              {suppliersLoading ? (
                <div className={styles.supplier_hint}>Loading suppliers...</div>
              ) : filteredSuppliers.length === 0 ? (
                <div className={styles.supplier_hint}>
                  {supplierSearch.trim()
                    ? `No suppliers match "${supplierSearch}"`
                    : "Start typing to find a supplier"}
                </div>
              ) : (
                <ul className={styles.supplier_results}>
                  {filteredSuppliers.map((s) => (
                    <li
                      key={s._id}
                      className={styles.supplier_result_item}
                      onClick={() => handlePickSupplier(s)}
                    >
                      <div className={styles.supplier_result_main}>
                        <span className={styles.supplier_result_name}>
                          {s.supplierName}
                        </span>
                        {s.isHeadSupplier && (
                          <span className={styles.tag_head}>Head</span>
                        )}
                        {s.isChildSupplier && !s.isHeadSupplier && (
                          <span className={styles.tag_child}>Child</span>
                        )}
                      </div>
                      <div className={styles.supplier_result_meta}>
                        {s.supplierType || "—"} ·{" "}
                        {s.supplierCustomRate
                          ? `₹${s.supplierCustomRate}/L fixed`
                          : `TSR ${s.supplierTSRate || "—"}`}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Step 2 — form for selected supplier */}
          {selectedSupplier && (
            <>
              <div className={styles.selected_supplier_bar}>
                <div className={styles.selected_supplier_info}>
                  <span className={styles.selected_supplier_name}>
                    {selectedSupplier.supplierName}
                  </span>
                  <span className={styles.selected_supplier_meta}>
                    {selectedSupplier.supplierType || "—"} ·{" "}
                    {selectedSupplier.supplierCustomRate
                      ? `Custom ₹${selectedSupplier.supplierCustomRate}/L`
                      : `TSR ${effectiveTSRate.toFixed(0)}${
                          hasCut
                            ? ` (was ${parseFloat(
                                selectedSupplier.supplierTSRate || 0,
                              ).toFixed(0)})`
                            : ""
                        }`}
                  </span>
                  {hasCut && (
                    <span className={styles.selected_supplier_cut}>
                      {parseFloat(selectedSupplier.cutPercentage).toFixed(0)}{" "}
                      TSR cut → {selectedSupplier.headSupplierName || "Head"}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleChangeSupplier}
                  className={styles.change_supplier_btn}
                  disabled={submitting}
                >
                  Change
                </button>
              </div>

              <form onSubmit={handleAddSubmit} className={styles.add_form}>
                <div className={styles.add_form_grid}>
                  <FormInput
                    label="Date"
                    name="date"
                    type="date"
                    value={formData.date}
                    onChange={handleFormInputChange}
                    max={getTodayDate()}
                    error={formErrors.date}
                    required
                  />

                  <div className={styles.form_input_group}>
                    <label className={styles.form_label}>
                      Time Period
                      <span className={styles.required_asterisk}>*</span>
                    </label>
                    <select
                      name="time"
                      value={formData.time}
                      onChange={handleFormInputChange}
                      className={styles.form_select}
                    >
                      <option value="AM">AM (Morning)</option>
                      <option value="PM">PM (Evening)</option>
                    </select>
                  </div>

                  <FormInput
                    label="Milk Quantity (L)"
                    name="milkQuantity"
                    type="number"
                    inputMode="decimal"
                    placeholder="20.5"
                    value={formData.milkQuantity}
                    onChange={handleFormInputChange}
                    error={formErrors.milkQuantity}
                    required
                  />

                  <FormInput
                    label="Fat %"
                    name="fatPercentage"
                    type="number"
                    inputMode="decimal"
                    placeholder="3.5"
                    value={formData.fatPercentage}
                    onChange={handleFormInputChange}
                    error={formErrors.fatPercentage}
                    required
                  />

                  <FormInput
                    label="SNF %"
                    name="snfPercentage"
                    type="number"
                    inputMode="decimal"
                    placeholder="8.5"
                    value={formData.snfPercentage}
                    onChange={handleFormInputChange}
                    error={formErrors.snfPercentage}
                    required
                  />

                  <FormInput
                    label="Comment"
                    name="comment"
                    type="text"
                    placeholder="Optional"
                    value={formData.comment}
                    onChange={handleFormInputChange}
                    disabled={submitting}
                  />

                  <FormInput
                    label="Rate per Liter (₹)"
                    value={
                      currentPricing.rate
                        ? formatNumberWithCommas(currentPricing.rate)
                        : ""
                    }
                    readOnly
                    placeholder="Auto-calculated"
                    error={formErrors.rate}
                  />

                  <FormInput
                    label="Total Amount (₹)"
                    value={
                      currentPricing.totalAmount
                        ? formatNumberWithCommas(currentPricing.totalAmount)
                        : ""
                    }
                    readOnly
                    placeholder="Auto-calculated"
                  />
                </div>

                <div className={styles.add_form_actions}>
                  <button
                    type="submit"
                    disabled={submitting}
                    className={styles.submit_btn}
                  >
                    {submitting ? "Saving..." : "Add Record"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseAddForm}
                    className={styles.cancel_btn}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}

      {/* FILTER SECTION */}
      <form onSubmit={handleFilterSubmit} className={styles.filter_card}>
        <div className={styles.filter_title}>
          <h2>Filter by Date Range</h2>
        </div>

        <div className={styles.filter_content}>
          <div className={styles.date_section}>
            <div className={styles.date_inputs_grid}>
              <div className={styles.date_field}>
                <label htmlFor="startDate" className={styles.date_label}>
                  From Date
                </label>
                <input
                  id="startDate"
                  name="startDate"
                  type="date"
                  value={filters.startDate}
                  onChange={handleFilterChange}
                  className={styles.date_input}
                  max={filters.endDate || getTodayDate()}
                  aria-label="Select start date"
                />
              </div>
              <div className={styles.date_field}>
                <label htmlFor="endDate" className={styles.date_label}>
                  To Date
                </label>
                <input
                  id="endDate"
                  name="endDate"
                  type="date"
                  value={filters.endDate}
                  onChange={handleFilterChange}
                  className={styles.date_input}
                  min={filters.startDate}
                  max={getTodayDate()}
                  aria-label="Select end date"
                />
              </div>
            </div>
          </div>

          <div className={styles.filter_actions}>
            <div className={styles.filter_buttons}>
              <button
                type="button"
                onClick={resetFilters}
                className={`${styles.btn} ${styles.btn_primary}`}
                disabled={loading}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className={`${styles.btn} ${styles.btn_secondary}`}
                disabled={loading || (!filters.startDate && !filters.endDate)}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={todayFilter}
                className={`${styles.btn} ${styles.btn_primary2}`}
                disabled={loading}
              >
                Load Today
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* SUMMARY */}
      {loading ? (
        <div className={styles.loadingSection}>
          <LoadingSpinner />
        </div>
      ) : (
        summary.count > 0 && (
          <div className={styles.stats_card}>
            <h3 className={styles.stats_header}>
              Summary
              <span className={styles.date_range_badge}>
                {getFormattedDateRange(filters.startDate, filters.endDate)}
              </span>
            </h3>
            <div className={styles.stats_grid}>
              <StatItem
                label={"Avg Milk"}
                value={(summary.milk / (summary.daysWithData || 1)).toFixed(2)}
                unit={"L"}
              />
              <StatItem
                label="Avg Fat/SNF"
                value={`${summary.avgFat} / ${summary.avgSnf}`}
                unit="%"
              />
              <StatItem
                label="Daily Avg Amount"
                value={formatNumberWithCommasNoDecimal(
                  summary.amount / (summary.daysWithData || 1),
                )}
                unit="/L"
                prefix="₹"
              />
              <StatItem
                label="Avg Rate"
                value={summary.avgRate}
                unit="/L"
                prefix="₹"
              />
              <StatItem
                label="Total Milk"
                value={formatNumberWithCommasNoDecimal(summary.milk)}
                unit="L"
              />
              <StatItem
                label="Total Amount"
                value={formatNumberWithCommasNoDecimal(summary.amount)}
                unit=""
                prefix="₹"
              />
            </div>
          </div>
        )
      )}

      {/* EXPORT */}
      {!loading && summary.count > 0 && (
        <div className={styles.exportSection}>
          <span className={styles.entryCount}>
            {summary.count} record{summary.count !== 1 ? "s" : ""} found
          </span>
          <div className={styles.exportButtons}>
            <button
              onClick={() => handleExport("csv")}
              className={styles.exportBtn}
              disabled={!procurementData.length}
            >
              Export as CSV
            </button>
            <button
              onClick={() => handleExport("pdf")}
              className={styles.exportBtn}
              disabled={!procurementData.length}
            >
              Export as PDF
            </button>
          </div>
        </div>
      )}

      {/* TABLE */}
      <div className={styles.table_wrapper}>
        {!loading && summary.count === 0 ? (
          <div className={styles.empty_state}>
            <span className={styles.empty_icon}>🔍</span>
            <h3 className={styles.empty_title}>No Records Found</h3>
            <p className={styles.empty_message}>
              No procurement records found for the selected date range
            </p>
            <button
              onClick={clearFilters}
              className={styles.clear_filter_btn}
              disabled={loading}
            >
              clear filters
            </button>
          </div>
        ) : (
          !loading && (
            <div className={styles.table_container}>
              <table className={styles.table} aria-label="All procurement history">
                <thead>
                  <tr>
                    <th scope="col" className={styles.date_header}>Date</th>
                    <th scope="col" className={styles.supplier_header}>Supplier</th>
                    <th scope="col" className={styles.time_header}>Time</th>
                    <th scope="col" className={styles.quantity_header}>Milk (L)</th>
                    <th scope="col" className={styles.fat_header}>Fat %</th>
                    <th scope="col" className={styles.snf_header}>SNF %</th>
                    <th scope="col" className={styles.tsRate_header}>TS Rate</th>
                    <th scope="col" className={styles.rate_header}>Rate/L</th>
                    <th scope="col" className={styles.total_header}>Total (₹)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {decoratedTableData.map((row) => {
                    const timeBadge = formatTimeBadge(row.time);
                    return (
                      <tr key={row._id}>
                        <td className={styles.date_cell}>{row.displayDate}</td>
                        <td className={styles.supplier_cell}>
                          {row.supplierName ? (
                            <Link
                              href={`/supplier/procurement?supplierId=${row.supplierId}`}
                              className={styles.supplier_name}
                            >
                              {row.supplierName}
                            </Link>
                          ) : (
                            "Unknown"
                          )}
                        </td>
                        <td className={styles.time_cell}>
                          <span
                            className={
                              timeBadge === "PM"
                                ? styles.pm_badge
                                : styles.am_badge
                            }
                          >
                            {timeBadge}
                          </span>
                        </td>
                        <td className={styles.quantity_cell}>
                          {(parseFloat(row.milkQuantity) || 0).toFixed(2)}
                        </td>
                        <td className={styles.fat_cell}>
                          {(parseFloat(row.fatPercentage) || 0).toFixed(1)}
                        </td>
                        <td className={styles.snf_cell}>
                          {(parseFloat(row.snfPercentage) || 0).toFixed(1)}
                        </td>
                        <td className={styles.tsRate_cell}>
                          {row.supplierTSRate
                            ? `${parseInt(row.supplierTSRate)}`
                            : "N/A"}
                        </td>
                        <td className={styles.rate_cell}>
                          ₹{(parseFloat(row.rate) || 0).toFixed(1)}
                        </td>
                        <td className={styles.total_cell}>
                          ₹
                          {formatNumberWithCommasNoDecimal(row.totalAmount || 0)}
                        </td>
                        <td className={styles.status_cell}>
                          {row.paymentRecord ? (
                            (row.paymentStatus || "Not Paid") === "Not Paid" ? (
                              <span className={styles.status_due}>Due</span>
                            ) : (
                              <span className={styles.status_paid}>Paid</span>
                            )
                          ) : (
                            <span className={styles.status_na}>N/A</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default function ProcurementHistoryPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ProcurementHistoryContent />
    </Suspense>
  );
}