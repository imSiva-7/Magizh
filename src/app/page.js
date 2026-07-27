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
import Image from "next/image";

const StatItem = ({ label, value, colorClass = "", className = "" }) => (
  <div className={`${styles.global_stat_item} ${className}`}>
    <div className={styles.global_stat_label}>{label}</div>
    <div className={`${styles.global_stat_value} ${colorClass}`}>{value}</div>
  </div>
);

export default function Home() {
  const { data: session, status } = useSession();

  const [filters, setFilters] = useState({
    startDate: getPreviousMonthDate(),
    endDate: getTodayDate(),
  });

  const [customerData, setCustomerData] = useState({
    orders: [],
    summary: {},
  });
  const [supplierData, setSupplierData] = useState({
    procurements: [],
    summary: {},
  });
  const [productionSummary, setProductionSummary] = useState(null);
  const [stockBalance, setStockBalance] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [customerRes, supplierRes, productionRes, stockRes] = await Promise.all([
          fetch(`/api/customer/order/history`),
          fetch(`/api/supplier/procurement/history`),
          fetch(`/api/production/history`),
          fetch(`/api/stock/balance`),
        ]);

        if (!customerRes.ok) throw new Error("Failed to fetch customer data");
        const customerJson = await customerRes.json();
        setCustomerData({
          orders: customerJson.orders || [],
          summary: customerJson.summary || { orderCount: 0, totalAmount: 0, paidAmount: 0, dueAmount: 0 },
        });

        let supplierJson = {};
        let procurements = [];
        let supplierSummary = { totalMilk: 0, totalAmount: 0, paidAmount: 0, dueAmount: 0 };
        if (supplierRes.ok) {
          supplierJson = await supplierRes.json();
          if (Array.isArray(supplierJson)) {
            procurements = supplierJson;
            supplierSummary = procurements.reduce((acc, p) => {
              const amt = p.totalAmount || 0;
              acc.totalMilk += p.milkQuantity || 0;
              acc.totalAmount += amt;
              if (p.paymentStatus === "Paid") acc.paidAmount += amt;
              else acc.dueAmount += amt;
              return acc;
            }, { totalMilk: 0, totalAmount: 0, paidAmount: 0, dueAmount: 0 });
          } else if (supplierJson.procurements) {
            procurements = supplierJson.procurements;
            supplierSummary = supplierJson.summary || supplierSummary;
          } else {
            procurements = supplierJson.data || [];
          }
        }
        setSupplierData({ procurements, summary: supplierSummary });

        if (productionRes.ok) {
          const productionData = await productionRes.json();
          if (Array.isArray(productionData)) {
            const prodSummary = productionData.reduce((acc, entry) => {
              acc.milk_quantity += entry.milk_quantity || 0;
              acc.curd_quantity += entry.curd_quantity || 0;
              acc.cream_quantity += entry.cream_quantity || 0;
              acc.soft_paneer_quantity += entry.soft_paneer_quantity || 0;
              acc.premium_paneer_quantity += entry.premium_paneer_quantity || 0;
              acc.butter_quantity += entry.butter_quantity || 0;
              acc.ghee_quantity += entry.ghee_quantity || 0;
              return acc;
            }, {
              milk_quantity: 0, curd_quantity: 0, cream_quantity: 0,
              soft_paneer_quantity: 0, premium_paneer_quantity: 0,
              butter_quantity: 0, ghee_quantity: 0,
            });
            setProductionSummary(prodSummary);
          }
        }

        if (stockRes.ok) {
          const stockData = await stockRes.json();
          setStockBalance(stockData || {});
        }
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [filters]);

  const customerDueList = useMemo(() => {
    const dueMap = new Map();
    customerData.orders.forEach((order) => {
      if (order.paymentStatus === "Not Paid") {
        const existing = dueMap.get(order.customerId) || { id: order.customerId, name: order.customerName, due: 0 };
        existing.due += order.totalAmount;
        dueMap.set(order.customerId, existing);
      }
    });
    return Array.from(dueMap.values()).sort((a, b) => b.due - a.due);
  }, [customerData.orders]);

  const supplierDueList = useMemo(() => {
    const dueMap = new Map();
    supplierData.procurements.forEach((proc) => {
      if (proc.paymentStatus !== "Paid") {
        const existing = dueMap.get(proc.supplierId) || { name: proc.supplierName, id: proc.supplierId, due: 0 };
        existing.due += proc.totalAmount || 0;
        dueMap.set(proc.supplierId, existing);
      }
    });
    return Array.from(dueMap.values()).sort((a, b) => b.due - a.due);
  }, [supplierData.procurements]);

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <header className={styles.header}><div className={styles.logo}><h1>Dashboard</h1></div></header>
        <div className={styles.loadingContainer}><div className={styles.spinner}></div><p>Loading...</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <div className={styles.logo}><h1>Dashboard</h1></div>
          <div className={styles.userInfo}>Error</div>
        </header>
        <div className={styles.errorContainer}>
          <p>⚠️ {error}</p>
          <button onClick={() => window.location.reload()} className={styles.retryBtn}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <h1>Dashboard</h1>
        </div>
        <div className={styles.userInfo}>
          {status === "authenticated" ? (
            <>
              <span className={styles.userEmail}>{session.user?.email}</span>
              {session.user?.role === "admin" && <span className={styles.adminBadge}>Admin</span>}
            </>
          ) : (
            <Link href="/login" className={styles.loginLink}>Log in</Link>
          )}
        </div>
      </header>

      {/* Production Summary with its own stat item class */}
       {/* {productionSummary && (
        <div className={styles.global_summary_card}>
          <div className={styles.global_header}>
            <h2 className={styles.global_title}>Total Production</h2>
            <span className={styles.date_range_badge}>All time</span>
          </div>
          <div className={styles.three_col_grid}>
          Comment this  <StatItem label="Milk (L)" value={formatNumberWithCommas(productionSummary.milk_quantity.toFixed(1))} className={styles.production_stat_item} />
            <StatItem label="Curd (kg)" value={formatNumberWithCommas(productionSummary.curd_quantity.toFixed(1))} className={styles.production_stat_item} />
            <StatItem label="Cream (kg)" value={formatNumberWithCommas(productionSummary.cream_quantity.toFixed(1))} className={styles.production_stat_item} />
            <StatItem label="Soft Paneer (kg)" value={formatNumberWithCommas(productionSummary.soft_paneer_quantity.toFixed(1))} className={styles.production_stat_item} />
            <StatItem label="Premium Paneer (kg)" value={formatNumberWithCommas(productionSummary.premium_paneer_quantity.toFixed(1))} className={styles.production_stat_item} />
            <StatItem label="Butter (kg)" value={formatNumberWithCommas(productionSummary.butter_quantity.toFixed(1))} className={styles.production_stat_item} />
            <StatItem label="Ghee (L)" value={formatNumberWithCommas(productionSummary.ghee_quantity.toFixed(1))} className={styles.production_stat_item} />
          </div>
        </div>
      )} */}

      {/* Stock Summary with its own stat item class */}
      {/* {stockBalance && (
        <div className={styles.global_summary_card}>
          <div className={styles.global_header}>
            <h2 className={styles.global_title}>Current Stock</h2>
            <span className={styles.date_range_badge}>Live</span>
          </div>
          <div className={styles.three_col_grid}>
            <StatItem label="Butter (kg)" value={formatNumberWithCommas((stockBalance.butter || 0).toFixed(1))} className={styles.stock_stat_item} />
            <StatItem label="Cream (kg)" value={formatNumberWithCommas((stockBalance.cream || 0).toFixed(1))} className={styles.stock_stat_item} />
            <StatItem label="Curd (kg)" value={formatNumberWithCommas((stockBalance.curd || 0).toFixed(1))} className={styles.stock_stat_item} />
            <StatItem label="Ghee (L)" value={formatNumberWithCommas((stockBalance.ghee || 0).toFixed(1))} className={styles.stock_stat_item} />
            <StatItem label="Soft Paneer (kg)" value={formatNumberWithCommas((stockBalance.soft_paneer || 0).toFixed(1))} className={styles.stock_stat_item} />
            <StatItem label="Premium Paneer (kg)" value={formatNumberWithCommas((stockBalance.premium_paneer || 0).toFixed(1))} className={styles.stock_stat_item} />
          </div>
        </div>
      )}  */}

      {/* Supplier Summary */}
      {supplierData.summary.totalAmount > 0 && (
        <div className={styles.global_summary_card}>
          <div className={styles.global_header}>
            <h2 className={styles.global_title}>Suppliers Summary</h2>
            <span className={styles.date_range_badge}>As of {getTodayDate()}</span>
          </div>
          <div className={styles.global_stats_grid}>
            <StatItem label="Total Milk" value={`${formatNumberWithCommas(supplierData.summary.totalMilk.toFixed(1))} L`} />
            <StatItem label="Total Amount" value={`₹${formatNumberWithCommas(supplierData.summary.totalAmount.toFixed(2))}`} />
            <StatItem label="Total Paid" value={`₹${formatNumberWithCommas(supplierData.summary.paidAmount.toFixed(2))}`} colorClass={styles.text_green} />
            <StatItem label="Total Due" value={`₹${formatNumberWithCommas(supplierData.summary.dueAmount.toFixed(2))}`} colorClass={styles.text_red} />
          </div>
        </div>
      )}

      {/* Customer Summary */}
      {customerData.summary.totalAmount > 0 && (
        <div className={styles.global_summary_card}>
          <div className={styles.global_header}>
            <h2 className={styles.global_title}>Customers Summary</h2>
            <span className={styles.date_range_badge}>As of {getTodayDate()}</span>
          </div>
          <div className={styles.global_stats_grid}>
            <StatItem label="Total Orders" value={customerData.summary.orderCount} />
            <StatItem label="Total Amount" value={`₹${formatNumberWithCommas(customerData.summary.totalAmount.toFixed(2))}`} />
            <StatItem label="Total Received" value={`₹${formatNumberWithCommas(customerData.summary.paidAmount.toFixed(2))}`} colorClass={styles.text_green} />
            <StatItem label="Total Outstanding" value={`₹${formatNumberWithCommas(customerData.summary.dueAmount.toFixed(2))}`} colorClass={styles.text_red} />
          </div>
        </div>
      )}

      {/* Supplier Due Table */}
      {supplierDueList.length > 0 && (
        <div className={styles.global_summary_card}>
          <div className={styles.global_header}><h2 className={styles.global_title}>Suppliers Dues</h2></div>
          <div className={styles.tableWrapper}>
            <table className={styles.dueTable}>
              <thead><tr><th>Supplier Name</th><th>Total Due (₹)</th></tr></thead>
              <tbody>
                {supplierDueList.map((supplier) => (
                  <tr key={supplier.id}>
                    <td><Link href={`/supplier/procurement?supplierId=${supplier.id}`} className={styles.supplierName}>{supplier.name || "-"}</Link></td>
                    <td className={styles.text_red}>₹{formatNumberWithCommasNoDecimal(supplier.due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer Due Table */}
      {customerDueList.length > 0 && (
        <div className={styles.global_summary_card}>
          <div className={styles.global_header}><h2 className={styles.global_title}>Customers Dues</h2></div>
          <div className={styles.tableWrapper}>
            <table className={styles.dueTable}>
              <thead><tr><th>Customer Name</th><th>Total Due (₹)</th></tr></thead>
              <tbody>
                {customerDueList.map((customer) => (
                  <tr key={customer.id}>
                    <td><Link href={`/customer/order?customerId=${customer.id}`} className={styles.customerName}>{customer.name || "-"}</Link></td>
                    <td className={styles.text_red}>₹{formatNumberWithCommasNoDecimal(customer.due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Navigation Cards (OLD LINKS RESTORED) */}
      <div className={styles.navGrid}>
        <Link href="/productions" className={styles.navCard}>
          <div className={styles.navIcon}><Image src="/industrial-park.png" alt="Production" width={30} height={30} /></div>
          <h2>Production</h2>
          <p>Record daily milk production and by‑products</p>
        </Link>
        <Link href="/supplier" className={styles.navCard}>
          <div className={styles.navIcon}><Image src="/wholesale.png" alt="Supplier" width={30} height={30} /></div>
          <h2>Suppliers</h2>
          <p>Manage supplier information and rates</p>
        </Link>
        <Link href="/customer" className={styles.navCard}>
          <div className={styles.navIcon}><Image src="/customer.png" alt="Customer" width={30} height={30} /></div>
          <h2>Customers</h2>
          <p>View and manage customer details</p>
        </Link>
        <Link href="/supplier/payments" className={styles.navCard}>
          <div className={styles.navIcon}><Image src="/pay.png" alt="Supplier payments" width={30} height={30} /></div>
          <h2>Supplier Payments</h2>
          <p>Track and settle payments to suppliers</p>
        </Link>
        <Link href="/customer/payments" className={styles.navCard}>
          <div className={styles.navIcon}><Image src="/payment.png" alt="Customer payments" width={30} height={30} /></div>
          <h2>Customers Payments</h2>
          <p>Track and mark payments to Customers</p>
        </Link>
        <Link href="/productions/analytics" className={styles.navCard}>
          <div className={styles.navIcon}><Image src="/bar-chart.png" alt="Production analytics" width={30} height={30} /></div>
          <h2>Productions Analytics</h2>
          <p>View production insights and reports</p>
        </Link>
        <Link href="/supplier/analytics" className={styles.navCard}>
          <div className={styles.navIcon}><Image src="/data-report.png" alt="Supplier analytics" width={30} height={30} /></div>
          <h2>Suppliers Analytics</h2>
          <p>View suppliers insights and reports</p>
        </Link>
        <Link href="/customer/analytics" className={styles.navCard}>
          <div className={styles.navIcon}><Image src="/business-website.png" alt="Customer analytics" width={30} height={30} /></div>
          <h2>Customers Analytics</h2>
          <p>View customer insights and reports</p>
        </Link>
      </div>
    </div>
  );
}