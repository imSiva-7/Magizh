// "use client";

// import { useEffect, useState, useMemo } from "react";
// import { useSearchParams, useRouter } from "next/navigation";
// import { ToastContainer, toast } from "react-toastify";
// import "react-toastify/dist/ReactToastify.css";
// import styles from "@/css/procurement.module.css";
// import { getTodayDate } from "@/utils/dateUtils";

// export default function ProcurementPage() {
//   const router = useRouter();
//   const searchParams = useSearchParams();
//   const supplierId = searchParams.get("supplierId");

//   // Consolidated Loading State
//   const [status, setStatus] = useState({
//     loading: true,
//     submitting: false,
//     deletingId: null,
//   });
//   const [data, setData] = useState({ supplier: null, procurements: [] });
//   const [editingId, setEditingId] = useState(null);
//   const [errors, setErrors] = useState({});

//   const initialForm = {
//     date: getTodayDate(),
//     milkQuantity: "",
//     fatPercentage: "",
//     snfPercentage: "",
//     rate: "",
//     totalAmount: "",
//   };

//   const [formData, setFormData] = useState(initialForm);

//   // 1. Fetch Initial Data
//   useEffect(() => {
//     if (!supplierId) {
//       toast.error("No supplier selected");
//       return router.push("/supplier");
//     }

//     const loadData = async () => {
//       try {
//         const [suppRes, procRes] = await Promise.all([
//           fetch(`/api/supplier?supplierId=${supplierId}`),
//           fetch(`/api/supplier/procurement?supplierId=${supplierId}`),
//         ]);

//         if (!suppRes.ok || !procRes.ok) throw new Error("Failed to load data");

//         const supplier = await suppRes.json();
//         const procurements = await procRes.json();

//         setData({
//           supplier,
//           // Sort by date descending (newest first)
//           procurements: Array.isArray(procurements)
//             ? procurements.sort((a, b) => new Date(b.date) - new Date(a.date))
//             : [],
//         });
//       } catch (error) {
//         toast.error(error.message);
//       } finally {
//         setStatus((prev) => ({ ...prev, loading: false }));
//       }
//     };

//     loadData();
//   }, [supplierId, router]);

//   // 2. Computed Summaries
//   const summary = useMemo(() => {
//     return data.procurements.reduce(
//       (acc, curr) => ({
//         milk: acc.milk + (parseFloat(curr.milkQuantity) || 0),
//         amount: acc.amount + (parseFloat(curr.totalAmount) || 0),
//       }),
//       { milk: 0, amount: 0 }
//     );
//   }, [data.procurements]);

//   // 3. Form Handling
//   const handleInputChange = (e) => {
//     const { name, value } = e.target;
//     setFormData((prev) => {
//       const next = { ...prev, [name]: value };

//       // Auto-calculate Total
//       if (name === "milkQuantity" || name === "rate") {
//         const qty =
//           parseFloat(name === "milkQuantity" ? value : prev.milkQuantity) || 0;
//         const rate = parseFloat(name === "rate" ? value : prev.rate) || 0;
//         next.totalAmount = (qty * rate).toFixed(2);
//       }
//       return next;
//     });
//     // Clear error on type
//     if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
//   };

//   const validate = () => {
//     const newErrors = {};
//     if (!formData.date) newErrors.date = "Date required";
//     if (new Date(formData.date) > new Date(getTodayDate()))
//       newErrors.date = "Future date not allowed";
//     if (!formData.milkQuantity || parseFloat(formData.milkQuantity) <= 0)
//       newErrors.milkQuantity = "Invalid quantity";
//     if (!formData.rate || parseFloat(formData.rate) <= 0)
//       newErrors.rate = "Invalid rate";

//     setErrors(newErrors);
//     return Object.keys(newErrors).length === 0;
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     if (!validate()) return toast.warning("Please check form errors");

//     setStatus((prev) => ({ ...prev, submitting: true }));
//     try {
//       const method = editingId ? "PUT" : "POST";
//       const endpoint = editingId
//         ? `/api/supplier/procurement?id=${editingId}`
//         : "/api/supplier/procurement";

//       const res = await fetch(endpoint, {
//         method,
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           ...formData,
//           supplierId,
//           totalAmount: parseFloat(formData.totalAmount),
//         }),
//       });

//       const resData = await res.json();
//       if (!res.ok) throw new Error(resData.error || "Operation failed");

//       toast.success(editingId ? "Updated successfully" : "Added successfully");

//       // Update local state without refetching to save bandwidth
//       setData((prev) => {
//         let newProcs = [...prev.procurements];
//         if (editingId) {
//           newProcs = newProcs.map((p) =>
//             p._id === editingId ? { ...p, ...formData } : p
//           );
//         } else {
//           newProcs.unshift({ ...formData, _id: resData._id || Date.now() }); // Optimistic add
//         }
//         return {
//           ...prev,
//           procurements: newProcs.sort(
//             (a, b) => new Date(b.date) - new Date(a.date)
//           ),
//         };
//       });

//       resetForm();
//     } catch (err) {
//       toast.error(err.message);
//     } finally {
//       setStatus((prev) => ({ ...prev, submitting: false }));
//     }
//   };

//   const handleDelete = async (id) => {
//     if (!confirm("Delete this record permanently?")) return;

//     setStatus((prev) => ({ ...prev, deletingId: id }));
//     try {
//       const res = await fetch(`/api/supplier/procurement?supplierId=${id}`, {
//         method: "DELETE",
//       });
//       if (!res.ok) throw new Error("Delete failed");

//       setData((prev) => ({
//         ...prev,
//         procurements: prev.procurements.filter((p) => p._id !== id),
//       }));
//       toast.success("Deleted successfully");
//     } catch (err) {
//       toast.error(err.message);
//     } finally {
//       setStatus((prev) => ({ ...prev, deletingId: null }));
//     }
//   };

//   const handleEdit = (item) => {
//     setEditingId(item._id);
//     setFormData({
//       date: item.date.split("T")[0],
//       milkQuantity: item.milkQuantity,
//       fatPercentage: item.fatPercentage || "",
//       snfPercentage: item.snfPercentage || "",
//       rate: item.rate,
//       totalAmount: item.totalAmount,
//     });
//     window.scrollTo({ top: 0, behavior: "smooth" });
//   };

//   const resetForm = () => {
//     setFormData(initialForm);
//     setEditingId(null);
//     setErrors({});
//   };

//   // 4. Render Helpers
//   const formatCurrency = (val) =>
//     new Intl.NumberFormat("en-IN", {
//       style: "currency",
//       currency: "INR",
//     }).format(val);

//   if (status.loading)
//     return (
//       <div className={styles.loadingState}>
//         <div className={styles.loadingSpinner}></div>
//       </div>
//     );
//   if (!data.supplier)
//     return (
//       <div className={styles.errorState}>
//         Supplier not found <button onClick={() => router.back()}>Back</button>
//       </div>
//     );

//   return (
//     <div className={styles.container}>
//       <ToastContainer position="top-right" autoClose={3000} />

//       {/* Header */}
//       <div className={styles.header}>
//         <button
//           onClick={() => router.push("/supplier")}
//           className={styles.backButton}
//         >
//           ← Back
//         </button>
//         <div className={styles.headerTitle}>
//           <h1>
//             {data.supplier.supplierName}{" "}
//             <span className={styles.supplierTypeBadge}>
//               {data.supplier.supplierType}
//             </span>
//           </h1>
//           <p>
//             {data.supplier.supplierNumber} | {data.supplier.supplierAddress}
//           </p>
//         </div>
//       </div>

//       {/* Summary */}
//       {data.procurements.length > 0 && (
//         <div className={styles.summaryCard}>
//           <div className={styles.summaryGrid}>
//             <SummaryItem
//               label="Total Milk"
//               value={`${summary.milk.toFixed(2)} L`}
//             />
//             <SummaryItem
//               label="Total Amount"
//               value={formatCurrency(summary.amount)}
//             />
//             <SummaryItem
//               label="Avg Rate"
//               value={
//                 summary.milk
//                   ? formatCurrency(summary.amount / summary.milk) + "/L"
//                   : "-"
//               }
//             />
//             <SummaryItem label="Records" value={data.procurements.length} />
//           </div>
//         </div>
//       )}

//       {/* Form */}
//       <div className={styles.formSection}>
//         <h2>{editingId ? "Edit Procurement" : "Add New Procurement"}</h2>
//         <form onSubmit={handleSubmit} className={styles.procurementForm}>
//           <div className={styles.formGrid}>
//             <InputGroup
//               label="Date"
//               name="date"
//               type="date"
//               value={formData.date}
//               onChange={handleInputChange}
//               error={errors.date}
//               max={getTodayDate()}
//               required
//             />
//             <InputGroup
//               label="Milk (L)"
//               name="milkQuantity"
//               type="number"
//               value={formData.milkQuantity}
//               onChange={handleInputChange}
//               error={errors.milkQuantity}
//               step="0.1"
//               required
//             />
//             <InputGroup
//               label="Fat %"
//               name="fatPercentage"
//               type="number"
//               value={formData.fatPercentage}
//               onChange={handleInputChange}
//               step="0.1"
//             />
//             <InputGroup
//               label="SNF %"
//               name="snfPercentage"
//               type="number"
//               value={formData.snfPercentage}
//               onChange={handleInputChange}
//               step="0.1"
//             />
//             <InputGroup
//               label="Rate (₹/L)"
//               name="rate"
//               type="number"
//               value={formData.rate}
//               onChange={handleInputChange}
//               error={errors.rate}
//               step="0.1"
//               required
//             />
//             <div className={styles.inputGroup}>
//               <label>Total (₹)</label>
//               <input
//                 value={formData.totalAmount}
//                 readOnly
//                 className={`${styles.input} ${styles.readOnlyInput}`}
//               />
//             </div>
//           </div>

//           <div className={styles.formActions}>
//             <button
//               type="submit"
//               disabled={status.submitting}
//               className={styles.submitButton}
//             >
//               {status.submitting
//                 ? "Processing..."
//                 : editingId
//                 ? "Update"
//                 : "Add Record"}
//             </button>
//             {(editingId || formData.milkQuantity) && (
//               <button
//                 type="button"
//                 onClick={resetForm}
//                 className={styles.resetButton}
//                 disabled={status.submitting}
//               >
//                 {editingId ? "Cancel Edit" : "Clear"}
//               </button>
//             )}
//           </div>
//         </form>
//       </div>

//       {/* List */}
//       <div className={styles.procurementsSection}>
//         {data.procurements.length === 0 ? (
//           <div className={styles.emptyState}>
//             No records found. Add one above.
//           </div>
//         ) : (
//           <div className={styles.tableContainer}>
//             <table className={styles.table}>
//               <thead>
//                 <tr>
//                   <th>Date</th>
//                   <th>Milk</th>
//                   <th>Fat</th>
//                   <th>SNF</th>
//                   <th>Rate</th>
//                   <th>Total</th>
//                   <th>Actions</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {data.procurements.map((item) => (
//                   <tr
//                     key={item._id}
//                     className={editingId === item._id ? styles.editingRow : ""}
//                   >
//                     <td>{new Date(item.date).toLocaleDateString("en-IN")}</td>
//                     <td>{parseFloat(item.milkQuantity).toFixed(2)}</td>
//                     <td>{item.fatPercentage || "-"}</td>
//                     <td>{item.snfPercentage || "-"}</td>
//                     <td>₹{item.rate}</td>
//                     <td>
//                       <b>₹{item.totalAmount}</b>
//                     </td>
//                     <td className={styles.actionsCell}>
//                       <button
//                         onClick={() => handleEdit(item)}
//                         // disabled={status.submitting || !!editingId}
//                         disabled={true}
//                         className={styles.editButton}
//                       >
//                         ✎
//                       </button>
//                       <button
//                         onClick={() => handleDelete(item._id)}
//                         // disabled={
//                         //   status.deletingId === item._id || status.submitting
//                         // }
//                         disabled={true}
//                         className={styles.deleteButton}
//                       >
//                         {status.deletingId === item._id ? "..." : "🗑"}
//                       </button>
//                     </td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// // Sub-components to clean up JSX
// const SummaryItem = ({ label, value }) => (
//   <div className={styles.summaryItem}>
//     <span className={styles.summaryLabel}>{label}</span>
//     <span className={styles.summaryValue}>{value}</span>
//   </div>
// );

// const InputGroup = ({ label, error, ...props }) => (
//   <div className={styles.inputGroup}>
//     <label className={props.required ? styles.requiredLabel : ""}>
//       {label}
//     </label>
//     <input
//       className={`${styles.input} ${error ? styles.inputError : ""}`}
//       {...props}
//     />
//     {error && <span className={styles.errorText}>{error}</span>}
//   </div>
// );

"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/procurement.module.css";
import { getTodayDate } from "@/utils/dateUtils";

// --- Sub-components (Keep these outside the main function) ---
const SummaryItem = ({ label, value }) => (
  <div className={styles.summaryItem}>
    <span className={styles.summaryLabel}>{label}</span>
    <span className={styles.summaryValue}>{value}</span>
  </div>
);

const InputGroup = ({ label, error, ...props }) => (
  <div className={styles.inputGroup}>
    <label className={props.required ? styles.requiredLabel : ""}>
      {label}
    </label>
    <input
      className={`${styles.input} ${error ? styles.inputError : ""}`}
      {...props}
    />
    {error && <span className={styles.errorText}>{error}</span>}
  </div>
);

function ProcurementContent() {

  const router = useRouter();
  const searchParams = useSearchParams();
  const supplierId = searchParams.get("supplierId");

  const [status, setStatus] = useState({
    loading: true,
    submitting: false,
    deletingId: null,
  });

  const [data, setData] = useState({ supplier: null, procurements: [] });
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});

  const initialForm = {
    date: getTodayDate(),
    milkQuantity: "",
    fatPercentage: "",
    snfPercentage: "",
    rate: "",
    totalAmount: "",
  };

  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    if (!supplierId) {
      const timer = setTimeout(() => {
        toast.error("No supplier selected");
        router.push("/supplier");
      }, 100);
      return () => clearTimeout(timer);
    }

    const loadData = async () => {
      try {
        const [suppRes, procRes] = await Promise.all([
          fetch(`/api/supplier?supplierId=${supplierId}`),
          fetch(`/api/supplier/procurement?supplierId=${supplierId}`),
        ]);

        if (!suppRes.ok || !procRes.ok) throw new Error("Failed to load data");

        const supplier = await suppRes.json();
        const procurements = await procRes.json();

        setData({
          supplier,
          procurements: Array.isArray(procurements)
            ? procurements.sort((a, b) => new Date(b.date) - new Date(a.date))
            : [],
        });
      } catch (error) {
        toast.error(error.message);
      } finally {
        setStatus((prev) => ({ ...prev, loading: false }));
      }
    };

    loadData();
  }, [supplierId, router]);

  // 2. Computed Summaries
  const summary = useMemo(() => {
    return data.procurements.reduce(
      (acc, curr) => ({
        milk: acc.milk + (parseFloat(curr.milkQuantity) || 0),
        amount: acc.amount + (parseFloat(curr.totalAmount) || 0),
      }),
      { milk: 0, amount: 0 }
    );
  }, [data.procurements]);

  // 3. Form Handling
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };

      // Auto-calculate Total
      if (name === "milkQuantity" || name === "rate") {
        const qty =
          parseFloat(name === "milkQuantity" ? value : prev.milkQuantity) || 0;
        const rate = parseFloat(name === "rate" ? value : prev.rate) || 0;
        next.totalAmount = (qty * rate).toFixed(2);
      }
      return next;
    });
    // Clear error on type
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.date) newErrors.date = "Date required";
    if (new Date(formData.date) > new Date(getTodayDate()))
      newErrors.date = "Future date not allowed";
    if (!formData.milkQuantity || parseFloat(formData.milkQuantity) <= 0)
      newErrors.milkQuantity = "Invalid quantity";
    if (!formData.rate || parseFloat(formData.rate) <= 0)
      newErrors.rate = "Invalid rate";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return toast.warning("Please check form errors");

    setStatus((prev) => ({ ...prev, submitting: true }));
    try {
      const method = editingId ? "PUT" : "POST";
      const endpoint = editingId
        ? `/api/supplier/procurement?id=${editingId}`
        : "/api/supplier/procurement";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          supplierId,
          totalAmount: parseFloat(formData.totalAmount),
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Operation failed");

      toast.success(editingId ? "Updated successfully" : "Added successfully");

      // Update local state without refetching to save bandwidth
      setData((prev) => {
        let newProcs = [...prev.procurements];
        if (editingId) {
          newProcs = newProcs.map((p) =>
            p._id === editingId ? { ...p, ...formData } : p
          );
        } else {
          newProcs.unshift({ ...formData, _id: resData._id || Date.now() }); // Optimistic add
        }
        return {
          ...prev,
          procurements: newProcs.sort(
            (a, b) => new Date(b.date) - new Date(a.date)
          ),
        };
      });

      resetForm();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setStatus((prev) => ({ ...prev, submitting: false }));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this record permanently?")) return;

    setStatus((prev) => ({ ...prev, deletingId: id }));
    try {
      const res = await fetch(`/api/supplier/procurement?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");

      setData((prev) => ({
        ...prev,
        procurements: prev.procurements.filter((p) => p._id !== id),
      }));
      toast.success("Deleted successfully");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setStatus((prev) => ({ ...prev, deletingId: null }));
    }
  };

  const handleEdit = (item) => {
    setEditingId(item._id);
    setFormData({
      date: item.date.split("T")[0],
      milkQuantity: item.milkQuantity,
      fatPercentage: item.fatPercentage || "",
      snfPercentage: item.snfPercentage || "",
      rate: item.rate,
      totalAmount: item.totalAmount,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setFormData(initialForm);
    setEditingId(null);
    setErrors({});
  };

  // 4. Render Helpers
  const formatCurrency = (val) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(val);

  if (status.loading)
    return (
      <div className={styles.loadingState}>
        <div className={styles.loadingSpinner}></div>
      </div>
    );
  if (!data.supplier)
    return (
      <div className={styles.errorState}>
        Supplier not found <button onClick={() => router.back()}>Back</button>
      </div>
    );

  return (
    <div className={styles.container}>
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Header */}
      <div className={styles.header}>
        <button
          onClick={() => router.push("/supplier")}
          className={styles.backButton}
        >
          ← Back
        </button>
        <div className={styles.headerTitle}>
          <h1>
            {data.supplier.supplierName}{" "}
            <span className={styles.supplierTypeBadge}>
              {data.supplier.supplierType}
            </span>
          </h1>
          <p>
            {data.supplier.supplierNumber} | {data.supplier.supplierAddress}
          </p>
        </div>
      </div>

      {/* Summary */}
      {data.procurements.length > 0 && (
        <div className={styles.summaryCard}>
          <div className={styles.summaryGrid}>
            <SummaryItem
              label="Total Milk"
              value={`${summary.milk.toFixed(2)} L`}
            />
            <SummaryItem
              label="Total Amount"
              value={formatCurrency(summary.amount)}
            />
            <SummaryItem
              label="Avg Rate"
              value={
                summary.milk
                  ? formatCurrency(summary.amount / summary.milk) + "/L"
                  : "-"
              }
            />
            <SummaryItem label="Records" value={data.procurements.length} />
          </div>
        </div>
      )}

      {/* Form */}
      <div className={styles.formSection}>
        <h2>{editingId ? "Edit Procurement" : "Add New Procurement"}</h2>
        <form onSubmit={handleSubmit} className={styles.procurementForm}>
          <div className={styles.formGrid}>
            <InputGroup
              label="Date"
              name="date"
              type="date"
              value={formData.date}
              onChange={handleInputChange}
              error={errors.date}
              max={getTodayDate()}
              required
            />
            <InputGroup
              label="Milk (L)"
              name="milkQuantity"
              type="number"
              value={formData.milkQuantity}
              onChange={handleInputChange}
              error={errors.milkQuantity}
              step="0.1"
              required
            />
            <InputGroup
              label="Fat %"
              name="fatPercentage"
              type="number"
              value={formData.fatPercentage}
              onChange={handleInputChange}
              step="0.1"
            />
            <InputGroup
              label="SNF %"
              name="snfPercentage"
              type="number"
              value={formData.snfPercentage}
              onChange={handleInputChange}
              step="0.1"
            />
            <InputGroup
              label="Rate (₹/L)"
              name="rate"
              type="number"
              value={formData.rate}
              onChange={handleInputChange}
              error={errors.rate}
              step="0.1"
              required
            />
            <div className={styles.inputGroup}>
              <label>Total (₹)</label>
              <input
                value={formData.totalAmount}
                readOnly
                className={`${styles.input} ${styles.readOnlyInput}`}
              />
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="submit"
              disabled={status.submitting}
              className={styles.submitButton}
            >
              {status.submitting
                ? "Processing..."
                : editingId
                ? "Update"
                : "Add Record"}
            </button>
            {(editingId || formData.milkQuantity) && (
              <button
                type="button"
                onClick={resetForm}
                className={styles.resetButton}
                disabled={status.submitting}
              >
                {editingId ? "Cancel Edit" : "Clear"}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* List */}
      <div className={styles.procurementsSection}>
        {data.procurements.length === 0 ? (
          <div className={styles.emptyState}>
            No records found. Add one above.
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Milk</th>
                  <th>Fat</th>
                  <th>SNF</th>
                  <th>Rate</th>
                  <th>Total</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.procurements.map((item) => (
                  <tr
                    key={item._id}
                    className={editingId === item._id ? styles.editingRow : ""}
                  >
                    <td>{new Date(item.date).toLocaleDateString("en-IN")}</td>
                    <td>{parseFloat(item.milkQuantity).toFixed(2)}</td>
                    <td>{item.fatPercentage || "-"}</td>
                    <td>{item.snfPercentage || "-"}</td>
                    <td>₹{item.rate}</td>
                    <td>
                      <b>₹{item.totalAmount}</b>
                    </td>
                    <td className={styles.actionsCell}>
                      <button
                        onClick={() => handleEdit(item)}
                        // disabled={status.submitting || !!editingId}
                        disabled={true}
                        className={styles.editButton}
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDelete(item._id)}
                        // disabled={
                        //   status.deletingId === item._id || status.submitting
                        // }
                        disabled={true}
                        className={styles.deleteButton}
                      >
                        {status.deletingId === item._id ? "..." : "🗑"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// --- DEFAULT EXPORT WITH SUSPENSE BOUNDARY ---
export default function ProcurementPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner}></div>
          <p>Loading procurement data...</p>
        </div>
      }
    >
      <ProcurementContent />
    </Suspense>
  );
}
