"use client";

import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import styles from "@/css/production.module.css";
import { getTodayDate } from "@/utils/dateUtils.js";

const ProductionFormInput = ({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  suffix,
  type = "number",
  required = false,
}) => (
  <div className={styles.inputGroup}>
    <label>
      {label} {suffix && `(${suffix})`}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={styles.input}
      min={min}
      max={max}
      step={step || "0.01"}
      required={required}
    />
  </div>
);

const ProductionTableRow = ({ entry, onDelete }) => {
  const formatValue = (value) => {
    if (value === null || value === undefined || value === "" || value === 0)
      return "-";
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <tr>
      <td>
        {new Date(entry.date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </td>
      <td className={styles.batchCell}>{entry.batch}</td>
      <td>{formatValue(entry.milk_quantity)}</td>
      <td>{formatValue(entry.fat_percentage)}</td>
      <td>{formatValue(entry.snf_percentage)}</td>
      <td>{formatValue(entry.curd_quantity)}</td>
      <td>{formatValue(entry.cream_quantity)}</td>
      <td>{formatValue(entry.soft_paneer_quantity)}</td>
      <td>{formatValue(entry.premium_paneer_quantity)}</td>
      <td>{formatValue(entry.butter_quantity)}</td>
      <td>{formatValue(entry.ghee_quantity)}</td>
      <td>
        <button
          onClick={() => onDelete(entry._id)}
          className={styles.deleteBtn}
          title="Delete entry"
        >
          Delete
        </button>
      </td>
    </tr>
  );
};

export default function ProductionPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dateStr, setDateStr] = useState(getTodayDate());
  const [batchNo, setBatchNo] = useState("");

  const initialFormState = {
    milk_quantity: "",
    fat_percentage: "",
    snf_percentage: "",
    curd_quantity: "",
    premium_paneer_quantity: "",
    soft_paneer_quantity: "",
    butter_quantity: "",
    cream_quantity: "",
    ghee_quantity: "",
  };

  const [formData, setFormData] = useState(initialFormState);
  const lastSubmitTime = useRef(0);

  // ========== EFFECTS ==========
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!dateStr) return;
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear().toString().slice(2);
    setBatchNo(`B${day}${month}${year}`);
  }, [dateStr]);

 

  // ========== DATA FETCHING ==========
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/production");
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setEntries(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);
   useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // ========== FORM HANDLERS ==========
  const handleInputChange = (field, value) => {
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
  };

  const parseDecimal = (value, decimalPlaces = 2) => {
    if (!value) return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : parseFloat(num.toFixed(decimalPlaces));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
    if (isSubmitting || now - lastSubmitTime.current < 2000) return;

    if (!batchNo) {
      toast.error("Batch number missing");
      return;
    }

    setIsSubmitting(true);
    lastSubmitTime.current = now;

    const payload = {
      date: dateStr,
      batch: batchNo,
      milk_quantity: parseDecimal(formData.milk_quantity, 2),
      fat_percentage: parseDecimal(formData.fat_percentage, 1),
      snf_percentage: parseDecimal(formData.snf_percentage, 1),
      curd_quantity: parseDecimal(formData.curd_quantity),
      premium_paneer_quantity: parseDecimal(formData.premium_paneer_quantity),
      soft_paneer_quantity: parseDecimal(formData.soft_paneer_quantity),
      butter_quantity: parseDecimal(formData.butter_quantity),
      cream_quantity: parseDecimal(formData.cream_quantity),
      ghee_quantity: parseDecimal(formData.ghee_quantity),
    };

    try {
      const response = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Entry saved successfully");
        setFormData(initialFormState);
        fetchEntries();
      } else {
        toast.error(data.error || "Submission failed");
      }
    } catch (error) {
      toast.error("Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this entry?")) return;

    const previousEntries = [...entries];
    setEntries((prev) => prev.filter((item) => item._id !== id));

    try {
      const response = await fetch(`/api/production?id=${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Delete failed");
      toast.success("Entry deleted");
    } catch (error) {
      setEntries(previousEntries);
      toast.error("Error deleting entry");
    }
  };

  const resetForm = () => {
    setFormData(initialFormState);
  };

  const navigateToHistory = () => {
    router.push("/productions/history");
  };

  if (!mounted) return null;

  return (
    <div className={styles.container}>
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Header */}
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Production Entry</h1>
      </header>

      {/* Main Form */}
      <main className={styles.mainContent}>
        <form onSubmit={handleSubmit} className={styles.productionForm}>
          {/* Date & Batch */}
          <section className={styles.formSection}>
            <div className={styles.dateBatchRow}>
              <div className={styles.inputGroup}>
                <label>Date</label>
                <input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className={styles.input}
                  required
                  max={new Date().toISOString().split("T")[0]}
                />
              </div>

              <div className={styles.inputGroup}>
                <label>Batch No</label>
                <input
                  type="text"
                  value={batchNo}
                  readOnly
                  className={`${styles.input} ${styles.batchInput}`}
                />
              </div>
            </div>
          </section>

          {/* Milk Quality */}
          <section className={styles.formSection}>
            <div className={styles.milkQualityRow}>
              <ProductionFormInput
                label="Milk Quantity"
                suffix="L"
                value={formData.milk_quantity}
                onChange={(v) => handleInputChange("milk_quantity", v)}
                placeholder="400"
                step="0.1"
              />
              <ProductionFormInput
                label="Fat Percentage"
                suffix="%"
                value={formData.fat_percentage}
                onChange={(v) => handleInputChange("fat_percentage", v)}
                placeholder="6.5"
                min="0"
                max="7.0"
                step="0.1"
              />
              <ProductionFormInput
                label="SNF Percentage"
                suffix="%"
                value={formData.snf_percentage}
                onChange={(v) => handleInputChange("snf_percentage", v)}
                placeholder="8.5"
                min="0"
                max="12"
                step="0.1"
              />
            </div>
          </section>

          {/* Production Quantities */}
          <section className={styles.formSection}>
            <div className={styles.quantitiesGrid}>
              <ProductionFormInput
                label="Curd"
                suffix="Kg"
                value={formData.curd_quantity}
                onChange={(v) => handleInputChange("curd_quantity", v)}
                placeholder="100"
              />
              <ProductionFormInput
                label="Cream"
                suffix="kg"
                value={formData.cream_quantity}
                onChange={(v) => handleInputChange("cream_quantity", v)}
                placeholder="50"
                step="0.1"
              />
              <ProductionFormInput
                label="Soft Paneer"
                suffix="Kg"
                value={formData.soft_paneer_quantity}
                onChange={(v) => handleInputChange("soft_paneer_quantity", v)}
                placeholder="100"
                step="0.1"
              />
              <ProductionFormInput
                label="Premium Paneer"
                suffix="Kg"
                value={formData.premium_paneer_quantity}
                onChange={(v) =>
                  handleInputChange("premium_paneer_quantity", v)
                }
                placeholder="100"
                step="0.1"
              />
              <ProductionFormInput
                label="Butter"
                suffix="Kg"
                value={formData.butter_quantity}
                onChange={(v) => handleInputChange("butter_quantity", v)}
                placeholder="100"
              />
              <ProductionFormInput
                label="Ghee"
                suffix="L"
                value={formData.ghee_quantity}
                onChange={(v) => handleInputChange("ghee_quantity", v)}
                placeholder="50"
                step="0.1"
              />
            </div>
          </section>

          {/* Form Actions */}
          <section className={styles.formActions}>
            <button
              type="button"
              onClick={resetForm}
              className={styles.resetBtn}
              disabled={isSubmitting}
            >
              Reset Form
            </button>
            <button
              type="submit"
              disabled={!batchNo || isSubmitting}
              className={styles.submitBtn}
            >
              {isSubmitting ? "Submitting..." : "Submit Production"}
            </button>
          </section>
        </form>

        {/* Recent Entries */}
        <section className={styles.recentEntries}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              Recent Production Entries ({entries.length})
            </h2>
            <div className={styles.sectionActions}>
              <button onClick={navigateToHistory} className={styles.historyBtn}>
                View History
              </button>
              <button
                onClick={fetchEntries}
                className={styles.refreshBtn}
                disabled={loading}
              >
                Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className={styles.loadingState}>
              Loading production data...
            </div>
          ) : entries.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>No production data found</h3>
              <p>Start by submitting your first production entry above.</p>
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.productionTable}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Batch</th>
                    <th>Milk (L)</th>
                    <th>Fat (%)</th>
                    <th>SNF (%)</th>
                    <th>Curd (Kg)</th>
                    <th>Cream (kg)</th>
                    <th>S. Paneer (Kg)</th>
                    <th>P. Paneer (Kg)</th>
                    <th>Butter (Kg)</th>
                    <th>Ghee (L)</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((item) => (
                    <ProductionTableRow
                      key={item._id}
                      entry={item}
                      onDelete={handleDelete}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
