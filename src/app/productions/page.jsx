"use client";

import Link from "next/link";
import { useEffect, useState, useReducer, useCallback } from "react";
import styles from "./production.module.css"
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function Production() {
  // Generate batch number based on current date
  const generateBatchNumber = () => {
    const date = new Date();
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    return `B${day}${month}${year}`;
  };

  const INITIAL_PRODUCT_STATE = {
    date: new Date().toISOString().slice(0, 10),
    batch: generateBatchNumber(), // Initialize batch directly
    milk_quantity: undefined,
    curd_quantity: undefined,
    premium_paneer_quantity: undefined,
    soft_paneer_quantity: undefined,
    butter_quantity: undefined,
    cream_quantity: undefined,
    ghee_quantity: undefined,
  };

  const [formData, setFormData] = useState(INITIAL_PRODUCT_STATE);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [filterBy, setFilterBy] = useState("");

//   useEffect(() => {
//     fetchData();
//   }, []);

//   useEffect(() => {
//     if (filterBy) {
//       filterProducts();
//     } else {
//       fetchData();
//     }
//   }, [filterBy]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/production");
      const data = await res.json();
      if (res.ok) {
        setEntries(data);
      } else {
        toast.error("Failed to fetch data");
      }
    } catch (error) {
      toast.error("Error fetching data");
    }
    setLoading(false);
  }

  async function filterProducts() {
    setLoading(true);
    try {
      const res = await fetch(`/api/production?product=${filterBy}`);
      const data = await res.json();
      if (res.ok) {
        setEntries(data);
      } else {
        toast.error("Failed to filter data");
      }
    } catch (error) {
      toast.error("Error filtering data");
    }
    setLoading(false);
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value 
    }));
  };

  const resetForm = () => {
    setFormData({
      ...INITIAL_PRODUCT_STATE,
      batch: generateBatchNumber(), // Generate new batch on reset
    });
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      
      if (res.ok) {
        toast.success("Production data added successfully!");
        resetForm(); // Use the reset function
        fetchData();
      } else {
        toast.error(data.error || "Submission failed");
      }
    } catch (error) {
      toast.error("Error submitting data");
    }
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!confirm("Are you sure you want to delete this entry?")) return;

    try {
      const res = await fetch(`/api/production?id=${id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      
      if (res.ok) {
        toast.success("Entry deleted successfully!");
        fetchData();
      } else {
        toast.error(data.error || "Deletion failed");
      }
    } catch (error) {
      toast.error("Error deleting entry");
    }
  }

  return (
    <div className={styles.container}>
      <ToastContainer />
      <h1>Production Entry</h1>
      
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.inputGroup}>
          <label>Date:</label>
          <input 
            type="date" 
            value={formData.date}
            onChange={(e) => handleInputChange('date', e.target.value)}
            className={styles.input}
          />
        </div>

        <div className={styles.inputGroup}>
          <label>Batch:</label>
          <input 
            type="text" 
            value={formData.batch}
            onChange={(e) => handleInputChange('batch', e.target.value)}
            className={styles.input}
            placeholder="Batch number"
          />
        </div>

        <div className={styles.productRow}>
          <div className={styles.inputGroup}>
            <label>Milk Quantity (L):</label>
            <input 
              type="number" 
              value={formData.milk_quantity}
              onChange={(e) => handleInputChange('milk_quantity', e.target.value)}
              placeholder="15L"
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.productRow}>
          <div className={styles.inputGroup}>
            <label>Curd Quantity (Kg):</label>
            <input 
              type="number" 
              value={formData.curd_quantity}
              onChange={(e) => handleInputChange('curd_quantity', e.target.value)}
              placeholder="15L"
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.productRow}>      
          <div className={styles.inputGroup}>
            <label>Premium Paneer Quantity (Kg):</label>
            <input 
              type="number" 
              value={formData.premium_paneer_quantity}
              onChange={(e) => handleInputChange('premium_paneer_quantity', e.target.value)}
              placeholder="15Kg"
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.productRow}>
          <div className={styles.inputGroup}>
            <label>Soft Paneer Quantity (kg):</label>
            <input 
              type="number" 
              value={formData.soft_paneer_quantity}
              onChange={(e) => handleInputChange('soft_paneer_quantity', e.target.value)}
              placeholder="15Kg"
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.productRow}>
          <div className={styles.inputGroup}>
            <label>Butter Quantity (kg):</label>
            <input 
              type="number" 
              value={formData.butter_quantity}
              onChange={(e) => handleInputChange('butter_quantity', e.target.value)}
              placeholder="15Kg"
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.productRow}>
          <div className={styles.inputGroup}>
            <label>Cream Quantity (kg):</label>
            <input 
              type="number" 
              value={formData.cream_quantity}
              onChange={(e) => handleInputChange('cream_quantity', e.target.value)}
              placeholder="15L"
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.productRow}>
          <div className={styles.inputGroup}>
            <label>Ghee Quantity (kg):</label>
            <input 
              type="number" 
              value={formData.ghee_quantity}
              onChange={(e) => handleInputChange('ghee_quantity', e.target.value)}
              placeholder="15L"
              className={styles.input}
            />
          </div>
        </div>

        <button type="submit" disabled={loading} className={styles.submitBtn}>
          {loading ? "Submitting..." : "Submit"}
        </button>
      </form>

      <div className={styles.filter}>
        <label>Filter by Product:</label>
        <select
          value={filterBy}
          onChange={(e) => setFilterBy(e.target.value)}
          className={styles.select}
        >
          <option value="">All Products</option>
          <option value="milk">Milk</option>
          <option value="curd">Curd</option>
          <option value="premium_paneer">Premium Paneer</option>
          <option value="soft_paneer">Soft Paneer</option>
          <option value="butter">Butter</option>
          <option value="cream">Cream</option>
          <option value="ghee">Ghee</option>
        </select>
      </div>

      <div className={styles.tableWrapper}>
        {loading ? (
          <p>Loading...</p>
        ) : entries.length === 0 ? (
          <h3>No production data found</h3>
        ) : (
          <>
            <h3>Production History</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Batch</th>
                  <th>Milk</th>
                  <th>Curd</th>
                  <th>Premium Paneer</th>
                  <th>Soft Paneer</th>
                  <th>Butter</th>
                  <th>Cream</th>
                  <th>Ghee</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((item) => (
                  <tr key={item._id}>
                    <td>{new Date(item.date).toLocaleDateString("en-IN")}</td>
                    <td>{item.batch}</td>
                    <td>{item.milk_quantity}</td>
                    <td>{item.curd_quantity}</td>
                    <td>{item.premium_paneer_quantity}</td>
                    <td>{item.soft_paneer_quantity}</td>
                    <td>{item.butter_quantity}</td>
                    <td>{item.cream_quantity}</td>
                    <td>{item.ghee_quantity}</td>
                    <td>
                      <button 
                        onClick={() => handleDelete(item._id)}
                        className={styles.deleteBtn}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}