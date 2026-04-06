"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import styles from "./page.module.css";
import { getTodayDate, getPreviousMonthDate } from "@/utils/dateUtils";
import {
  formatNumberWithCommas,
  formatNumberWithCommasNoDecimal,
} from "@/utils/formatNumberWithComma";

// Helper: format date range label
const getFormattedDateRange = (startDate, endDate) => {
  if (startDate && endDate) {
    const from = new Date(startDate).toLocaleDateString("en-IN");
    const to = new Date(endDate).toLocaleDateString("en-IN");
    return from === to ? from : `${from} – ${to}`;
  }
  return "All Records";
};

// Reusable stat item component
const StatItem = ({ label, value, colorClass = "" }) => (
  <div className={styles.global_stat_item}>
    <div className={styles.global_stat_label}>{label}</div>
    <div className={`${styles.global_stat_value} ${colorClass}`}>{value}</div>
  </div>
);

export default function Home() {
  const { data: session, status } = useSession();

  // Filter state (default: last month to today)
  const [filters, setFilters] = useState({
    startDate: getPreviousMonthDate(),
    endDate: getTodayDate(),
  });

  // Data states
  const [customerData, setCustomerData] = useState({ orders: [], summary: {} });
  const [supplierData, setSupplierData] = useState({
    procurements: [],
    summary: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch both customer orders and supplier procurements
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (filters.startDate) params.append("startDate", filters.startDate);
        if (filters.endDate) params.append("endDate", filters.endDate);

        const [customerRes, supplierRes] = await Promise.all([
          fetch(`/api/customer/order/history?${params}`),
          fetch(`/api/supplier/procurement/history?${params}`),
        ]);

        // Handle customer data
        if (!customerRes.ok) throw new Error("Failed to fetch customer data");
        const customerJson = await customerRes.json();
        setCustomerData({
          orders: customerJson.orders || [],
          summary: customerJson.summary || {
            orderCount: 0,
            totalAmount: 0,
            paidAmount: 0,
            dueAmount: 0,
          },
        });

        // Handle supplier data – resilient to different response shapes
        let supplierJson = {};
        let procurements = [];
        let summary = {
          totalMilk: 0,
          totalAmount: 0,
          paidAmount: 0,
          dueAmount: 0,
        };
        if (supplierRes.ok) {
          supplierJson = await supplierRes.json();
          if (Array.isArray(supplierJson)) {
            procurements = supplierJson;
            summary = procurements.reduce(
              (acc, p) => {
                const amt = p.totalAmount || 0;
                acc.totalMilk += p.milkQuantity || 0;
                acc.totalAmount += amt;
                if (p.paymentStatus === "Paid") acc.paidAmount += amt;
                else acc.dueAmount += amt;
                return acc;
              },
              { totalMilk: 0, totalAmount: 0, paidAmount: 0, dueAmount: 0 },
            );
          } else if (supplierJson.procurements) {
            procurements = supplierJson.procurements;
            summary = supplierJson.summary || summary;
          } else {
            procurements = supplierJson.data || [];
          }
        } else {
          console.warn("Supplier API failed, using empty data");
        }
        setSupplierData({ procurements, summary });
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [filters]);

  // Compute customer due amounts (aggregated by customer)
  const customerDueList = useMemo(() => {
    const dueMap = new Map();
    customerData.orders.forEach((order) => {
      if (order.paymentStatus === "Not Paid") {
        const existing = dueMap.get(order.customerId) || {
          name: order.customerName,
          due: 0,
        };
        existing.due += order.totalAmount;
        dueMap.set(order.customerId, existing);
      }
    });
    return Array.from(dueMap.values()).sort((a, b) => b.due - a.due);
  }, [customerData.orders]);

  // Compute supplier due amounts (aggregated by supplier)
  const supplierDueList = useMemo(() => {
    const dueMap = new Map();
    supplierData.procurements.forEach((proc) => {
      if (proc.paymentStatus !== "Paid") {
        // Not Paid or partial
        const existing = dueMap.get(proc.supplierId) || {
          name: proc.supplierName,
          due: 0,
        };
        existing.due += proc.totalAmount || 0;
        dueMap.set(proc.supplierId, existing);
      }
    });
    return Array.from(dueMap.values()).sort((a, b) => b.due - a.due);
  }, [supplierData.procurements]);

  const handleSignOut = () => signOut({ callbackUrl: "/login" });

  // Loading state
  if (loading) {
    return (
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <div className={styles.logo}>
            <h1>Dairy Dashboard</h1>
          </div>
          <div className={styles.userInfo}>Loading dashboard...</div>
        </header>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Fetching latest data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <div className={styles.logo}>
            <h1>Dairy Dashboard</h1>
          </div>
          <div className={styles.userInfo}>Error</div>
        </header>
        <div className={styles.errorContainer}>
          <p>⚠️ {error}</p>
          <button
            onClick={() => window.location.reload()}
            className={styles.retryBtn}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* Header with user info */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <h1>Dairy Dashboard</h1>
        </div>
        <div className={styles.userInfo}>
          {status === "authenticated" ? (
            <>
              <span className={styles.userEmail}>{session.user?.email}</span>
              {session.user?.role === "admin" && (
                <span className={styles.adminBadge}>Admin</span>
              )}
              <button onClick={handleSignOut} className={styles.logoutBtn}>
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className={styles.loginLink}>
              Log in
            </Link>
          )}
        </div>
      </header>

      {/* ========== CUSTOMER SUMMARY CARD ========== */}
      {customerData.summary.totalAmount > 0 && (
        <div className={styles.global_summary_card}>
          <div className={styles.global_header}>
            <h2 className={styles.global_title}>All Customers Summary</h2>
            <span className={styles.date_range_badge}>
              {getFormattedDateRange(filters.startDate, filters.endDate)}
            </span>
          </div>
          <div className={styles.global_stats_grid}>
            <StatItem
              label="Total Orders"
              value={customerData.summary.orderCount}
            />
            <StatItem
              label="Total Amount"
              value={`₹${formatNumberWithCommas(customerData.summary.totalAmount.toFixed(2))}`}
            />
            <StatItem
              label="Total Paid"
              value={`₹${formatNumberWithCommas(customerData.summary.paidAmount.toFixed(2))}`}
              colorClass={styles.text_green}
            />
            <StatItem
              label="Total Due"
              value={`₹${formatNumberWithCommas(customerData.summary.dueAmount.toFixed(2))}`}
              colorClass={styles.text_red}
            />
          </div>
        </div>
      )}

      {/* ========== CUSTOMER DUE TABLE ========== */}
      {customerDueList.length > 0 && (
        <div className={styles.global_summary_card}>
          <div className={styles.global_header}>
            <h2 className={styles.global_title}>
              Customers with Outstanding Dues
            </h2>
            <span className={styles.date_range_badge}>
              As of {getTodayDate()}
            </span>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.dueTable}>
              <thead>
                <tr>
                  <th>Customer Name</th>
                  <th>Total Due (₹)</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {customerDueList.map((customer) => (
                  <tr key={customer.name}>
                    <td>{customer.name}</td>
                    <td className={styles.text_red}>
                      ₹{formatNumberWithCommasNoDecimal(customer.due)}
                    </td>
                    <td>
                      <Link
                        href={`/customer/payments?customerId=${encodeURIComponent(customer.name)}`}
                        className={styles.viewLink}
                      >
                        View Payments
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== SUPPLIER SUMMARY CARD ========== */}
      {supplierData.summary.totalAmount > 0 && (
        <div className={styles.global_summary_card}>
          <div className={styles.global_header}>
            <h2 className={styles.global_title}>All Suppliers Summary</h2>
            <span className={styles.date_range_badge}>
              {getFormattedDateRange(filters.startDate, filters.endDate)}
            </span>
          </div>
          <div className={styles.global_stats_grid}>
            <StatItem
              label="Total Milk"
              value={`${formatNumberWithCommas(supplierData.summary.totalMilk.toFixed(1))} L`}
            />
            <StatItem
              label="Total Amount"
              value={`₹${formatNumberWithCommas(supplierData.summary.totalAmount.toFixed(2))}`}
            />
            <StatItem
              label="Total Paid"
              value={`₹${formatNumberWithCommas(supplierData.summary.paidAmount.toFixed(2))}`}
              colorClass={styles.text_green}
            />
            <StatItem
              label="Total Due"
              value={`₹${formatNumberWithCommas(supplierData.summary.dueAmount.toFixed(2))}`}
              colorClass={styles.text_red}
            />
          </div>
        </div>
      )}

      {/* ========== SUPPLIER DUE TABLE ========== */}
      {supplierDueList.length > 0 && (
        <div className={styles.global_summary_card}>
          <div className={styles.global_header}>
            <h2 className={styles.global_title}>
              Suppliers with Outstanding Dues
            </h2>
            <span className={styles.date_range_badge}>
              As of {getTodayDate()}
            </span>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.dueTable}>
              <thead>
                <tr>
                  <th>Supplier Name</th>
                  <th>Total Due (₹)</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {supplierDueList.map((supplier) => (
                  <tr key={supplier.name}>
                    <td>{supplier.name}</td>
                    <td className={styles.text_red}>
                      ₹{formatNumberWithCommasNoDecimal(supplier.due)}
                    </td>
                    <td>
                      <Link
                        href={`/supplier/payments?supplierId=${encodeURIComponent(supplier.name)}`}
                        className={styles.viewLink}
                      >
                        View Payments
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== MAIN NAVIGATION GRID ========== */}
      <div className={styles.navGrid}>
        <Link href="/productions" className={styles.navCard}>
          <div className={styles.navIcon}>🏭</div>
          <h2>Production</h2>
          <p>Record daily milk production and by‑products</p>
        </Link>

        <Link href="/customer" className={styles.navCard}>
          <div className={styles.navIcon}>👥</div>
          <h2>Customers</h2>
          <p>View and manage customer details</p>
        </Link>

        <Link href="/customer/payments" className={styles.navCard}>
          <div className={styles.navIcon}>💵</div>
          <h2>Customers Payments</h2>
          <p>Track and mark payments to Customers</p>
        </Link>

        <Link href="/supplier" className={styles.navCard}>
          <div className={styles.navIcon}>🚜</div>
          <h2>Suppliers</h2>
          <p>Manage supplier information and rates</p>
        </Link>

        <Link href="/supplier/payments" className={styles.navCard}>
          <div className={styles.navIcon}>💵</div>
          <h2>Supplier Payments</h2>
          <p>Track and settle payments to suppliers</p>
        </Link>

        <Link href="/productions/analytics" className={styles.navCard}>
          <div className={styles.navIcon}>📊</div>
          <h2>Productions Analytics</h2>
          <p>View production insights and reports</p>
        </Link>

        <Link href="/supplier/analytics" className={styles.navCard}>
          <div className={styles.navIcon}>📊</div>
          <h2>Suppliers Analytics</h2>
          <p>View suppliers insights and reports</p>
        </Link>

        <Link href="/customer/analytics" className={styles.navCard}>
          <div className={styles.navIcon}>📊</div>
          <h2>Customers Analytics</h2>
          <p>View customer insights and reports</p>
        </Link>
      </div>
    </div>
  );
}
