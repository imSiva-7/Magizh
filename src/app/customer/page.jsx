"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { ToastContainer, toast } from "react-toastify";
import Link from "next/link";
import { useSession } from "next-auth/react"; // <-- added
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/customer.module.css";

// --- Constants ---
const CUSTOMER_TYPES = [
  { value: "", label: "Select Type" },
  { value: "Retail", label: "Retail" },
  { value: "Wholesale", label: "Wholesale" },
  { value: "Distributor", label: "Distributor" },
  { value: "Restaurant", label: "Restaurant" },
];

const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const PRICE_RANGES = {
  milkPrice: { min: 35, max: 50, label: "Milk" },
  butterPrice: { required: true, label: "Butter" },
  freshCreamPrice: { min: 300, max: 400, label: "Fresh Cream" },
  curdPrice: { min: 60, max: 100, label: "Curd" },
  gheePrice: { min: 400, max: 1000, label: "Ghee" },
  softPaneerPrice: { min: 300, max: 500, label: "Soft Paneer" },
  premiumPaneerPrice: { min: 300, max: 500, label: "Premium Paneer" },
};

// --- Sub-Components ---
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

export default function Customer() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [createCustomer, setCreateCustomer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchInputRef = useRef(null);
  const [searchDebounced, setSearchDebounced] = useState("");
  const [openActionMenuId, setOpenActionMenuId] = useState(null);

  const initialFormState = useMemo(
    () => ({
      customerId: null,
      customerName: "",
      customerType: "",
      milkPrice: "",
      butterPrice: "",
      freshCreamPrice: "",
      curdPrice: "",
      gheePrice: "",
      softPaneerPrice: "",
      premiumPaneerPrice: "",
      customerNumber: "",
      customerGST: "",
      customerAddress: "",
    }),
    [],
  );

  const [formData, setFormData] = useState(initialFormState);
  const [searchByName, setSearchByName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(null);

  // Close action menu when clicking outside
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
      case "customerName":
        if (!value?.trim()) return "Name is required";
        if (value.trim().length < 2)
          return "Name must be at least 2 characters";
        if (value.trim().length > 100) return "Name is too long";
        return "";

      case "customerType":
        if (!value?.trim()) return "Type is required";
        if (!CUSTOMER_TYPES.some((type) => type.value === value.trim())) {
          return "Please select a valid customer type";
        }
        return "";

      case "customerNumber":
        if (value && value.trim()) {
          const trimmedValue = value.trim();
          if (!/^\d+$/.test(trimmedValue))
            return "Phone number must contain only digits";
          if (trimmedValue.length !== 10)
            return "Phone number must be exactly 10 digits";
          if (!/^[6-9]/.test(trimmedValue))
            return "Phone number must start with 6-9";
        }
        return "";

      case "customerAddress":
        if (value?.trim()) {
          if (value.trim().length < 5)
            return "Address must be at least 5 characters";
          if (value.trim().length > 500) return "Address is too long";
        }
        return "";

      case "milkPrice":
      case "butterPrice":
      case "freshCreamPrice":
      case "curdPrice":
      case "gheePrice":
      case "softPaneerPrice":
      case "premiumPaneerPrice": {
        const rules = PRICE_RANGES[field];
        if (!rules) return "";

        if (!value || value.toString().trim() === "") {
          return `${rules.label} price is required`;
        }

        const numValue = Number(value);
        if (isNaN(numValue)) {
          return `${rules.label} price must be a valid number`;
        }
        if (numValue < 0) {
          return `${rules.label} price cannot be negative`;
        }

        return "";
      }

      default:
        return "";
    }
  }, []);

  const validateFullForm = useCallback(() => {
    const errors = {};
    const fieldsToValidate = [
      "customerName",
      "customerType",
      "customerNumber",
      "customerGST",
      "customerAddress",
      "milkPrice",
      "butterPrice",
      "freshCreamPrice",
      "curdPrice",
      "gheePrice",
      "softPaneerPrice",
      "premiumPaneerPrice",
    ];
    fieldsToValidate.forEach((field) => {
      const error = validateField(field, formData[field]);
      if (error) errors[field] = error;
    });
    return errors;
  }, [formData, validateField]);

  const filteredEntries = useMemo(() => {
    if (!searchDebounced.trim()) return entries;
    const searchTerm = searchDebounced.toLowerCase().trim();
    return entries.filter((entry) => {
      const name = (entry.customerName || "").toLowerCase();
      const type = (entry.customerType || "").toLowerCase();
      const number = (entry.customerNumber || "").toLowerCase();
      const gst = (entry.customerGST || "").toLowerCase();
      const address = (entry.customerAddress || "").toLowerCase();
      return (
        name.includes(searchTerm) ||
        type.includes(searchTerm) ||
        number.includes(searchTerm) ||
        gst.includes(searchTerm) ||
        address.includes(searchTerm)
      );
    });
  }, [entries, searchDebounced]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/customer");
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to fetch customers: ${errorText || `HTTP ${res.status}`}`,
        );
      }
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Fetch error:", error);
      toast.error(error.message || "Failed to load customers");
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
      if (field === "customerNumber") {
        processedValue = value.replace(/\D/g, "").substring(0, 10);
      }
      if (field === "customerGST") {
        processedValue = value.toUpperCase();
      }

      setFormData((prev) => ({
        ...prev,
        [field]: processedValue,
      }));

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
      customerName: formData.customerName.trim(),
      customerType: formData.customerType.trim(),
      milkPrice: formData.milkPrice,
      butterPrice: formData.butterPrice,
      freshCreamPrice: formData.freshCreamPrice,
      curdPrice: formData.curdPrice,
      gheePrice: formData.gheePrice,
      softPaneerPrice: formData.softPaneerPrice,
      premiumPaneerPrice: formData.premiumPaneerPrice,
      customerNumber: formData.customerNumber.trim(),
      customerGST: formData.customerGST.trim() || "",
      customerAddress: formData.customerAddress.trim(),
      actionDoneBy: session?.user?.email, // <-- added
    };

    try {
      const url = isEditing
        ? `/api/customer?id=${formData.customerId}`
        : "/api/customer";
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
          ? "Customer updated successfully"
          : "Customer added successfully",
      );

      resetForm();
      fetchData();
    } catch (error) {
      console.error("Submit error:", error);
      toast.error(
        error.message || "Failed to save customer. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = useCallback(() => {
    setFormData(initialFormState);
    setFormErrors({});
    setIsEditing(false);
    setCreateCustomer(false);
  }, [initialFormState]);

  const handleEdit = useCallback(
    (customer) => {
      if (isEditing && formData.customerId === customer._id) {
        resetForm();
        return;
      }

      setCreateCustomer(true);
      setIsEditing(true);
      setOpenActionMenuId(null); // close any open menu

      setFormData({
        customerId: customer._id,
        customerName: customer.customerName || "",
        customerType: customer.customerType || "",
        milkPrice: customer.milkPrice || "",
        butterPrice: customer.butterPrice || "",
        freshCreamPrice: customer.freshCreamPrice || "",
        curdPrice: customer.curdPrice || "",
        gheePrice: customer.gheePrice || "",
        softPaneerPrice: customer.softPaneerPrice || "",
        premiumPaneerPrice: customer.premiumPaneerPrice || "",
        customerNumber: customer.customerNumber || "",
        customerGST: customer.customerGST || "",
        customerAddress: customer.customerAddress || "",
      });

      setFormErrors({});

      setTimeout(() => {
        document.querySelector(`.${styles.form}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 100);
    },
    [isEditing, formData.customerId, resetForm],
  );

  const handleDelete = async (id) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this customer?\nThis action cannot be undone.",
      )
    ) {
      return;
    }

    setDeleteLoading(id);
    setOpenActionMenuId(null); // close any open menu

    try {
      const res = await fetch(`/api/customer?id=${id}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || `Delete failed`);
      }

      toast.success("Customer deleted successfully");

      if (formData.customerId === id) {
        resetForm();
      }

      fetchData();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error.message || "Failed to delete customer");
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleClearSearch = () => {
    setSearchByName("");
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
          <h1>Customers</h1>

          {!createCustomer && (
            <div className={styles.createSection}>
              <button
                onClick={() => {
                  setCreateCustomer(true);
                  setIsEditing(false);
                  setFormData(initialFormState);
                  setFormErrors({});
                }}
                className={styles.createButton}
                disabled={loading}
                aria-label="Create new customer"
              >
                <span className={styles.plusIcon}>+</span>
                Create New Customer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Form */}
      {createCustomer && (
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formHeader}>
            <h2>{isEditing ? "Edit Customer" : "Create New Customer"}</h2>
            {isEditing && (
              <div className={styles.editingNote}>
                Editing: <strong>{formData.customerName}</strong>
              </div>
            )}
          </div>
          <div className={styles.formGrid}>
            <FormInput
              id="f-name"
              label="Customer Name"
              value={formData.customerName}
              onChange={(value) => handleInputChange("customerName", value)}
              placeholder="Enter customer name"
              error={formErrors.customerName}
              required
              disabled={isSubmitting}
            />

            <div className={styles.inputGroup}>
              <label htmlFor="f-type">
                Customer Type
                <span className={styles.required}>*</span>
              </label>
              <select
                id="f-type"
                value={formData.customerType}
                onChange={(e) =>
                  handleInputChange("customerType", e.target.value)
                }
                className={`${styles.selectInput} ${
                  formErrors.customerType ? styles.inputError : ""
                }`}
                disabled={isSubmitting}
                required
              >
                {CUSTOMER_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {formErrors.customerType && (
                <span className={styles.errorText}>
                  {formErrors.customerType}
                </span>
              )}
            </div>

            <FormInput
              id="f-phone"
              label="Phone Number"
              type="tel"
              value={formData.customerNumber}
              onChange={(value) => handleInputChange("customerNumber", value)}
              placeholder="10-digit phone number"
              error={formErrors.customerNumber}
              disabled={isSubmitting}
              inputMode="numeric"
            />

            <FormInput
              id="milkPrice"
              label="Milk Price"
              type="number"
              value={formData.milkPrice}
              onChange={(value) => handleInputChange("milkPrice", value)}
              placeholder="e.g. 45"
              error={formErrors.milkPrice}
              disabled={isSubmitting}
              inputMode="numeric"
              min="0"
              required
            />

            <FormInput
              id="butterPrice"
              label="Butter Price"
              type="number"
              value={formData.butterPrice}
              onChange={(value) => handleInputChange("butterPrice", value)}
              placeholder="e.g. 500"
              error={formErrors.butterPrice}
              disabled={isSubmitting}
              inputMode="numeric"
              min="0"
              required
            />

            <FormInput
              id="freshCreamPrice"
              label="Fresh Cream Price"
              type="number"
              value={formData.freshCreamPrice}
              onChange={(value) => handleInputChange("freshCreamPrice", value)}
              placeholder="e.g. 200"
              error={formErrors.freshCreamPrice}
              disabled={isSubmitting}
              inputMode="numeric"
              min="0"
              required
            />

            <FormInput
              id="curdPrice"
              label="Curd Price"
              type="number"
              value={formData.curdPrice}
              onChange={(value) => handleInputChange("curdPrice", value)}
              placeholder="e.g. 60"
              error={formErrors.curdPrice}
              disabled={isSubmitting}
              inputMode="numeric"
              min="0"
              required
            />

            <FormInput
              id="gheePrice"
              label="Ghee Price"
              type="number"
              value={formData.gheePrice}
              onChange={(value) => handleInputChange("gheePrice", value)}
              placeholder="e.g. 600"
              error={formErrors.gheePrice}
              disabled={isSubmitting}
              inputMode="numeric"
              min="0"
              required
            />

            <FormInput
              id="softPaneerPrice"
              label="Soft Paneer Price"
              type="number"
              value={formData.softPaneerPrice}
              onChange={(value) => handleInputChange("softPaneerPrice", value)}
              placeholder="e.g. 300"
              error={formErrors.softPaneerPrice}
              disabled={isSubmitting}
              inputMode="numeric"
              min="0"
              required
            />

            <FormInput
              id="premiumPaneerPrice"
              label="Premium Paneer Price"
              type="number"
              value={formData.premiumPaneerPrice}
              onChange={(value) =>
                handleInputChange("premiumPaneerPrice", value)
              }
              placeholder="e.g. 400"
              error={formErrors.premiumPaneerPrice}
              disabled={isSubmitting}
              inputMode="numeric"
              min="0"
              required
            />

            <FormInput
              id="f-gst"
              label="GST Number (Optional)"
              type="text"
              value={formData.customerGST}
              onChange={(value) => handleInputChange("customerGST", value)}
              placeholder="e.g., 22AAAAA0000A1Z5"
              error={formErrors.customerGST}
              disabled={isSubmitting}
            />

            <FormInput
              id="f-addr"
              label="Address"
              value={formData.customerAddress}
              onChange={(value) => handleInputChange("customerAddress", value)}
              placeholder="Enter address"
              error={formErrors.customerAddress}
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
                "Update Customer"
              ) : (
                "Add Customer"
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
            Search Customers:
          </label>
          <div className={styles.searchInputGroup}>
            <input
              id="searchInput"
              ref={searchInputRef}
              type="text"
              placeholder="Search by name, type, phone, GST..."
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
                Showing {filteredEntries.length} of {entries.length} customer
                {entries.length !== 1 ? "s" : ""}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Customers Table */}
      <div className={styles.tableContainer}>
        <div className={styles.tableWrapper}>
          <table className={styles.customerTable}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Phone</th>
                <th scope="col">GST</th>
                {isAdmin && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading && entries.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className={styles.loadingCell}>
                    <div className={styles.loadingContent}>
                      <div className={styles.tableSpinner}></div>
                      <span>Loading customers...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className={styles.noDataCell}>
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>📭</div>
                      <p className={styles.emptyText}>
                        {searchDebounced
                          ? `No customers found for "${searchDebounced}"`
                          : "No customers found"}
                      </p>
                      {!searchDebounced && !createCustomer && (
                        <button
                          onClick={() => {
                            setCreateCustomer(true);
                            setIsEditing(false);
                            setFormData(initialFormState);
                          }}
                          className={styles.createEmptyButton}
                        >
                          Create Your First Customer
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
                        href={`/customer/order?customerId=${item._id}`}
                        className={styles.customerName}
                      >
                        {item.customerName}
                      </Link>
                    </td>
                    <td className={styles.typeCell}>
                      <span
                        className={`${styles.typeBadge} ${
                          styles[
                            `type-${item.customerType?.toLowerCase() || "other"}`
                          ]
                        }`}
                      >
                        {item.customerType || "-"}
                      </span>
                    </td>
                    <td
                      className={styles.phoneCell}
                      title={item.customerNumber || "-"}
                    >
                      {item.customerNumber ? (
                        <span
                          className={styles.phone}
                          data-number={item.customerNumber}
                        >
                          i
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td
                      className={styles.gstCell}
                      title={item.customerGST || "-"}
                    >
                      {item.customerGST ? (
                        <span
                          className={styles.gst}
                          data-number={item.customerGST}
                        >
                          i
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    {isAdmin && (
                      <td className={styles.actionsCell}>
                        <div className={styles.actionMenuWrapper}>
                          <button
                            className={styles.actionMenuButton}
                            onClick={() =>
                              setOpenActionMenuId(
                                openActionMenuId === item._id ? null : item._id,
                              )
                            }
                            disabled={
                              loading || deleteLoading === item._id || isEditing
                            }
                            title="Actions"
                          >
                            ⋮
                          </button>
                          {openActionMenuId === item._id && (
                            <div className={styles.actionMenuPopup}>
                              <button
                                onClick={() => {
                                  handleEdit(item);
                                  setOpenActionMenuId(null);
                                }}
                                className={styles.actionEditButton}
                                disabled={loading || deleteLoading === item._id}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => {
                                  handleDelete(item._id);
                                  setOpenActionMenuId(null);
                                }}
                                className={styles.actionDeleteButton}
                                disabled={loading || deleteLoading === item._id}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    )}


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

  