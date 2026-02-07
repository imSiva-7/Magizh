"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { ToastContainer, toast } from "react-toastify";
import Link from "next/link";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/supplier.module.css";

// --- Constants ---
const SUPPLIER_TYPES = [
  { value: "", label: "Select Type" },
  { value: "Society", label: "Society" },
  { value: "Milkman", label: "Milk-man" },
  { value: "Farmer", label: "Farmer" },
  { value: "Other", label: "Other" },
];

const MIN_TS_RATE = 100;
const MAX_TS_RATE = 500;
const DEFAULT_TS_RATE = 300;

// --- Sub-Components ---

// Moved outside to prevent re-creation on every render
const FormInput = memo(
  ({
    label,
    type = "text",
    value,
    onChange,
    placeholder,
    min,
    max,
    step,
    error,
    required = false,
    disabled = false,
    inputMode = "text",
    id,
  }) => (
    <div className={styles.inputGroup}>
      <label htmlFor={id}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        inputMode={inputMode}
        autoComplete="off"
        className={`${styles.input} ${error ? styles.inputError : ""}`}
      />
      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  ),
);

FormInput.displayName = "FormInput";

// --- Main Component ---

export default function Supplier() {
  // Removed unused router
  const [createSupplier, setCreateSupplier] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchInputRef = useRef(null);
  const [searchDebounced, setSearchDebounced] = useState("");

  const initialFormState = useMemo(
    () => ({
      supplierId: null,
      supplierName: "",
      supplierType: "",
      supplierTSRate: "",
      supplierNumber: "",
      supplierAddress: "",
    }),
    [],
  );

  const [formData, setFormData] = useState(initialFormState);
  const [searchByName, setSearchByName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(searchByName);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchByName]);

  // Validation Logic
  const validateField = useCallback((field, value) => {
    switch (field) {
      case "supplierName":
        if (!value?.trim()) return "Name is required";
        if (value.trim().length < 2)
          return "Name must be at least 2 characters";
        if (value.trim().length > 100) return "Name is too long";
        return "";

      case "supplierType":
        if (!value?.trim()) return "Type is required";
        if (!SUPPLIER_TYPES.some((type) => type.value === value.trim())) {
          return "Please select a valid supplier type";
        }
        return "";

      case "supplierTSRate":
        if (!value?.toString().trim()) return "Total Solids Rate is required";

        const tsRate = parseFloat(value);
        if (isNaN(tsRate)) return "Please enter a valid number";
        if (tsRate < MIN_TS_RATE)
          return `TS Rate must be at least ${MIN_TS_RATE}`;
        if (tsRate > MAX_TS_RATE) return `TS Rate cannot exceed ${MAX_TS_RATE}`;
        // Regex to ensure max 2 decimal places
        if (!/^\d+(\.\d{0,2})?$/.test(value))
          return "Enter up to 2 decimal places";
        return "";

      case "supplierNumber":
        if (value && value.trim()) {
          const trimmedValue = value.trim();
          if (!/^\d+$/.test(trimmedValue))
            return "Phone number must contain only digits";
          if (trimmedValue.length !== 10)
            return "Phone number must be exactly 10 digits";
          // Validate Indian mobile numbers (starts with 6-9)
          if (!/^[6-9]/.test(trimmedValue))
            return "Phone number must start with 6-9";
        }
        return "";

      case "supplierAddress":
        if (value?.trim()) {
          if (value.trim().length < 5)
            return "Address must be at least 5 characters";
          if (value.trim().length > 500) return "Address is too long";
        }
        return "";

      default:
        return "";
    }
  }, []);

  // Form Validation
  const validateFullForm = useCallback(() => {
    const errors = {};

    // Iterate over keys to validate all
    const fieldsToValidate = [
      "supplierName",
      "supplierType",
      "supplierTSRate",
      "supplierNumber",
      "supplierAddress",
    ];

    fieldsToValidate.forEach((field) => {
      const error = validateField(field, formData[field]);
      if (error) errors[field] = error;
    });

    return errors;
  }, [formData, validateField]);

  // Search/Filter Logic
  const filteredEntries = useMemo(() => {
    if (!searchDebounced.trim()) return entries;

    const searchTerm = searchDebounced.toLowerCase().trim();
    return entries.filter((entry) => {
      const name = (entry.supplierName || "").toLowerCase();
      const type = (entry.supplierType || "").toLowerCase();
      const tsRate = (entry.supplierTSRate?.toString() || "").toLowerCase();
      const number = (entry.supplierNumber || "").toLowerCase();
      const address = (entry.supplierAddress || "").toLowerCase();

      return (
        name.includes(searchTerm) ||
        type.includes(searchTerm) ||
        tsRate.includes(searchTerm) ||
        number.includes(searchTerm) ||
        address.includes(searchTerm)
      );
    });
  }, [entries, searchDebounced]);

  // API Fetch
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/supplier");
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to fetch suppliers: ${errorText || `HTTP ${res.status}`}`,
        );
      }
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Fetch error:", error);
      toast.error(error.message || "Failed to load suppliers");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleInputChange = useCallback(
    (field, value) => {
      let processedValue = value;

      // Handle TS Rate: Allow digits and one dot
      if (field === "supplierTSRate") {
        // Prevent multiple dots
        if ((value.match(/\./g) || []).length > 1) {
          return;
        }
        // Allow numeric and dot only
        processedValue = value.replace(/[^0-9.]/g, "");

        // Split to check decimals
        const parts = processedValue.split(".");
        if (parts[1] && parts[1].length > 2) {
          // Cap at 2 decimal places
          processedValue = `${parts[0]}.${parts[1].substring(0, 2)}`;
        }
      }

      // Handle Phone Number: Digits only
      if (field === "supplierNumber") {
        processedValue = value.replace(/\D/g, "").substring(0, 10);
      }

      setFormData((prev) => ({
        ...prev,
        [field]: processedValue,
      }));

      // Real-time validation
      const error = validateField(field, processedValue);
      setFormErrors((prev) => ({
        ...prev,
        [field]: error || undefined,
      }));
    },
    [validateField],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = validateFullForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error("Please fix the form errors");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      supplierName: formData.supplierName.trim(),
      supplierType: formData.supplierType.trim(),
      supplierTSRate: parseFloat(formData.supplierTSRate),
      supplierNumber: formData.supplierNumber.trim(),
      supplierAddress: formData.supplierAddress.trim(),
    };

    try {
      const url = isEditing
        ? `/api/supplier?id=${formData.supplierId}`
        : "/api/supplier";

      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ||
            data.message ||
            `Submission failed (HTTP ${res.status})`,
        );
      }

      toast.success(
        isEditing
          ? "Supplier updated successfully"
          : "Supplier added successfully",
      );
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Submit error:", error);
      toast.error(
        error.message || "Failed to save supplier. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = useCallback(() => {
    setFormData(initialFormState);
    setFormErrors({});
    setIsEditing(false);
    setCreateSupplier(false);
  }, [initialFormState]);

  const handleEdit = useCallback(
    (supplier) => {
      if (isEditing && formData.supplierId === supplier._id) {
        resetForm();
        return;
      }

      setCreateSupplier(true);
      setIsEditing(true);
      setFormData({
        supplierId: supplier._id,
        supplierName: supplier.supplierName || "",
        supplierType: supplier.supplierType || "",
        supplierTSRate: supplier.supplierTSRate?.toString() || "",
        supplierNumber: supplier.supplierNumber || "",
        supplierAddress: supplier.supplierAddress || "",
      });

      setFormErrors({});

      setTimeout(() => {
        document.querySelector(`.${styles.form}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 100);
    },
    [isEditing, formData.supplierId, resetForm],
  );

  const handleDelete = async (id) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this supplier?\nThis action cannot be undone.",
      )
    ) {
      return;
    }

    setDeleteLoading(id);

    try {
      const res = await fetch(`/api/supplier?id=${id}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || `Delete failed`);
      }

      toast.success("Supplier deleted successfully");

      if (formData.supplierId === id) {
        resetForm();
      }

      fetchData();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error.message || "Failed to delete supplier");
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleClearSearch = () => {
    setSearchByName("");
    searchInputRef.current?.focus();
  };

  const formatTSRate = (rate) => {
    const parsed = parseFloat(rate);
    if (isNaN(parsed)) return "-";
    return parsed.toFixed(2);
  };

  return (
    <div className={styles.container}>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        closeOnClick
        pauseOnHover
        draggable
      />

      <div className={styles.headerSection}>
        <div className={styles.headerContent}>
          <h1>Suppliers</h1>

          {!createSupplier && (
            <div className={styles.createSection}>
              <button
                onClick={() => {
                  setCreateSupplier(true);
                  setIsEditing(false);
                  setFormData(initialFormState);
                  setFormErrors({});
                }}
                className={styles.createButton}
                disabled={loading}
                aria-label="Create new supplier"
              >
                <span className={styles.plusIcon}>+</span>
                Create New Supplier
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Form */}
      {createSupplier && (
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formHeader}>
            <h2>{isEditing ? "Edit Supplier" : "Create New Supplier"}</h2>
            {isEditing && (
              <div className={styles.editingNote}>
                Editing: <strong>{formData.supplierName}</strong>
              </div>
            )}
          </div>
          <div className={styles.formGrid}>
            <FormInput
              id="f-name"
              label="Supplier Name"
              value={formData.supplierName}
              onChange={(value) => handleInputChange("supplierName", value)}
              placeholder="Enter supplier name"
              error={formErrors.supplierName}
              required
              disabled={isSubmitting}
            />

            <div className={styles.inputGroup}>
              <label htmlFor="f-type">
                Supplier Type
                <span className={styles.required}>*</span>
              </label>
              <select
                id="f-type"
                value={formData.supplierType}
                onChange={(e) =>
                  handleInputChange("supplierType", e.target.value)
                }
                className={`${styles.selectInput} ${
                  formErrors.supplierType ? styles.inputError : ""
                }`}
                disabled={isSubmitting}
                required
              >
                {SUPPLIER_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {formErrors.supplierType && (
                <span className={styles.errorText}>
                  {formErrors.supplierType}
                </span>
              )}
            </div>

            <FormInput
              id="f-rate"
              label={`Total Solids Rate (${MIN_TS_RATE} - ${MAX_TS_RATE})`}
              value={formData.supplierTSRate}
              onChange={(value) => handleInputChange("supplierTSRate", value)}
              placeholder={`e.g., ${DEFAULT_TS_RATE}`}
              error={formErrors.supplierTSRate}
              required
              disabled={isSubmitting}
              inputMode="decimal"
            />

            {/* <FormInput
              id="f-Customrate"
              label="Custom Rate (Rs: 39)" 
              type="number"
              value={formData.supplierNumber}
              onChange={(value) => handleInputChange("supplierNumber", value)}
              placeholder="10-digit phone number"
              error={formErrors.supplierNumber}
              disabled={isSubmitting}
              inputMode="numeric"
            /> */}
            <FormInput
              id="f-phone"
              label="Phone Number"
              type="tel"
              value={formData.supplierNumber}
              onChange={(value) => handleInputChange("supplierNumber", value)}
              placeholder="10-digit phone number"
              error={formErrors.supplierNumber}
              disabled={isSubmitting}
              inputMode="numeric"
            />

            {/* <FormInput
              id="f-addr"
              label="Address"
              value={formData.supplierAddress}
              onChange={(value) => handleInputChange("supplierAddress", value)}
              placeholder="Enter complete address"
              error={formErrors.supplierAddress}
              disabled={isSubmitting}
            /> */}
          </div>

          <div className={styles.formActions}>
            <button
              type="submit"
              disabled={isSubmitting}
              className={styles.submitButton}
            >
              {isSubmitting ? (
                <>
                  <span className={styles.buttonSpinner}></span>
                  {isEditing ? "Updating..." : "Creating..."}
                </>
              ) : isEditing ? (
                "Update Supplier"
              ) : (
                "Add Supplier"
              )}
            </button>

            <button
              type="button"
              onClick={resetForm}
              className={styles.cancelButton}
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className={styles.searchSection}>
        <div className={styles.searchWrapper}>
          <label htmlFor="searchInput" className={styles.searchLabel}>
            Search Suppliers:
          </label>
          <div className={styles.searchInputGroup}>
            <input
              id="searchInput"
              ref={searchInputRef}
              type="text"
              placeholder="Search by name, type, rate..."
              value={searchByName}
              onChange={(e) => setSearchByName(e.target.value)}
              className={styles.searchInput}
              disabled={loading}
              autoComplete="off"
            />
            {searchByName && (
              <button
                type="button"
                onClick={handleClearSearch}
                className={styles.clearSearchButton}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div className={styles.searchStats}>
          {loading ? (
            <span className={styles.loadingText}>Searching...</span>
          ) : (
            <>
              <span className={styles.resultCount}>
                Showing {filteredEntries.length} of {entries.length} supplier
                {entries.length !== 1 ? "s" : ""}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Suppliers Table */}
      <div className={styles.tableContainer}>
        <div className={styles.tableWrapper}>
          <table className={styles.supplierTable}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">TS Rate</th>
                <th scope="col">Phone</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && entries.length === 0 ? (
                <tr>
                  <td colSpan="5" className={styles.loadingCell}>
                    <div className={styles.loadingContent}>
                      <div className={styles.tableSpinner}></div>
                      <span>Loading suppliers...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan="5" className={styles.noDataCell}>
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>📭</div>
                      <p className={styles.emptyText}>
                        {searchDebounced
                          ? `No suppliers found for "${searchDebounced}"`
                          : "No suppliers found"}
                      </p>
                      {!searchDebounced && !createSupplier && (
                        <button
                          onClick={() => {
                            setCreateSupplier(true);
                            setIsEditing(false);
                            setFormData(initialFormState);
                          }}
                          className={styles.createEmptyButton}
                        >
                          Create Your First Supplier
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((item) => (
                  <tr key={item._id} className={styles.tableRow}>
                    <td className={styles.nameCell}>
                      <Link
                        href={`/supplier/procurement?supplierId=${item._id}`}
                        className={styles.supplierName}
                      >
                        {item.supplierName || "-"}
                      </Link>
                    </td>
                    <td className={styles.typeCell}>
                      <span
                        className={`${styles.typeBadge} ${
                          styles[
                            `type-${item.supplierType?.toLowerCase() || "other"}`
                          ]
                        }`}
                      >
                        {item.supplierType || "-"}
                      </span>
                    </td>
                    <td className={styles.tsRateCell}>
                      {formatTSRate(item.supplierTSRate)}
                    </td>
                    <td className={styles.phoneCell}>
                      {item.supplierNumber || "-"}
                    </td>
                    <td className={styles.actionsCell}>
                      <div className={styles.actionButtons}>
                        <button
                          onClick={() => handleEdit(item)}
                          className={`${styles.editButton} ${
                            isEditing && formData.supplierId === item._id
                              ? styles.editingActive
                              : ""
                          }`}
                          disabled={loading || deleteLoading === item._id}
                          title={
                            isEditing && formData.supplierId === item._id
                              ? "Cancel"
                              : "Edit"
                          }
                        >
                          {isEditing && formData.supplierId === item._id
                            ? "Cancel"
                            : "Edit"}
                        </button>
                        <button
                          onClick={() => handleDelete(item._id)}
                          className={styles.deleteButton}
                          disabled={
                            deleteLoading === item._id || loading || isEditing
                          }
                          title={isEditing ? "Delete disabled" : " Delete"}
                        >
                          {deleteLoading === item._id ? (
                            <span className={styles.deleteSpinner}></span>
                          ) : (
                            "Delete"
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
