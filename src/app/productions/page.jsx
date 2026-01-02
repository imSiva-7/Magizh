"use client";

import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import styles from "@/css/production.module.css";
import { getTodayDate } from "@/utils/dateUtils.js";

const formatNumber = (value) => {
  if (value === null || value === undefined || value === 0 || value === "")
    return "-";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
};

const FormInput = ({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  suffix,
}) => (
  <div className={styles.inputGroup}>
    <label>
      {label} {suffix && `(${suffix})`}
    </label>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={styles.input}
      min="0"
      max={max}
      step={step || "0.01"}
    />
  </div>
);

export default function Production() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState("light");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [disableDelete, setDisableDelete] = useState(true);
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

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("dairy-theme");

    if (savedTheme) setTheme(savedTheme);
  }, []);

  const generateBatchNumber = useCallback(() => {
    if (!dateStr) return;
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear().toString().slice(2);
    setBatchNo(`B${day}${month}${year}`);
  }, [dateStr]);

  useEffect(() => {
    generateBatchNumber();
  }, [dateStr, generateBatchNumber]);

  // Fetch Data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/production");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setEntries(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Handlers ---

  const handleInputChange = (field, value) => {
    // Only allow valid numbers or empty string
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

    // 4. IMPROVED LOGIC: Debounce submit (prevent double clicks)
    const now = Date.now();
    if (isSubmitting || now - lastSubmitTime.current < 2000) return;

    if (!batchNo) {
      toast.error("Batch number missing");
      return;
    }

    setIsSubmitting(true);
    lastSubmitTime.current = now;

    // Clean payload
    const payload = {
      date: dateStr,
      batch: batchNo,
      milk_quantity: parseDecimal(formData.milk_quantity, 1),
      fat_percentage: parseDecimal(formData.fat_percentage, 1),
      snf_percentage: parseDecimal(formData.snf_percentage, 1),
      curd_quantity: parseDecimal(formData.curd_quantity),
      premium_paneer_quantity: parseDecimal(
        formData.premium_paneer_quantity,
        1
      ),
      soft_paneer_quantity: parseDecimal(formData.soft_paneer_quantity, 1),
      butter_quantity: parseDecimal(formData.butter_quantity),
      cream_quantity: parseDecimal(formData.cream_quantity, 1),
      ghee_quantity: parseDecimal(formData.ghee_quantity, 1),
    };

    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success("Entry saved successfully");
        setFormData(initialFormState); // Reset form
        fetchData(); // Refresh table
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

    // 5. IMPROVED LOGIC: Optimistic UI Update (Remove immediately)
    const previousEntries = [...entries];
    setEntries((prev) => prev.filter((item) => item._id !== id));

    try {
      const res = await fetch(`/api/production?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Entry deleted");
    } catch (error) {
      // Revert if API fails
      setEntries(previousEntries);
      toast.error("Error deleting entry");
    }
  };

  if (!mounted) return null;

  return (
    <div className={styles.container} data-theme={theme}>
      <ToastContainer position="top-right" autoClose={3000} theme={theme} />

      <div className={styles.headerSection}>
        <h1>Production Entry</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
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

        <div className={styles.section}>
          <div className={styles.milkQualityRow}>
            <FormInput
              label="Milk Quantity"
              suffix="L"
              value={formData.milk_quantity}
              onChange={(v) => handleInputChange("milk_quantity", v)}
              placeholder="400"
              step="0.1"
            />
            <FormInput
              label="Fat Percentage"
              suffix="%"
              value={formData.fat_percentage}
              onChange={(v) => handleInputChange("fat_percentage", v)}
              placeholder="6.5"
              min="0"
              max="7.0"
              step="0.1"
            />
            <FormInput
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
        </div>

        <div className={styles.section}>
          <div className={styles.formGrid}>
            <FormInput
              label="Curd"
              suffix="Kg"
              value={formData.curd_quantity}
              onChange={(v) => handleInputChange("curd_quantity", v)}
              placeholder="100"
            />
            <FormInput
              label="Premium Paneer"
              suffix="Kg"
              value={formData.premium_paneer_quantity}
              onChange={(v) => handleInputChange("premium_paneer_quantity", v)}
              placeholder="100"
              step="0.1"
            />
            <FormInput
              label="Soft Paneer"
              suffix="Kg"
              value={formData.soft_paneer_quantity}
              onChange={(v) => handleInputChange("soft_paneer_quantity", v)}
              placeholder="100"
              step="0.1"
            />
            <FormInput
              label="Butter"
              suffix="Kg"
              value={formData.butter_quantity}
              onChange={(v) => handleInputChange("butter_quantity", v)}
              placeholder="100"
            />
            <FormInput
              label="Cream"
              suffix="kg"
              value={formData.cream_quantity}
              onChange={(v) => handleInputChange("cream_quantity", v)}
              placeholder="50"
              step="0.1"
            />
            <FormInput
              label="Ghee"
              suffix="L"
              value={formData.ghee_quantity}
              onChange={(v) => handleInputChange("ghee_quantity", v)}
              placeholder="50"
              step="0.1"
            />
          </div>
        </div>

        <div className={styles.buttonGroup}>
          <button
            type="button"
            onClick={() => setFormData(initialFormState)}
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
              <h3 className={styles.tableH3}>
                Recent Production Entries ({entries.length}){" "}
              </h3>
              <span className={styles.tableBtn}>
                <button
                  type="button"
                  disabled={!batchNo || isSubmitting}
                  className={styles.infoBtn}
                  onClick={() => router.push("/productions/history")}
                >
                  More Info
                </button>
                <button onClick={fetchData} className={styles.refreshBtn}>
                  🔄
                </button>
              </span>
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
                    <th>Cream (kg)</th>
                    <th>Ghee (L)</th>
                    {/* <th>Actions</th> */}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((item) => (
                    <tr key={item._id}>
                      <td>{new Date(item.date).toLocaleDateString("en-IN")}</td>
                      <td className={styles.batchCell}>{item.batch}</td>
                      <td>{formatNumber(item.milk_quantity)}</td>
                      <td>{formatNumber(item.fat_percentage)}</td>
                      <td>{formatNumber(item.snf_percentage)}</td>
                      <td>{formatNumber(item.curd_quantity)}</td>
                      <td>{formatNumber(item.premium_paneer_quantity)}</td>
                      <td>{formatNumber(item.soft_paneer_quantity)}</td>
                      <td>{formatNumber(item.butter_quantity)}</td>
                      <td>{formatNumber(item.cream_quantity)}</td>
                      <td>{formatNumber(item.ghee_quantity)}</td>
                      {/* <td>
                        <button
                          onClick={() => handleDelete(item._id)}
                          className={styles.deleteBtn}
                          // disabled={true}
                          title="Delete entry"
                        >
                          {"Delete"}
                        </button>
                      </td> */}
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
