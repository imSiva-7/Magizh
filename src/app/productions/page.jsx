"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import styles from "@/css/production.module.css";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function Production() {
  const getLocalDateString = () => {
    return new Date().toISOString().split("T")[0];
  };

  const [dateStr, setDateStr] = useState(getLocalDateString());
  const [batchNo, setBatchNo] = useState("");
  const [formData, setFormData] = useState({
    milk_quantity: "",
    fat_percentage: "",
    snf_percentage: "",
    curd_quantity: "",
    premium_paneer_quantity: "",
    soft_paneer_quantity: "",
    butter_quantity: "",
    cream_quantity: "",
    ghee_quantity: "",
  });
  const [loading, setLoading] = useState(false);
  const [btnLoading, setBtnLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false); // New state to track submission

  // Use ref to track last submission time
  const lastSubmitTime = useRef(0);

  // Improved batch number generation
  const generateBatchNumber = useCallback(() => {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear().toString().slice(2);
    const newBatchNo = `B${day}${month}${year}`;
    setBatchNo(newBatchNo);
  }, [dateStr]);

  // Optimized data fetching with error handling
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      console.log("🔍 Fetching data from API...");
      const res = await fetch("/api/production");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      console.log(`✅ Fetched ${data.length} entries`);
      setEntries(data);
    } catch (error) {
      console.error("Fetch error:", error);
      toast.error("Failed to fetch production data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-generate batch when date changes
  useEffect(() => {
    generateBatchNumber();
  }, [dateStr, generateBatchNumber]);

  // Fetch data on component mount - only once
  useEffect(() => {
    console.log("🚀 Component mounted, fetching initial data");
    fetchData();
  }, [fetchData]);

  // ✅ FIXED: Better decimal input handler
  const handleInputChange = (field, value) => {
    // Allow numbers, single decimal point, and empty
    if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
      // Remove any negative sign
      const positiveValue = value.replace("-", "");
      setFormData((prev) => ({ ...prev, [field]: positiveValue }));
    }
  };

  // Enhanced decimal parser with range validation
  const parseDecimalValue = (value, options = {}) => {
    if (value === "" || value === null || value === undefined) return null;

    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return null;

    // Apply min/max constraints if provided
    if (options.min !== undefined && num < options.min) return null;
    if (options.max !== undefined && num > options.max) return null;

    // Round to appropriate decimal places
    const decimalPlaces = options.decimalPlaces || 2;
    return parseFloat(num.toFixed(decimalPlaces));
  };

  const resetForm = () => {
    setDateStr(getLocalDateString());
    setFormData({
      milk_quantity: "",
      fat_percentage: "",
      snf_percentage: "",
      curd_quantity: "",
      premium_paneer_quantity: "",
      soft_paneer_quantity: "",
      butter_quantity: "",
      cream_quantity: "",
      ghee_quantity: "",
    });
  };

  // ✅ FIXED: Enhanced submit handler to prevent duplicates
  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation(); // Stop event bubbling

    // Prevent multiple submissions within 3 seconds
    const now = Date.now();
    if (now - lastSubmitTime.current < 3000) {
      console.log("⏸️ Too soon since last submit, ignoring");
      return;
    }

    // Prevent double submission
    if (isSubmitting) {
      console.log("⏸️ Already submitting, ignoring duplicate click");
      return;
    }

    if (!batchNo) {
      toast.error("Please wait for batch number generation");
      return;
    }

    setIsSubmitting(true);
    setBtnLoading(true);
    lastSubmitTime.current = now;

    console.log("📤 Starting submission...", { date: dateStr, batch: batchNo });

    // ✅ FIXED: Proper decimal parsing for each field
    const submissionData = {
      date: dateStr,
      batch: batchNo,
      milk_quantity: parseDecimalValue(formData.milk_quantity, {
        min: 0,
        decimalPlaces: 1,
      }),
      fat_percentage: parseDecimalValue(formData.fat_percentage, {
        min: 0,
        max: 7,
        decimalPlaces: 1,
      }),
      snf_percentage: parseDecimalValue(formData.snf_percentage, {
        min: 0,
        max: 9.5,
        decimalPlaces: 1,
      }),
      curd_quantity: parseDecimalValue(formData.curd_quantity, {
        min: 0,
        decimalPlaces: 2,
      }),
      premium_paneer_quantity: parseDecimalValue(
        formData.premium_paneer_quantity,
        { min: 0, decimalPlaces: 1 }
      ),
      soft_paneer_quantity: parseDecimalValue(formData.soft_paneer_quantity, {
        min: 0,
        decimalPlaces: 1,
      }),
      butter_quantity: parseDecimalValue(formData.butter_quantity, {
        min: 0,
        decimalPlaces: 2,
      }),
      cream_quantity: parseDecimalValue(formData.cream_quantity, {
        min: 0,
        decimalPlaces: 1,
      }),
      ghee_quantity: parseDecimalValue(formData.ghee_quantity, {
        min: 0,
        decimalPlaces: 1,
      }),
    };

    // Log submission data
    console.log("📦 Submission data:", submissionData);

    const productFields = [
      "milk_quantity",
      "curd_quantity",
      "premium_paneer_quantity",
      "soft_paneer_quantity",
      "butter_quantity",
      "cream_quantity",
      "ghee_quantity",
    ];

    const hasAtLeastOneProduct = productFields.some(
      (key) => submissionData[key] !== null && submissionData[key] > 0
    );

    if (!hasAtLeastOneProduct) {
      toast.error("Please enter at least one product quantity");
      setIsSubmitting(false);
      setBtnLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submissionData),
      });

      const data = await res.json();
      console.log("📥 API Response:", data);

      if (res.ok) {
        toast.success(data.message);
        resetForm();
        await fetchData();
      } else {
        toast.error(data.error || "Submission failed");
      }
    } catch (error) {
      console.error("❌ Submission error:", error);
      toast.error("Network error: Failed to submit data");
    } finally {
      setIsSubmitting(false);
      setBtnLoading(false);
    }
  };

  // Enhanced delete with loading state
  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this production entry?"))
      return;

    try {
      const res = await fetch(`/api/production?id=${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(data.message);
        await fetchData();
      } else {
        toast.error(data.error || "Deletion failed");
      }
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Error deleting entry");
    }
  };

  // Improved display formatter
  const displayValue = (value) => {
    if (value === null || value === undefined) return "-";
    if (value === 0) return "-";

    const num = parseFloat(value);
    if (isNaN(num)) return "-";

    // Show integers without decimals, others with appropriate decimal places
    if (num % 1 === 0) return num.toString();

    // Determine decimal places based on value
    if (num < 1) return num.toFixed(2); // Small values show 2 decimals
    if (num % 1 === 0.5) return num.toFixed(1); // 0.5 values show 1 decimal
    return num.toFixed(2); // Default 2 decimals
  };

  return (
    <div className={styles.container}>
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Debug panel - remove in production */}
      {process.env.NODE_ENV === "development" && (
        <div
          style={{
            background: "#f8f9fa",
            padding: "10px",
            marginBottom: "20px",
            borderRadius: "5px",
            fontSize: "12px",
            border: "1px solid #dee2e6",
          }}
        >
          <strong>Debug:</strong>
          <span style={{ marginLeft: "10px" }}>
            Submitting: {isSubmitting ? "Yes" : "No"}
          </span>
          <span style={{ marginLeft: "10px" }}>
            Loading: {btnLoading ? "Yes" : "No"}
          </span>
          <span style={{ marginLeft: "10px" }}>Batch: {batchNo}</span>
        </div>
      )}

      <h1>Production Entry</h1>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label>Date:</label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className={styles.input}
              required
              max={getLocalDateString()}
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Batch No:</label>
            <input
              type="text"
              value={batchNo}
              readOnly
              className={`${styles.input} ${styles.batchInput}`}
              placeholder="Auto-generated"
              required
            />
            <small className={styles.helperText}>Based on selected date</small>
          </div>
        </div>

        <div className={styles.section}>
    
          <div className={styles.formRow_1}>
            <div className={styles.inputGroup}>
              <label>Milk Quantity (L):</label>
              {/* ✅ FIXED: Added missing value attribute */}
              <input
                type="number"
                value={formData.milk_quantity} // This was missing!
                onChange={(e) =>
                  handleInputChange("milk_quantity", e.target.value)
                }
                placeholder="355.5"
                className={styles.input}
                min="0"
                step="0.1"
              />
            </div>
            <div className={styles.inputGroup}>
              <label>Fat Percentage (%):</label>
              <input
                type="number"
                value={formData.fat_percentage}
                onChange={(e) =>
                  handleInputChange("fat_percentage", e.target.value)
                }
                placeholder="6.9"
                className={styles.input}
                min="0"
                max="7.0"
                step="0.1"
              />
            </div>
            <div className={styles.inputGroup}>
              <label>SNF Percentage (%):</label>
              <input
                type="number"
                value={formData.snf_percentage}
                onChange={(e) =>
                  handleInputChange("snf_percentage", e.target.value)
                }
                placeholder="7.5"
                className={styles.input}
                min="0"
                max="9.5"
                step="0.1"
              />
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.formGrid}>
            {[
              {
                key: "curd_quantity",
                label: "Curd (Kg)",
                placeholder: "100.25",
                step: "0.01",
              },
              {
                key: "premium_paneer_quantity",
                label: "Premium Paneer (Kg)",
                placeholder: "50.5",
                step: "0.1",
              },
              {
                key: "soft_paneer_quantity",
                label: "Soft Paneer (Kg)",
                placeholder: "50.5",
                step: "0.1",
              },
              {
                key: "butter_quantity",
                label: "Butter (Kg)",
                placeholder: "20.25",
                step: "0.01",
              },
              {
                key: "cream_quantity",
                label: "Cream (L)",
                placeholder: "5.5",
                step: "0.1",
              },
              {
                key: "ghee_quantity",
                label: "Ghee (L)",
                placeholder: "20.5",
                step: "0.1",
              },
            ].map(({ key, label, placeholder, step }) => (
              <div key={key} className={styles.inputGroup}>
                <label>{label}:</label>
                <input
                  type="number"
                  value={formData[key]}
                  onChange={(e) => handleInputChange(key, e.target.value)}
                  placeholder={placeholder}
                  className={styles.input}
                  min="0"
                  step={step}
                />
              </div>
            ))}
          </div>
        </div>

        <div className={styles.buttonGroup}>
          <button
            type="button"
            onClick={resetForm}
            className={styles.resetBtn}
            disabled={btnLoading}
          >
            Reset Form
          </button>
          <button
            type="submit"
            disabled={btnLoading || !batchNo || isSubmitting}
            className={styles.submitBtn}
          >
            {btnLoading ? (
              <>
                <span className={styles.spinner}></span>
                Submitting...
              </>
            ) : (
              "Submit Production"
            )}
          </button>
        </div>
      </form>

      <div className={styles.tableWrapper}>
        {loading ? (
          <div className={styles.loading}>Loading production data...</div>
        ) : entries.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>No production data found</h3>
            <p>Start by submitting your first production entry above.</p>
          </div>
        ) : (
          <>
            <div className={styles.tableHeader}>
              <h3>Recent Production Entries ({entries.length})</h3>
              <button onClick={fetchData} className={styles.refreshBtn}>
                🔄
              </button>
            </div>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Batch</th>
                    <th>Milk (L)</th>
                    <th>Fat (%)</th>
                    <th>SNF (%)</th>
                    <th>Curd (Kg)</th>
                    <th>P. Paneer (Kg)</th>
                    <th>S. Paneer (Kg)</th>
                    <th>Butter (Kg)</th>
                    <th>Cream (L)</th>
                    <th>Ghee (L)</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((item) => (
                    <tr key={item._id}>
                      <td>{new Date(item.date).toLocaleDateString("en-IN")}</td>
                      <td className={styles.batchCell}>{item.batch}</td>
                      <td>{displayValue(item.milk_quantity)}</td>
                      <td>{displayValue(item.fat_percentage)}</td>
                      <td>{displayValue(item.snf_percentage)}</td>
                      <td>{displayValue(item.curd_quantity)}</td>
                      <td>{displayValue(item.premium_paneer_quantity)}</td>
                      <td>{displayValue(item.soft_paneer_quantity)}</td>
                      <td>{displayValue(item.butter_quantity)}</td>
                      <td>{displayValue(item.cream_quantity)}</td>
                      <td>{displayValue(item.ghee_quantity)}</td>
                      <td>
                        <button
                          onClick={() => handleDelete(item._id)}
                          className={styles.deleteBtn}
                          title="Delete entry"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
