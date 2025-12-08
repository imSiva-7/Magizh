"use client";

import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
// import { getTodayDate } from "@/utils/dateUtils";
import styles from "@/css/supplier.module.css";

const NumberInput = ({
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
}) => (
  <div className={styles.inputGroup}>
    <label>
      {label}
      {required && <span className={styles.required}>*</span>}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={`${styles.input} ${error ? styles.inputError : ""}`}
    />
    {error && <span className={styles.errorText}>{error}</span>}
  </div>
);

const SUPPLIER_TYPES = [
  { value: "", label: "Select Type" },
  { value: "Society", label: "Society" },
  { value: "Milkman", label: "Milk-man" },
  { value: "Farmer", label: "Farmer" },
  { value: "Other", label: "Other" },
];

export default function Supplier() {
  const router = useRouter();
  const [createSupplier, setCreateSupplier] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchInputRef = useRef(null);
  const [searchDebounced, setSearchDebounced] = useState("");

  // Wrap initialFormState in useMemo
  const initialFormState = useMemo(
    () => ({
      supplierId: null,
      supplierName: "",
      supplierType: "",
      supplierNumber: "",
      supplierAddress: "",
    }),
    []
  ); // Empty dependency array means this never changes

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

  // Separate validation for individual fields
  const validateField = useCallback((field, value) => {
    switch (field) {
      case "supplierName":
        if (!value?.trim()) return "Name is required";
        if (value.trim().length < 2)
          return "Name must be at least 2 characters";
        return "";

      case "supplierType":
        if (!value?.trim()) return "Type is required";
        if (value.trim().length < 2)
          return "Type must be at least 2 characters";
        return "";

      case "supplierNumber":
        if (value && value.trim()) {
          const phoneRegex = /^[0-9]{10}$/;
          if (!phoneRegex.test(value.trim())) {
            return "Please enter a valid 10-digit phone number";
          }
        }
        return "";

      case "supplierAddress":
        if (value?.trim() && value.trim().length < 5) {
          return "Address must be at least 5 characters";
        }
        return "";

      default:
        return "";
    }
  }, []);

  // Full form validation only when submitting
  const validateFullForm = useCallback(() => {
    const errors = {};

    const nameError = validateField("supplierName", formData.supplierName);
    if (nameError) errors.supplierName = nameError;

    const typeError = validateField("supplierType", formData.supplierType);
    if (typeError) errors.supplierType = typeError;

    const phoneError = validateField("supplierNumber", formData.supplierNumber);
    if (phoneError) errors.supplierNumber = phoneError;

    const addressError = validateField(
      "supplierAddress",
      formData.supplierAddress
    );
    if (addressError) errors.supplierAddress = addressError;

    return errors;
  }, [formData, validateField]);

  // Filter entries with memoization
  const filteredEntries = useMemo(() => {
    if (!searchDebounced.trim()) return entries;

    const searchTerm = searchDebounced.toLowerCase().trim();
    return entries.filter((entry) => {
      const name = (entry.supplierName || "").toLowerCase();
      const type = (entry.supplierType || "").toLowerCase();
      const number = (entry.supplierNumber || "").toLowerCase();
      const address = (entry.supplierAddress || "").toLowerCase();

      return (
        name.includes(searchTerm) ||
        type.includes(searchTerm) ||
        number.includes(searchTerm) ||
        address.includes(searchTerm)
      );
    });
  }, [entries, searchDebounced]);

  // Fetch suppliers
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/supplier");
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `HTTP ${res.status}: ${errorText || "Failed to fetch suppliers"}`
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
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));

      // Validate only the changed field in real-time
      const error = validateField(field, value);
      setFormErrors((prev) => ({
        ...prev,
        [field]: error || undefined,
      }));
    },
    [validateField]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate all fields before submitting
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || data.message || `HTTP ${res.status}: Submission failed`
        );
      }

      toast.success(
        isEditing
          ? "Supplier updated successfully"
          : "Supplier added successfully"
      );
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Submit error:", error);
      toast.error(
        error.message || "Failed to save supplier. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = useCallback((supplier) => {
    setCreateSupplier(true);
    setIsEditing(true);
    setFormData({
      supplierId: supplier._id,
      supplierName: supplier.supplierName || "",
      supplierType: supplier.supplierType || "",
      supplierNumber: supplier.supplierNumber || "",
      supplierAddress: supplier.supplierAddress || "",
    });
    // Clear any existing errors when editing
    setFormErrors({});
  }, []);

  const handleDelete = async (id) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this supplier?\nThis action cannot be undone."
      )
    ) {
      return;
    }

    setDeleteLoading(id);

    try {
      const res = await fetch(`/api/supplier?id=${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || data.message || `HTTP ${res.status}: Delete failed`
        );
      }

      toast.success("Supplier deleted successfully");

      // Reset form if editing the deleted supplier
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

  const resetForm = useCallback(() => {
    setFormData(initialFormState);
    setFormErrors({});
    setIsEditing(false);
    setCreateSupplier(false);
  }, [initialFormState]); // Now initialFormState is memoized, so this is stable

  const handleCancel = () => {
    resetForm();
  };

  const handleClearSearch = () => {
    setSearchByName("");
    searchInputRef.current?.focus();
  };

  const handleProcurementHistory = () => {
    router.push("/productions/history");
  };

  const handleFocusSearch = () => {
    searchInputRef.current?.focus();
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
                  setFormErrors({}); // Clear any errors
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
          </div>
          <div className={styles.formGrid}>
            <NumberInput
              label="Supplier Name"
              type="text"
              value={formData.supplierName}
              onChange={(value) => handleInputChange("supplierName", value)}
              placeholder="Enter supplier name"
              error={formErrors.supplierName}
              required
              disabled={isSubmitting}
              autoFocus
            />

            <div className={styles.inputGroup}>
              <label>
                Supplier Type
                <span className={styles.required}>*</span>
              </label>
              <select
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

            <NumberInput
              label="Phone Number"
              type="tel"
              value={formData.supplierNumber}
              onChange={(value) => handleInputChange("supplierNumber", value)}
              placeholder="10-digit phone number"
              error={formErrors.supplierNumber}
              disabled={isSubmitting}
            />

            <NumberInput
              label="Address"
              type="text"
              value={formData.supplierAddress}
              onChange={(value) => handleInputChange("supplierAddress", value)}
              placeholder="Enter complete address"
              error={formErrors.supplierAddress}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.formActions}>
            <button
              type="submit"
              disabled={isSubmitting}
              className={styles.submitButton}
              aria-label={isEditing ? "Update supplier" : "Add supplier"}
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
              onClick={handleCancel}
              className={styles.cancelButton}
              disabled={isSubmitting}
              aria-label="Cancel"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className={styles.searchSection}>
        <div className={styles.searchWrapper}>
          <label
            htmlFor="searchInput"
            className={styles.searchLabel}
            onClick={handleFocusSearch}
          >
            Search Suppliers:
          </label>
          <div className={styles.searchInputGroup}>
            <input
              id="searchInput"
              ref={searchInputRef}
              type="text"
              placeholder="Type to search by name, type, phone, or address..."
              value={searchByName}
              onChange={(e) => setSearchByName(e.target.value)}
              className={styles.searchInput}
              disabled={loading}
              aria-label="Search suppliers"
            />
            {searchByName && (
              <button
                type="button"
                onClick={handleClearSearch}
                className={styles.clearSearchButton}
                aria-label="Clear search"
                disabled={loading}
              >
                ✕
              </button>
            )}
          </div>
          {searchDebounced &&
            filteredEntries.length === 0 &&
            entries.length > 0 && (
              <div className={styles.searchHint}>
                No suppliers match {`"${searchDebounced}"`}
              </div>
            )}
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
              {searchDebounced && (
                <span className={styles.searchTerm}>
                  for <strong>{`"${searchDebounced}"`}</strong>
                </span>
              )}
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
                <th>Name</th>
                <th>Type</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Actions</th>
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
                            setFormErrors({});
                          }}
                          className={styles.createEmptyButton}
                        >
                          Create Your First Supplier
                        </button>
                      )}
                      {searchDebounced && (
                        <button
                          onClick={handleClearSearch}
                          className={styles.clearSearchLink}
                        >
                          Clear search to see all suppliers
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((item) => (
                  <tr key={item._id} className={styles.tableRow}>
                    <td className={styles.nameCell}>
                      <span className={styles.supplierName}>
                        {item.supplierName || "-"}
                      </span>
                    </td>
                    <td className={styles.typeCell}>
                      <span
                        className={`${styles.typeBadge} ${
                          styles[`type-${item.supplierType?.toLowerCase()}`]
                        }`}
                      >
                        {item.supplierType || "-"}
                      </span>
                    </td>
                    <td className={styles.phoneCell}>
                      {item.supplierNumber || "-"}
                    </td>
                    <td className={styles.addressCell}>
                      {item.supplierAddress || "-"}
                    </td>
                    <td className={styles.actionsCell}>
                      <div className={styles.actionButtons}>
                        <button
                          onClick={() =>
                            router.push(`/supplier/procurement?supplierId=${item._id}`)
                          }
                          className={styles.procurementButton}
                          // disabled={true}
                          disabled={loading || deleteLoading === item._id}
                          title="Add procurement for this supplier"
                          aria-label={`Add procurement for ${item.supplierName}`}
                        >
                          <span className={styles.buttonIcon}>➕</span>
                        </button>
                        <button
                          onClick={() => handleEdit(item)}
                          className={styles.editButton}
                          disabled={loading || deleteLoading === item._id}
                          title={`Edit ${item.supplierName}`}
                          aria-label={`Edit ${item.supplierName}`}
                        >
                          <span className={styles.buttonIcon}>✏️</span>
                        </button>
                        <button
                          onClick={() => handleDelete(item._id)}
                          className={styles.deleteButton}
                          disabled={deleteLoading === item._id || loading}
                          title={`Delete ${item.supplierName}`}
                          aria-label={`Delete ${item.supplierName}`}
                        >
                          {deleteLoading === item._id ? (
                            <>
                              <span className={styles.deleteSpinner}></span>
                            </>
                          ) : (
                            <>
                              <span className={styles.buttonIcon}>🗑️</span>
                            </>
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
