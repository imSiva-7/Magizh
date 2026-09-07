"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { ToastContainer, toast } from "react-toastify";
import { useSession } from "next-auth/react";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/employee.module.css";

// --- Constants ---
const GENDER_OPTIONS = [
  { value: "", label: "Select Gender" },
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
  { value: "Other", label: "Other" },
];

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
    success,
    required = false,
    disabled = false,
    inputMode = "text",
    id,
    helperText,
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
        className={`${styles.input} ${error ? styles.inputError : ""} ${success ? styles.inputSuccess : ""}`}
      />
      {error && <span className={styles.errorText}>{error}</span>}
      {success && <span className={styles.successText}>{success}</span>}
      {helperText && !error && !success && (
        <span className={styles.helperText}>{helperText}</span>
      )}
    </div>
  ),
);

FormInput.displayName = "FormInput";

// --- Main Component ---

export default function Employee() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [createEmployee, setCreateEmployee] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchInputRef = useRef(null);
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const [searchDebounced, setSearchDebounced] = useState("");
  const [empIDCheckLoading, setEmpIDCheckLoading] = useState(false);
  const [empIDAvailable, setEmpIDAvailable] = useState(null);

  const initialFormState = useMemo(
    () => ({
      employeeId: null,
      name: "",
      empID: "",
      salary: "",
      mobile: "",
      gender: "",
    }),
    [],
  );

  const [formData, setFormData] = useState(initialFormState);
  const [searchByName, setSearchByName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(null);

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

  // Real-time empID availability check
  useEffect(() => {
    const checkEmpIDAvailability = async () => {
      // Only check if empID is 4 digits and not in edit mode for the same employee
      if (!/^\d{4}$/.test(formData.empID)) {
        setEmpIDAvailable(null);
        return;
      }

      // If editing and empID hasn't changed, don't check
      if (isEditing && formData.empID === formData.originalEmpID) {
        setEmpIDAvailable(null);
        return;
      }

      setEmpIDCheckLoading(true);

      try {
        const res = await fetch(`/api/employee?empID=${formData.empID}`);
        const data = await res.json();

        if (res.ok) {
          setEmpIDAvailable(data.available);
        }
      } catch (error) {
        console.error("Error checking empID:", error);
      } finally {
        setEmpIDCheckLoading(false);
      }
    };

    const timer = setTimeout(checkEmpIDAvailability, 500);
    return () => clearTimeout(timer);
  }, [formData.empID, isEditing, formData.originalEmpID]);

  // Validation Logic
  const validateField = useCallback((field, value) => {
    switch (field) {
      case "name":
        if (!value?.trim()) return "Name is required";
        if (value.trim().length < 2)
          return "Name must be at least 2 characters";
        if (value.trim().length > 100) return "Name is too long";
        return "";

      case "empID":
        if (!value?.trim()) return "Employee ID is required";
        if (!/^\d{4}$/.test(value))
          return "Employee ID must be exactly 4 digits";
        return "";

      case "salary":
        if (!value?.toString().trim()) return "Salary is required";
        const salary = parseFloat(value);
        if (isNaN(salary)) return "Please enter a valid number";
        if (salary <= 0) return "Salary must be greater than 0";
        if (salary > 1000000) return "Salary seems too high";
        return "";

      case "mobile":
        if (value && value.trim()) {
          const trimmedValue = value.trim();
          if (!/^\d+$/.test(trimmedValue))
            return "Mobile number must contain only digits";
          if (trimmedValue.length !== 10)
            return "Mobile number must be exactly 10 digits";
          if (!/^[6-9]/.test(trimmedValue))
            return "Mobile number must start with 6-9";
        }
        return "";

      case "gender":
        if (!value?.trim()) return "Gender is required";
        if (!GENDER_OPTIONS.some((option) => option.value === value.trim())) {
          return "Please select a valid gender";
        }
        return "";

      default:
        return "";
    }
  }, []);

  // Form Validation
  const validateFullForm = useCallback(() => {
    const errors = {};

    const fieldsToValidate = ["name", "empID", "salary", "mobile", "gender"];

    fieldsToValidate.forEach((field) => {
      const error = validateField(field, formData[field]);
      if (error) errors[field] = error;
    });

    // Additional check for empID availability
    if (!isEditing && empIDAvailable === false) {
      errors.empID = "Employee ID already exists";
    }

    return errors;
  }, [formData, validateField, empIDAvailable, isEditing]);

  // Search/Filter Logic
  const filteredEntries = useMemo(() => {
    if (!searchDebounced.trim()) return entries;

    const searchTerm = searchDebounced.toLowerCase().trim();
    return entries.filter((entry) => {
      const name = (entry.name || "").toLowerCase();
      const empID = (entry.empID || "").toLowerCase();
      const mobile = (entry.mobile || "").toLowerCase();
      const gender = (entry.gender || "").toLowerCase();
      const salary = (entry.salary?.toString() || "").toLowerCase();

      return (
        name.includes(searchTerm) ||
        empID.includes(searchTerm) ||
        mobile.includes(searchTerm) ||
        gender.includes(searchTerm) ||
        salary.includes(searchTerm)
      );
    });
  }, [entries, searchDebounced]);

  // API Fetch
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employee`);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to fetch employees: ${errorText || `HTTP ${res.status}`}`,
        );
      }
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Fetch error:", error);
      toast.error(error.message || "Failed to load employees");
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

      // Handle empID: Digits only, max 4
      if (field === "empID") {
        processedValue = value.replace(/\D/g, "").substring(0, 4);
      }

      // Handle Mobile Number: Digits only, max 10
      if (field === "mobile") {
        processedValue = value.replace(/\D/g, "").substring(0, 10);
      }

      // Handle Salary: Allow digits and one dot
      if (field === "salary") {
        if ((value.match(/\./g) || []).length > 1) {
          return;
        }
        processedValue = value.replace(/[^0-9.]/g, "");
        const parts = processedValue.split(".");
        if (parts[1] && parts[1].length > 2) {
          processedValue = `${parts[0]}.${parts[1].substring(0, 2)}`;
        }
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
      name: formData.name.trim(),
      empID: formData.empID,
      salary: parseFloat(formData.salary),
      mobile: formData.mobile.trim(),
      gender: formData.gender.trim(),
    };

    try {
      const url = isEditing
        ? `/api/employee?id=${formData.employeeId}`
        : "/api/employee";

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
          ? "Employee updated successfully"
          : "Employee added successfully",
      );
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Submit error:", error);
      toast.error(
        error.message || "Failed to save employee. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = useCallback(() => {
    setFormData(initialFormState);
    setFormErrors({});
    setIsEditing(false);
    setCreateEmployee(false);
    setEmpIDAvailable(null);
  }, [initialFormState]);

  const handleEdit = useCallback(
    (employee) => {
      if (isEditing && formData.employeeId === employee._id) {
        resetForm();
        return;
      }

      setCreateEmployee(true);
      setIsEditing(true);
      setFormData({
        employeeId: employee._id,
        name: employee.name || "",
        empID: employee.empID || "",
        originalEmpID: employee.empID || "", // Store original for comparison
        salary: employee.salary?.toString() || "",
        mobile: employee.mobile || "",
        gender: employee.gender || "",
      });

      setFormErrors({});
      setEmpIDAvailable(null);

      setTimeout(() => {
        document.querySelector(`.${styles.form}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 100);
    },
    [isEditing, formData.employeeId, resetForm],
  );

  const handleDelete = async (id) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this employee?\nThis action cannot be undone.",
      )
    ) {
      return;
    }

    setDeleteLoading(id);

    try {
      const res = await fetch(`/api/employee?id=${id}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || `Delete failed`);
      }

      toast.success("Employee deleted successfully");

      if (formData.employeeId === id) {
        resetForm();
      }

      fetchData();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error.message || "Failed to delete employee");
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleClearSearch = () => {
    setSearchByName("");
    searchInputRef.current?.focus();
  };

  const formatSalary = (salary) => {
    const parsed = parseFloat(salary);
    if (isNaN(parsed)) return "-";
    return `₹${parsed.toLocaleString("en-IN")}`;
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
          <h1>Employees</h1>

          {!createEmployee && (
            <div className={styles.createSection}>
              <button
                onClick={() => {
                  setCreateEmployee(true);
                  setIsEditing(false);
                  setFormData(initialFormState);
                  setFormErrors({});
                  setEmpIDAvailable(null);
                }}
                className={styles.createButton}
                disabled={loading}
                aria-label="Create new employee"
              >
                <span className={styles.plusIcon}>+</span>
                New Employee
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Form */}
      {createEmployee && (
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formHeader}>
            <h2>{isEditing ? "Edit Employee" : "Create New Employee"}</h2>
            {isEditing && (
              <div className={styles.editingNote}>
                Editing: <strong>{formData.name}</strong>
              </div>
            )}
          </div>
          <div className={styles.formGrid}>
            <FormInput
              id="f-name"
              label="Employee Name"
              value={formData.name}
              onChange={(value) => handleInputChange("name", value)}
              placeholder="Enter employee name"
              error={formErrors.name}
              required
              disabled={isSubmitting}
            />

            <FormInput
              id="f-empid"
              label="Employee ID"
              value={formData.empID}
              onChange={(value) => handleInputChange("empID", value)}
              placeholder="Enter 4-digit ID"
              error={formErrors.empID}
              success={
                !isEditing &&
                empIDAvailable === true &&
                formData.empID.length === 4
                  ? "✓ Available"
                  : ""
              }
              helperText={
                empIDCheckLoading
                  ? "Checking availability..."
                  : isEditing
                    ? "Employee ID cannot be changed"
                    : ""
              }
              required
              disabled={isSubmitting || isEditing}
              inputMode="numeric"
            />

            <FormInput
              id="f-salary"
              label="Salary"
              value={formData.salary}
              onChange={(value) => handleInputChange("salary", value)}
              placeholder="Enter salary amount"
              error={formErrors.salary}
              required
              disabled={isSubmitting}
              inputMode="decimal"
            />

            <FormInput
              id="f-mobile"
              label="Mobile Number"
              type="tel"
              value={formData.mobile}
              onChange={(value) => handleInputChange("mobile", value)}
              placeholder="10-digit mobile number"
              error={formErrors.mobile}
              disabled={isSubmitting}
              inputMode="numeric"
            />

            <div className={styles.inputGroup}>
              <label htmlFor="f-gender">
                Gender
                <span className={styles.required}>*</span>
              </label>
              <select
                id="f-gender"
                value={formData.gender}
                onChange={(e) => handleInputChange("gender", e.target.value)}
                className={`${styles.selectInput} ${
                  formErrors.gender ? styles.inputError : ""
                }`}
                disabled={isSubmitting}
                required
              >
                {GENDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {formErrors.gender && (
                <span className={styles.errorText}>{formErrors.gender}</span>
              )}
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="submit"
              disabled={isSubmitting || empIDCheckLoading}
              className={styles.submitButton}
            >
              {isSubmitting ? (
                <>
                  <span className={styles.buttonSpinner}></span>
                  {isEditing ? "Updating..." : "Creating..."}
                </>
              ) : isEditing ? (
                "Update Employee"
              ) : (
                "Add Employee"
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
            Search Employees:
          </label>
          <div className={styles.searchInputGroup}>
            <input
              id="searchInput"
              ref={searchInputRef}
              type="text"
              placeholder="Search by name, ID, mobile..."
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
            <span className={styles.resultCount}>
              Showing {filteredEntries.length} of {entries.length} employee
              {entries.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Employees Table */}
      <div className={styles.tableContainer}>
        <div className={styles.tableWrapper}>
          <table className={styles.employeeTable}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Emp ID</th>
                <th scope="col">Gender</th>
                <th scope="col">Salary</th>
                <th scope="col">Mobile</th>
                {isAdmin && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading && entries.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className={styles.loadingCell}>
                    <div className={styles.loadingContent}>
                      <div className={styles.tableSpinner}></div>
                      <span>Loading employees...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className={styles.noDataCell}>
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>📭</div>
                      <p className={styles.emptyText}>
                        {searchDebounced
                          ? `No employees found for "${searchDebounced}"`
                          : "No employees found"}
                      </p>
                      {!searchDebounced && !createEmployee && isAdmin && (
                        <button
                          onClick={() => {
                            setCreateEmployee(true);
                            setIsEditing(false);
                            setFormData(initialFormState);
                          }}
                          className={styles.createEmptyButton}
                        >
                          Create Your First Employee
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((item) => (
                  <tr key={item._id} className={styles.tableRow}>
                    <td className={styles.nameCell}>{item.name || "-"}</td>
                    <td className={styles.empIDCell}>
                      <span className={styles.empIDBadge}>
                        {item.empID || "-"}
                      </span>
                    </td>
                    <td className={styles.genderCell}>
                      <span
                        className={`${styles.genderBadge} ${
                          styles[`gender-${item.gender?.toLowerCase() || "other"}`]
                        }`}
                      >
                        {item.gender || "-"}
                      </span>
                    </td>
                    <td className={styles.salaryCell}>
                      {formatSalary(item.salary)}
                    </td>
                    <td className={styles.phoneCell}>
                      {item.mobile ? (
                        <span
                          className={styles.phone}
                          data-number={item.mobile}
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
                                title={
                                  isEditing && formData.employeeId === item._id
                                    ? "Cancel"
                                    : "Edit"
                                }
                              >
                                {isEditing && formData.employeeId === item._id
                                  ? "Cancel"
                                  : "Edit"}
                              </button>
                              <button
                                onClick={() => {
                                  handleDelete(item._id);
                                  setOpenActionMenuId(null);
                                }}
                                className={styles.actionDeleteButton}
                                disabled={
                                  deleteLoading === item._id ||
                                  loading ||
                                  isEditing
                                }
                                title={isEditing ? "Delete disabled" : "Delete"}
                              >
                                {deleteLoading === item._id ? (
                                  <span className={styles.deleteSpinner}></span>
                                ) : (
                                  "Delete"
                                )}
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
