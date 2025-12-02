"use client";

import { useEffect, useState, useCallback } from "react";
import styles from "@/css/production.module.css";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function Production() {
  const getLocalDateString = () => {
    return new Date().toISOString().split("T")[0]; // Simpler method
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
      const res = await fetch("/api/production");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
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

  // Fetch data on component mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  
  const handleInputChange = (field, value) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Enhanced decimal parser with range validation
  const parseDecimalValue = (value, options = {}) => {
    if (value === "" || value === null || value === undefined) return null;

    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return null;

    // Apply min/max constraints if provided
    if (options.min !== undefined && num < options.min) return null;
    if (options.max !== undefined && num > options.max) return null;

    return parseFloat(num.toFixed(2));
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

  // Enhanced submit handler with better validation
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate batch number exists
    if (!batchNo) {
      toast.error("Please wait for batch number generation");
      return;
    }

    setBtnLoading(true);

    const submissionData = {
      date: dateStr,
      batch: batchNo,
      milk_quantity: parseDecimalValue(formData.milk_quantity, { min: 0 }),
      fat_percentage: parseDecimalValue(formData.fat_percentage, {
        min: 1,
        max: 7,
      }),
      snf_percentage: parseDecimalValue(formData.snf_percentage, {
        min: 1,
        max: 9.5,
      }),
      curd_quantity: parseDecimalValue(formData.curd_quantity, { min: 0 }),
      premium_paneer_quantity: parseDecimalValue(
        formData.premium_paneer_quantity,
        { min: 0 }
      ),
      soft_paneer_quantity: parseDecimalValue(formData.soft_paneer_quantity, {
        min: 0,
      }),
      butter_quantity: parseDecimalValue(formData.butter_quantity, { min: 0 }),
      cream_quantity: parseDecimalValue(formData.cream_quantity, { min: 0 }),
      ghee_quantity: parseDecimalValue(formData.ghee_quantity, { min: 0 }),
    };

    // Enhanced validation - check if at least one product has value
    const productFields = Object.keys(submissionData).filter(
      (key) => key.endsWith("_quantity") && key !== "milk_quantity"
    );

    const hasAtLeastOneProduct = productFields.some(
      (key) => submissionData[key] !== null && submissionData[key] > 0
    );

    if (!hasAtLeastOneProduct && !submissionData.milk_quantity) {
      toast.error("Please enter at least one product quantity");
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

      if (res.ok) {
        toast.success(data.message);
        resetForm();
        await fetchData(); // Wait for refresh before showing success
      } else {
        toast.error(data.error || "Submission failed");
      }
    } catch (error) {
      console.error("Submission error:", error);
      toast.error("Network error: Failed to submit data");
    } finally {
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

    // Show integers without decimals, others with 2 decimal places
    return num % 1 === 0 ? num.toString() : num.toFixed(2);
  };

  // Calculate total milk used for products (for user info)
  const calculateTotalMilkUsed = useCallback(() => {
    if (!formData.milk_quantity) return 0;

    const milk = parseFloat(formData.milk_quantity);
    const estimatedUsage =
      (parseFloat(formData.curd_quantity) || 0) * 0.1 +
      (parseFloat(formData.premium_paneer_quantity) || 0) * 0.2 +
      (parseFloat(formData.soft_paneer_quantity) || 0) * 0.2 +
      (parseFloat(formData.butter_quantity) || 0) * 0.3 +
      (parseFloat(formData.cream_quantity) || 0) * 0.15 +
      (parseFloat(formData.ghee_quantity) || 0) * 0.25;

    return estimatedUsage;
  }, [formData]);

  const totalMilkUsed = calculateTotalMilkUsed();
  const milkBalance = formData.milk_quantity
    ? (parseFloat(formData.milk_quantity) - totalMilkUsed).toFixed(2)
    : 0;

  return (
    <div className={styles.container}>
      <ToastContainer position="top-right" autoClose={3000} />
      <h1>Production Entry</h1>

      {/* Milk Usage Summary */}
      {/* {formData.milk_quantity && (
        <div className={styles.milkSummary}>
          <p>
            <strong>Milk Usage:</strong> {totalMilkUsed.toFixed(2)}L used |{" "}
            <strong>Balance:</strong> {milkBalance}L remaining
          </p>
        </div>
      )} */}

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
              //max={getLocalDateString()} // Prevent future dates
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
          <div className={styles.formRow}>
            <div className={styles.inputGroup}>
              <label>Milk Quantity (L):</label>
              <input
                type="number"
                value={formData.milk_quantity}
                onChange={(e) =>
                  handleInputChange("milk_quantity", e.target.value)
                }
                placeholder="355"
                className={styles.input}
                min="0"
                step="1"
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
                min="1"
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
                min="1"
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
                placeholder: "100",
                step: "0.5",
              },
              {
                key: "premium_paneer_quantity",
                label: "Premium Paneer (Kg)",
                placeholder: "50",
                step: "0.5",
              },
              {
                key: "soft_paneer_quantity",
                label: "Soft Paneer (Kg)",
                placeholder: "50",
                step: "0.5",
              },
              {
                key: "butter_quantity",
                label: "Butter (Kg)",
                placeholder: "20",
                step: "0.5",
              },
              {
                key: "cream_quantity",
                label: "Cream (L)",
                placeholder: "5",
                step: "0.5",
              },
              {
                key: "ghee_quantity",
                label: "Ghee (L)",
                placeholder: "20",
                step: "0.5",
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
            disabled={btnLoading || !batchNo}
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
