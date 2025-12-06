"use client";

import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useMemo } from "react";
import { getTodayDate } from "@/utils/dateUtils";
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
      className={error ? styles.inputError : ""}
    />
    {error && <span className={styles.errorText}>{error}</span>}
  </div>
);

export default function Supplier() {
  const router = useRouter();
  const [createSupplier, setCreateSupplier] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialFormState = {
    supplierId: null,
    supplierFirstName: "",
    supplierLastName: "",
    supplierNumber: "",
    supplierAddress: "",
  };

  const [formData, setFormData] = useState(initialFormState);
  const [searchByName, setSearchByName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(null);

  // Form validation
  const validateForm = () => {
    const errors = {};

    if (!formData.supplierFirstName?.trim()) {
      errors.supplierFirstName = "First name is required";
    } else if (formData.supplierFirstName.trim().length < 2) {
      errors.supplierFirstName = "First name must be at least 2 characters";
    }

    if (
      formData.supplierNumber &&
      formData.supplierNumber?.trim().length <= 9
    ) {
      // errors.supplierNumber = "Phone number is required";
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(formData.supplierNumber.trim())) {
        errors.supplierNumber = "Please enter a valid 10-digit phone number";
      }
    }

    if (
      formData.supplierAddress?.trim() &&
      formData.supplierAddress.trim().length < 5
    ) {
      errors.supplierAddress = "Address must be at least 5 characters";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Filter entries with memoization
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (!searchByName.trim()) return true;
      const fullName = `${entry.supplierFirstName || ""} ${
        entry.supplierLastName || ""
      }`.toLowerCase();
      const searchTerm = searchByName.toLowerCase().trim();
      return (
        fullName.includes(searchTerm) ||
        entry.supplierNumber?.includes(searchTerm) ||
        entry.supplierAddress?.toLowerCase().includes(searchTerm)
      );
    });
  }, [entries, searchByName]);

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

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Clear error for this field when user starts typing
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the form errors");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      date: getTodayDate(),
      supplierFirstName: formData.supplierFirstName.trim(),
      supplierLastName: formData.supplierLastName.trim(),
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

      const data = await res.json().catch(() => ({}));

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

  const handleEdit = (supplier) => {
    setCreateSupplier(true);
    setIsEditing(true);
    setFormData({
      supplierId: supplier._id,
      supplierFirstName: supplier.supplierFirstName || "",
      supplierLastName: supplier.supplierLastName || "",
      supplierNumber: supplier.supplierNumber || "",
      supplierAddress: supplier.supplierAddress || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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

      const data = await res.json().catch(() => ({}));

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

  const resetForm = () => {
    setFormData(initialFormState);
    setFormErrors({});
    setIsEditing(false);
    setCreateSupplier(false);
  };

  const handleCancel = () => {
    resetForm();
  };

  const handleClearSearch = () => {
    setSearchByName("");
  };

  const handleProcurementHistory = () => {
    router.push("https://magizhdairy.vercel.app/productions/history");
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
          <div className={styles.headerActions}>
            <button
              type="button"
              onClick={handleProcurementHistory}
              className={styles.historyButton}
              disabled={loading}
            >
              PRODUCTION History
            </button>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className={styles.searchSection}>
        <div className={styles.searchWrapper}>
          <input
            type="text"
            placeholder="Search by name, phone, or address..."
            value={searchByName}
            onChange={(e) => setSearchByName(e.target.value)}
            className={styles.searchInput}
            disabled={loading}
          />
          {searchByName && (
            <button
              onClick={handleClearSearch}
              className={styles.clearSearchButton}
              aria-label="Clear search"
              disabled={loading}
            >
              ✕
            </button>
          )}
        </div>
        {filteredEntries.length > 0 && (
          <span className={styles.resultCount}>
            {filteredEntries.length} supplier
            {filteredEntries.length !== 1 ? "s" : ""} found
          </span>
        )}
      </div>

      {/* Create Button */}
      {!createSupplier && (
        <div className={styles.createSection}>
          <button
            onClick={() => setCreateSupplier(true)}
            className={styles.createButton}
            disabled={loading}
          >
            + Create New Supplier
          </button>
        </div>
      )}

      {/* Create/Edit Form */}
      {createSupplier && (
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formHeader}>
            <h2>{isEditing ? "Edit Supplier" : "Create New Supplier"}</h2>
            <div className={styles.formHeaderActions}>
              {/* <button
                type="button"
                onClick={handleProcurementHistory}
                className={styles.historyButton}
                disabled={isSubmitting}
              >
                PRODUCTION History
              </button> */}
            </div>
          </div>

          <div className={styles.formGrid}>
            <NumberInput
              label="First Name"
              type="text"
              value={formData.supplierFirstName}
              onChange={(value) =>
                handleInputChange("supplierFirstName", value)
              }
              placeholder="Enter first name"
              error={formErrors.supplierFirstName}
              required
              disabled={isSubmitting}
            />

            <NumberInput
              label="Last Name"
              type="text"
              value={formData.supplierLastName}
              onChange={(value) => handleInputChange("supplierLastName", value)}
              placeholder="Enter last name (optional)"
              disabled={isSubmitting}
            />

            <NumberInput
              label="Phone Number"
              type="tel"
              value={formData.supplierNumber}
              onChange={(value) => handleInputChange("supplierNumber", value)}
              placeholder="10-digit phone number (optional)"
              error={formErrors.supplierNumber}
              disabled={isSubmitting}
            />

            <NumberInput
              label="Address"
              type="text"
              value={formData.supplierAddress}
              onChange={(value) => handleInputChange("supplierAddress", value)}
              placeholder="Enter address (optional)"
              error={formErrors.supplierAddress}
              disabled={isSubmitting}
            />
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
              onClick={handleCancel}
              className={styles.cancelButton}
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Suppliers Table */}
      <div className={styles.tableContainer}>
        <div className={styles.tableWrapper}>
          <table className={styles.supplierTable}>
            <thead>
              <tr>
                <th>First Name</th>
                <th>Last Name</th>
                <th>Phone Number</th>
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
                      {searchByName
                        ? "No matching suppliers found"
                        : "No suppliers found"}
                      {!searchByName && !loading && !createSupplier && (
                        <button
                          onClick={() => setCreateSupplier(true)}
                          className={styles.createEmptyButton}
                        >
                          Create First Supplier
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((item) => (
                  <tr key={item._id} className={styles.tableRow}>
                    <td>{item.supplierFirstName || "-"}</td>
                    <td>{item.supplierLastName || "-"}</td>
                    <td>{item.supplierNumber || "-"}</td>
                    <td>{item.supplierAddress || "-"}</td>
                    <td>
                      <div className={styles.actionButtons}>
                        <button
                          onClick={() =>
                            router.push(`/supplier/${item._id}/procurement`)
                          }
                          className={styles.procurementButton}
                          disabled={true || loading}
                          title="Add procurement for this supplier"
                        >
                          Add Procurement
                        </button>
                        <button
                          onClick={() => handleEdit(item)}
                          className={styles.editButton}
                          disabled={loading}
                          title="Edit supplier"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item._id)}
                          className={styles.deleteButton}
                          disabled={deleteLoading === item._id || loading}
                          title="Delete supplier"
                        >
                          {deleteLoading === item._id ? (
                            <>
                              <span className={styles.deleteSpinner}></span>
                              Deleting...
                            </>
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
