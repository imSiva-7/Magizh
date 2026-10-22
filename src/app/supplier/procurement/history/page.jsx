"use client";
import DataSkeleton from "@/components/DataSkeleton";
import { formatDateForDisplay, getIndiaTimePeriod as getCurrentTimePeriod } from "@/lib/india-date.mjs";

import { statNumberTone } from "@/lib/stat-number-tone";
import { useEntryForm } from "@/lib/use-entry-form";
import CategoryBadge from "@/components/CategoryBadge";
import { formatStat } from "@/utils/formatNumberWithComma";
import StatTrendBackground from "@/components/StatTrendBackground";
import trendStyles from "@/css/stat-trend.module.css";
import { procurementCardTrends } from "@/lib/history-card-trends";

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
import { getProcurementSummary } from "@/utils/procurementSummary";
import Link from "next/link";

const INITIAL_FILTERS = {
  startDate: getCurrentMonthStartDate(),
  endDate: getTodayDate(),
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

const LoadingSpinner = () => <DataSkeleton label="Loading procurement records..." />;

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
    const from = formatDateForDisplay(startDate);
    const to = formatDateForDisplay(endDate);
    return from === to ? from : `${from} to ${to}`;
  }
  if (startDate)
    return `From ${formatDateForDisplay(startDate)}`;
  if (endDate) return `Till ${formatDateForDisplay(endDate)}`;
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

const StatItem = ({ label, value, unit, prefix = "", trend, tone = "milk" }) => (
  <div className={`${styles.stat_item} ${trendStyles.card}`}>
    <StatTrendBackground points={trend} tone={tone} />

    <span className={styles.stat_label}>{label}</span>
    <span data-stat-tone={statNumberTone(label, value)} className={styles.stat_value}>
      {prefix}
      {value}
      {unit && <span className={styles.stat_unit}>{unit}</span>}
    </span>
  </div>
);

// ========== FORM SUBCOMPONENTS ==========
const FormInput = ({ label, error, required, readOnly, ...props }) => (
  <div className={styles.form_input_group}>
    <label htmlFor={`history-entry-${props.name}`} className={styles.form_label}>
      {label}
      {required && <span aria-hidden="true" className={styles.required_asterisk}>*</span>}
    </label>
    <input
      className={`${styles.form_input} ${error ? styles.input_error : ""} ${
        readOnly ? styles.readonly_input : ""
      }`}
      autoComplete="off"
      id={`history-entry-${props.name}`}
      aria-label={label}
      aria-required={Boolean(required)}
      aria-invalid={Boolean(error)}
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
  const [loadError, setLoadError] = useState("");
  const historyRequestRef = useRef(null);

  // ---------- Add Procurement state ----------
  const [showAddForm, setShowAddForm] = useEntryForm();
  const [suppliers, setSuppliers] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [suppliersFetched, setSuppliersFetched] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [formData, setFormData] = useState(makeInitialForm);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const addBusyRef = useRef(false);
  const searchInputRef = useRef(null);

  // Debounced supplier search
  const [supplierSearchDebounced, setSupplierSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSupplierSearchDebounced(supplierSearch), 250);
    return () => clearTimeout(t);
  }, [supplierSearch]);

  // ---- History fetch ----
  const fetchAllData = useCallback(async () => {
    historyRequestRef.current?.abort();
    const controller = new AbortController();
    historyRequestRef.current = controller;
    const error = validateDateRange(filters.startDate, filters.endDate);
    if (error) {
      toast.error(error);
      setLoadError(error);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setLoadError("");
      const queryParams = new URLSearchParams();
      if (filters.startDate) queryParams.append("startDate", filters.startDate);
      if (filters.endDate) queryParams.append("endDate", filters.endDate);

      const response = await fetch(
        `/api/supplier/procurement/history?${queryParams}`,
        { cache: "no-store", signal: controller.signal },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || "Failed to load procurement history",
        );
      }

      const data = await response.json();
      if (controller.signal.aborted) return;
      const responseData = Array.isArray(data) ? data : data.data || data;

      if (Array.isArray(responseData)) {
        setProcurementData(responseData);
        setLastFetchTime(new Date());
      } else {
        throw new Error("Invalid data format received from server");
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Load error:", error);
      toast.error(error.message || "Failed to load procurement history");
      setLoadError(error.message || "Failed to load procurement history");
      setProcurementData([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchAllData();
    return () => historyRequestRef.current?.abort();
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
      setSuppliersFetched(true);
    }
  }, []);

  // Load suppliers the first time the form is opened
  useEffect(() => {
    if (showAddForm && !suppliersFetched && !suppliersLoading) {
      fetchSuppliers();
    }
  }, [showAddForm, suppliersFetched, suppliersLoading, fetchSuppliers]);

  // Focus the search input when form opens
  useEffect(() => {
    if (showAddForm) {
      const timer = setTimeout(() => {
        searchInputRef.current?.closest("[data-procurement-form]")?.scrollIntoView({ block: "start" });
        searchInputRef.current?.focus({ preventScroll: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showAddForm]);

  // ---- Filtered supplier list ----
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearchDebounced.trim()) return suppliers;
    const term = supplierSearchDebounced.toLowerCase().trim();
    return suppliers
      .filter((s) => {
        return [s.supplierName, s.supplierType, s.supplierPhone, s.supplierPhoneNumber, s.supplierContact]
          .some((value) => String(value || "").toLowerCase().includes(term));
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
    if (addBusyRef.current) return;
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
    if (addBusyRef.current) return;
    if (!validateAddForm()) {
      toast.error("Please fix the form errors");
      return;
    }

    addBusyRef.current = true;
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

      // Keep the supplier, date, and time period for consecutive entries.
      setFormData({
        ...makeInitialForm(),
        date: formData.date, // preserve the same date for consecutive entries
        time: formData.time,
      });
      setFormErrors({});

      // Refresh the history table
      await fetchAllData();
    } catch (error) {
      console.error("Add procurement error:", error);
      toast.error(error.message || "Failed to save record");
    } finally {
      addBusyRef.current = false;
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
        ? formatDateForDisplay(row.date)
        : `(${dateCounts[dateKey]})`;

      return { ...row, displayDate };
    });
  }, [procurementData]);

  const summary = useMemo(() => getProcurementSummary(procurementData), [procurementData]);
  const cardTrends = useMemo(() => procurementCardTrends(procurementData), [procurementData]);


  const handleExport = (format) => {
    if (!procurementData.length) {
      toast.error("No data to export");
      return;
    }

    const dateRange = {
      start:
        formatDateForDisplay(procurementData.at(-1).date) || "----",
      end:
        formatDateForDisplay(procurementData[0].date) || "----",
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
        <div className={styles.header_title}>
          <h1>Procurement History</h1>
        </div>
        {!showAddForm && (
          <button data-button="primary" data-button-placement="floating"
            type="button"
            className={styles.add_procurement_btn}
            onClick={handleOpenAddForm}
            aria-expanded={showAddForm}
            aria-controls="new-procurement-form"
          >
            <span className={styles.plus}>+</span> Add Procurement
          </button>
        )}
      </div>

      {/* ==================== ADD PROCUREMENT ==================== */}
      {showAddForm && (
        <div id="new-procurement-form" data-entry-form data-procurement-form className={styles.add_section}>
          <div className={styles.add_header}>
            <h2>Add Procurement</h2>
            <button data-button="icon"
              type="button"
              onClick={handleCloseAddForm}
              className={styles.close_add_btn}
              aria-label="Close"
              disabled={submitting}
            >
              ✕
            </button>
          </div>

          {/* Step 1 — supplier search */}
          {!selectedSupplier && (
            <div className={styles.supplier_picker}>
              <label htmlFor="history-supplier-search" className={styles.form_label}>Search Supplier</label>
              <input
                id="history-supplier-search"
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
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); handlePickSupplier(s); } }}
                    >
                      <div className={styles.supplier_result_main}>
                        <span className={styles.supplier_result_name}>
                          {s.supplierName}
                        </span>
                        {s.isHeadSupplier && (
                          <CategoryBadge kind="supplierRole" value="Head" />
                        )}
                        {s.isChildSupplier && !s.isHeadSupplier && (
                          <CategoryBadge kind="supplierRole" value="Child" />
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
                <button data-button="ghost"
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
                    disabled={submitting}
                    required
                  />

                  <div className={styles.form_input_group}>
                    <label htmlFor="history-entry-time" className={styles.form_label}>
                      Time Period
                      <span aria-hidden="true" className={styles.required_asterisk}>*</span>
                    </label>
                    <select
                      id="history-entry-time"
                      name="time"
                      value={formData.time}
                      onChange={handleFormInputChange}
                      className={styles.form_select}
                      disabled={submitting}
                    >
                      <option value="AM">AM (Morning)</option>
                      <option value="PM">PM (Evening)</option>
                    </select>
                  </div>

                  <FormInput
                    label="Milk Quantity (L)"
                    name="milkQuantity"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="20.5"
                    value={formData.milkQuantity}
                    onChange={handleFormInputChange}
                    error={formErrors.milkQuantity}
                    disabled={submitting}
                    required
                  />

                  <FormInput
                    label="Fat %"
                    name="fatPercentage"
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="3.5"
                    value={formData.fatPercentage}
                    onChange={handleFormInputChange}
                    error={formErrors.fatPercentage}
                    disabled={submitting}
                    required
                  />

                  <FormInput
                    label="SNF %"
                    name="snfPercentage"
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="8.5"
                    value={formData.snfPercentage}
                    onChange={handleFormInputChange}
                    error={formErrors.snfPercentage}
                    disabled={submitting}
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
                    name="rate"
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

                <div className={styles.add_form_actions}>
                  <button data-button="primary"
                    type="submit"
                    disabled={submitting}
                    className={styles.submit_btn}
                  >
                    {submitting ? "Saving..." : "Add Record"}
                  </button>
                  <button data-button="secondary"
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
      <form data-filter="card" onSubmit={handleFilterSubmit} className={styles.filter_card}>
        <div data-filter="title" className={styles.filter_title}>
          <h2>Filter by Date Range</h2>
        </div>

        <div data-filter="content" className={styles.filter_content}>
          <div data-filter="section" className={styles.date_section}>
            <div data-filter="grid" className={styles.date_inputs_grid}>
              <div data-filter="field" className={styles.date_field}>
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
              <div data-filter="field" className={styles.date_field}>
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

          <div data-filter="actions" className={styles.filter_actions}>
            <div data-filter="buttons" className={styles.filter_buttons}>
              <button data-button="secondary"
                type="button"
                onClick={resetFilters}
                className={`${styles.btn} ${styles.btn_primary}`}
              >
                Reset
              </button>
              <button data-button="secondary"
                type="button"
                onClick={clearFilters}
                className={`${styles.btn} ${styles.btn_secondary}`}
                disabled={!filters.startDate && !filters.endDate}
              >
                Clear
              </button>
              <button data-button="secondary"
                type="button"
                onClick={todayFilter}
                className={`${styles.btn} ${styles.btn_primary2}`}
              >
                Today
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
                label="Milk / day"
                trend={cardTrends.milk}
                value={formatNumberWithCommas(summary.avgMilkDaily, 2)}
                unit="L/day"
              />
              <StatItem
                label="Fat / SNF"
                trend={cardTrends.quality}
                value={`${formatNumberWithCommas(summary.avgFat, 1)} / ${formatNumberWithCommas(summary.avgSnf, 1)}`}
                unit="%"
              />
              <StatItem
                label="Value / day"
                trend={cardTrends.amount}
                tone="amount"
                value={formatStat(summary.avgRateDaily)}
                unit="/day"
                prefix="₹"
              />
              <StatItem
                label="Avg Rate"
                trend={cardTrends.rate}
                tone="amount"
                value={formatNumberWithCommas(summary.avgRate, 2)}
                unit="/L"
                prefix="₹"
              />
              <StatItem
                label="Milk"
                trend={cardTrends.milk}
                value={formatNumberWithCommas(summary.milk, 2)}
                unit="L"


              />
              <StatItem
                label="Value"
                trend={cardTrends.amount}
                tone="amount"
                value={formatStat(summary.amount)}
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
            <button data-button="secondary"
              onClick={() => handleExport("csv")}
              className={styles.exportBtn}
              disabled={!procurementData.length}
            >
              Export as CSV
            </button>
            <button data-button="secondary"
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
      {loadError && <div className={styles.error_alert} role="alert"><span>{loadError}</span><button data-button="secondary" type="button" onClick={fetchAllData} className={styles.clear_filter_btn}>Try again</button></div>}
      <div className={styles.table_wrapper}>
        {!loading && !loadError && summary.count === 0 ? (
          <div className={styles.empty_state}>
            <span className={styles.empty_icon}>🔍</span>
            <h3 className={styles.empty_title}>No Records Found</h3>
            <p className={styles.empty_message}>
              No procurement records found for the selected date range
            </p>
            <button data-button="secondary"
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
