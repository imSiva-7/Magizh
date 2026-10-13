"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import styles from "./page.module.css";
import { getTodayDate, getPreviousMonthDate, getCurrentMonthStartDate } from "@/utils/dateUtils";
import {
  formatNumberWithCommas,
  formatNumberWithCommasNoDecimal,
} from "@/utils/formatNumberWithComma";
import Image from "next/image";
import HomeCharts from "@/components/HomeCharts";

const StatItem = ({ label, value, colorClass = "", className = "" }) => (
  <div className={`${styles.global_stat_item} ${className}`}>
    <div className={styles.global_stat_label}>{label}</div>
    <div className={`${styles.global_stat_value} ${colorClass}`}>{value}</div>
  </div>
);

export default function Home() {
  const { data: session, status } = useSession();

  const [filters, setFilters] = useState({
    startDate: getCurrentMonthStartDate(),
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
    const controller = new AbortController();
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Build query params for date filtering
        const queryParams = new URLSearchParams();
        if (filters.startDate) queryParams.append("startDate", filters.startDate);
        if (filters.endDate) queryParams.append("endDate", filters.endDate);

        const [customerRes, supplierRes, productionRes, stockRes] =
          await Promise.all([
            fetch(`/api/customer/order/history?${queryParams}`, { signal: controller.signal }),
            fetch(`/api/supplier/procurement/history?${queryParams}`, { signal: controller.signal }),
            fetch(`/api/production/history?${queryParams}`, { signal: controller.signal }),
            fetch(`/api/stock/balance`, { signal: controller.signal }),
          ]);

        if (!customerRes.ok) throw new Error("Failed to fetch customer data");
        if (!supplierRes.ok) throw new Error("Failed to fetch supplier data");
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

        let supplierJson = {};
        let procurements = [];
        let supplierSummary = {
          totalMilk: 0,
          totalAmount: 0,
          paidAmount: 0,
          dueAmount: 0,
        };
        if (supplierRes.ok) {
          supplierJson = await supplierRes.json();
          if (Array.isArray(supplierJson)) {
            procurements = supplierJson;
            supplierSummary = procurements.reduce(
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
            supplierSummary = supplierJson.summary || supplierSummary;
          } else {
            procurements = supplierJson.data || [];
          }
        }
        setSupplierData({ procurements, summary: supplierSummary });

        if (productionRes.ok) {
          const productionData = await productionRes.json();
          if (Array.isArray(productionData)) {
            const prodSummary = productionData.reduce(
              (acc, entry) => {
                acc.milk_quantity += entry.milk_quantity || 0;
                acc.curd_quantity += entry.curd_quantity || 0;
                acc.cream_quantity += entry.cream_quantity || 0;
                acc.soft_paneer_quantity += entry.soft_paneer_quantity || 0;
                acc.premium_paneer_quantity +=
                  entry.premium_paneer_quantity || 0;
                acc.butter_quantity += entry.butter_quantity || 0;
                acc.ghee_quantity += entry.ghee_quantity || 0;
                return acc;
              },
              {
                milk_quantity: 0,
                curd_quantity: 0,
                cream_quantity: 0,
                soft_paneer_quantity: 0,
                premium_paneer_quantity: 0,
                butter_quantity: 0,
                ghee_quantity: 0,
              },
            );
            setProductionSummary(prodSummary);
          }
        }

        if (stockRes.ok) {
          const stockData = await stockRes.json();
          setStockBalance(stockData || {});
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchData();
    return () => controller.abort();
  }, [filters]);

  const customerDueList = useMemo(() => {
    const dueMap = new Map();
    customerData.orders.forEach((order) => {
      if (order.paymentStatus === "Not Paid") {
        const existing = dueMap.get(order.customerId) || {
          id: order.customerId,
          name: order.customerName,
          due: 0,
        };
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
        const existing = dueMap.get(proc.supplierId) || {
          name: proc.supplierName,
          id: proc.supplierId,
          due: 0,
        };
        existing.due += proc.totalAmount || 0;
        dueMap.set(proc.supplierId, existing);
      }
    });
    return Array.from(dueMap.values()).sort((a, b) => b.due - a.due);
  }, [supplierData.procurements]);

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.eyebrow}>MAGIZH DAIRY / OPERATIONS</span>
          <h1>Every day, made simpler.</h1>
          <p className={styles.intro}>From fresh milk to final payments. Your dairy operations, all in one place.</p>
        </div>
        <div className={styles.userInfo}>
          {status === "authenticated" ? (
            <>
              <span className={styles.userEmail}>{session.user?.email}</span>
              {session.user?.role === "admin" && (
                <span className={styles.adminBadge}>Admin</span>
              )}
            </>
          ) : status === "unauthenticated" ? (
            <Link href="/login" className={styles.loginLink}>
              Log in
            </Link>
          ) : <span className={styles.sessionStatus}>Connecting…</span>}
        </div>
      </header>

      <div className={styles.sectionHeading}>
        <div><span className={styles.eyebrow}>EXPLORE THE PLATFORM</span><h2>Your workspace</h2></div>
        <span className={styles.sectionHint}>Choose a module to get started</span>
      </div>
      <nav className={styles.navGrid} aria-label="Dashboard modules">
        <Link href="/productions" className={styles.navCard}>
          <div className={styles.navIcon}>
            <Image
              src="/industrial-park.png"
              alt="Production"
              width={30}
              height={30}
            />
          </div>
          <h2>Production</h2>
          <p>Record daily milk production and by‑products</p>
        </Link>
        <Link href="/supplier" className={styles.navCard}>
          <div className={styles.navIcon}>
            <Image src="/wholesale.png" alt="Supplier" width={30} height={30} />
          </div>
          <h2>Suppliers</h2>
          <p>Manage supplier information and rates</p>
        </Link>
        <Link href="/customer" className={styles.navCard}>
          <div className={styles.navIcon}>
            <Image src="/customer.png" alt="Customer" width={30} height={30} />
          </div>
          <h2>Customers</h2>
          <p>View and manage customer details</p>
        </Link>
        <Link href="/supplier/payments" className={styles.navCard}>
          <div className={styles.navIcon}>
            <Image
              src="/pay.png"
              alt="Supplier payments"
              width={30}
              height={30}
            />
          </div>
          <h2>Supplier Payments</h2>
          <p>Track and settle payments to suppliers</p>
        </Link>
        <Link href="/customer/payments" className={styles.navCard}>
          <div className={styles.navIcon}>
            <Image
              src="/payment.png"
              alt="Customer payments"
              width={30}
              height={30}
            />
          </div>
          <h2>Customer Payments</h2>
          <p>Track payments and outstanding balances</p>
        </Link>
        <Link href="/productions/analytics" className={styles.navCard}>
          <div className={styles.navIcon}>
            <Image
              src="/bar-chart.png"
              alt="Production analytics"
              width={30}
              height={30}
            />
          </div>
          <h2>Production Analytics</h2>
          <p>View production insights and reports</p>
        </Link>
        <Link href="/supplier/analytics" className={styles.navCard}>
          <div className={styles.navIcon}>
            <Image
              src="/data-report.png"
              alt="Supplier analytics"
              width={30}
              height={30}
            />
          </div>
          <h2>Supplier Analytics</h2>
          <p>View procurement insights and reports</p>
        </Link>
        <Link href="/customer/analytics" className={styles.navCard}>
          <div className={styles.navIcon}>
            <Image
              src="/business-website.png"
              alt="Customer analytics"
              width={30}
              height={30}
            />
          </div>
          <h2>Customer Analytics</h2>
          <p>View customer insights and reports</p>
        </Link>
      </nav>

      <div className={styles.sectionHeading}>
        <div><span className={styles.eyebrow}>AT A GLANCE</span><h2>Business overview</h2></div>
      </div>
      {/* Date Filters */}
      <div className={styles.filter_form}>
        <div className={styles.filter_header}>
          <h2>Filter by Date Range</h2>
        </div>
        <div className={styles.date_filter_section}>
          <div className={styles.date_input_group}>
            <div className={styles.date_field}>
              <label htmlFor="start-date">From</label>
              <input
                id="start-date"
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, startDate: e.target.value }))
                }
                max={filters.endDate || getTodayDate()}
                className={styles.filter_input}
              />
            </div>
            <div className={styles.date_field}>
              <label htmlFor="end-date">To</label>
              <input
                id="end-date"
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, endDate: e.target.value }))
                }
                min={filters.startDate}
                max={getTodayDate()}
                className={styles.filter_input}
              />
            </div>
          </div>
          <div className={styles.filter_actions}>
            <button
              onClick={() =>
                setFilters({
                  startDate: getCurrentMonthStartDate(),
                  endDate: getTodayDate(),
                })
              }
              className={styles.btn_month}
            >
              This Month
            </button>
            <button
              onClick={() =>
                setFilters({
                  startDate: getTodayDate(),
                  endDate: getTodayDate(),
                })
              }
              className={styles.btn_today}
            >
              Today
            </button>
            <button
              onClick={() =>
                setFilters({
                  startDate: "",
                  endDate: "",
                })
              }
              className={styles.btn_clear}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={styles.dataStatus} role="status">
          <div className={styles.spinner} aria-hidden="true" />
          <div><h3>Preparing your overview</h3><p>Loading the latest records. You can explore any module above.</p></div>
        </div>
      ) : error ? (
        <div className={styles.dataStatus} role="alert">
          <div><h3>Overview unavailable</h3><p>{error}. You can still use the workspace links above.</p></div>
          <button onClick={() => setFilters((prev) => ({ ...prev }))} className={styles.retryBtn}>Try again</button>
        </div>
      ) : (
      <>
      <HomeCharts
        orders={customerData.orders}
        procurements={supplierData.procurements}
        customerSummary={customerData.summary}
        supplierSummary={supplierData.summary}
        filters={filters}
      />
      {!(supplierData.summary.totalAmount > 0) && !(customerData.summary.totalAmount > 0) && (
        <div className={styles.dataStatus}><div><h3>No activity in this date range</h3><p>Choose another date range or open a module to add your first record.</p></div></div>
      )}
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
 <div className={styles.global_summary_card} hidden={!(supplierData.summary.totalAmount > 0)}>
      {supplierData.summary.totalAmount > 0 && (
        <div>
          <div className={styles.global_header}>
            <h2 className={styles.global_title}>Suppliers Summary</h2>
            <span className={styles.date_range_badge}>
              {filters.startDate && filters.endDate
                ? `${filters.startDate} to ${filters.endDate}`
                : "All Time"}
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

      {supplierDueList.length > 0 && (
        <div >
          <div className={styles.tableWrapper}>
            <table className={styles.dueTable}>
              <thead>
                <tr>
                  <th>Supplier Name</th>
                  <th>Total Due (₹)</th>
                </tr>
              </thead>
              <tbody>
                {supplierDueList.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>
                      <Link
                        href={`/supplier/procurement?supplierId=${supplier.id}`}
                        className={styles.supplierName}
                      >
                        {supplier.name || "-"}
                      </Link>
                    </td>
                    <td className={styles.text_red}>
                      ₹{formatNumberWithCommasNoDecimal(supplier.due)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </div>
      <div className={styles.global_summary_card} hidden={!(customerData.summary.totalAmount > 0) && customerDueList.length === 0}>
        {customerData.summary.totalAmount > 0 && (
          <div>
            <div className={styles.global_header}>
              <h2 className={styles.global_title}>Customers Summary</h2>
              <span className={styles.date_range_badge}>
                {filters.startDate && filters.endDate
                  ? `${filters.startDate} to ${filters.endDate}`
                  : "All Time"}
              </span>
            </div>
            <div className={styles.global_stats_grid}>
              <StatItem
                label="Total Orders"
                value={customerData.summary.orderCount}
              />
              <StatItem
                label="Total Sales"
                value={`₹${formatNumberWithCommas(customerData.summary.totalAmount.toFixed(2))}`}
              />
              <StatItem
                label="Total Received"
                value={`₹${formatNumberWithCommas(customerData.summary.paidAmount.toFixed(2))}`}
                colorClass={styles.text_green}
              />
              <StatItem
                label="Total Outstanding"
                value={`₹${formatNumberWithCommas(customerData.summary.dueAmount.toFixed(2))}`}
                colorClass={styles.text_red}
              />
            </div>
          </div>
        )}
        {customerDueList.length > 0 && (
          <div>
            <div className={styles.tableWrapper}>
              <table className={styles.dueTable}>
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Total Due (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {customerDueList.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <Link
                          href={`/customer/order?customerId=${customer.id}`}
                          className={styles.customerName}
                        >
                          {customer.name || "-"}
                        </Link>
                      </td>
                      <td className={styles.text_red}>
                        ₹{formatNumberWithCommasNoDecimal(customer.due)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      </>
      )}
      </div>

  );
}
