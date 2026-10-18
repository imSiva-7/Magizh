"use client";
import DataSkeleton from "@/components/DataSkeleton";
import { formatDateForDisplay } from "@/lib/india-date.mjs";

import { statNumberTone } from "@/lib/stat-number-tone";
import { formatStat } from "@/utils/formatNumberWithComma";
import PageHeading from "@/components/PageHeading";

import { useState, useEffect, useMemo } from "react";
import CustomerCharts from "@/components/CustomerCharts";
import CustomerProductSales, {
  CustomerOrderStatus,
} from "@/components/CustomerProductSales";
import { productSalesSummary } from "@/lib/customer-products";
import { formatNumberWithCommas } from "@/utils/formatNumberWithComma";
import { getPreviousMonthDate, getTodayDate } from "@/utils/dateUtils";
import styles from "@/css/analytics.module.css";

const getFormattedDateRange = (startDate, endDate) => {
  if (startDate && endDate) {
    const from = formatDateForDisplay(startDate);
    const to = formatDateForDisplay(endDate);
    return from === to ? from : `${from} – ${to}`;
  }
  if (startDate) return `From ${formatDateForDisplay(startDate)}`;
  if (endDate) return `Till ${formatDateForDisplay(endDate)}`;
  return "All Records";
};

export default function CustomerAnalyticsPage() {
  const [dateRange, setDateRange] = useState({
    startDate: getPreviousMonthDate(),
    endDate: getTodayDate(),
  });
  const [data, setData] = useState({
    daily: [],
    products: [],
    payment: [],
    overall: {},
  });
  const productSales = useMemo(
    () => productSalesSummary(data.products),
    [data.products],
  );
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams(dateRange);
        const res = await fetch(`/api/analytics/customers?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        if (!controller.signal.aborted) setData(json);
      } catch (error) {
        if (!controller.signal.aborted)
          setError("Customer analytics could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    fetchData();
    return () => controller.abort();
  }, [dateRange, reload]);

  const handleDateChange = (e) => {
    setDateRange((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const resetDateRange = () => {
    setDateRange({
      startDate: getPreviousMonthDate(),
      endDate: getTodayDate(),
    });
  };

  return (
    <div className={styles.page_container}>
      {/* Header */}
      <div className={styles.header}>
        <PageHeading
          title="Customer Analytics"
          section="BUSINESS INSIGHTS"
          description="Understand sales trends, product demand, and customer payment patterns."
        />
      </div>

      {/* Filter Section */}
      <div data-filter="card" className={styles.filter_section}>
        <div data-filter="title" className={styles.filter_title}>
          <h2>Filter by Date Range</h2>
        </div>
        <div data-filter="grid" className={styles.date_input_group}>
          <div data-filter="field" className={styles.date_field}>
            <label htmlFor="startDate">From Date</label>
            <input
              type="date"
              id="startDate"
              name="startDate"
              value={dateRange.startDate}
              onChange={handleDateChange}
              max={dateRange.endDate || getTodayDate()}
              className={styles.date_input}
            />
          </div>
          <div data-filter="field" className={styles.date_field}>
            <label htmlFor="endDate">To Date</label>
            <input
              type="date"
              id="endDate"
              name="endDate"
              value={dateRange.endDate}
              onChange={handleDateChange}
              min={dateRange.startDate}
              max={getTodayDate()}
              className={styles.date_input}
            />
          </div>
        </div>
        <div data-filter="actions" className={styles.filter_actions}>
          <button
            data-button="secondary"
            type="button"
            onClick={resetDateRange}
            className={`${styles.btn} ${styles.btn_primary}`}
          >
            Reset
          </button>
          <button
            data-button="secondary"
            type="button"
            onClick={() => setDateRange({ startDate: "", endDate: "" })}
            className={`${styles.btn} ${styles.btn_primary}`}
          >
            Clear
          </button>
          <button
            data-button="secondary"
            type="button"
            onClick={() => {
              const today = getTodayDate();
              setDateRange({ startDate: today, endDate: today });
            }}
            className={`${styles.btn} ${styles.btn_primary}`}
          >
            Today
          </button>
        </div>
      </div>

      <CustomerCharts
        daily={data.daily}
        filters={dateRange}
        loading={loading}
        error={error}
        onRetry={() => setReload((value) => value + 1)}
      />

      {error ? null : loading ? (
        <DataSkeleton label="Loading analytics..." />
      ) : (
        <>
          {/* Summary Cards */}
          {/* {data.overall && (
            <div className={styles.summary_card}>
              <div className={styles.summary_header}>
                <h2>Summary</h2>
                <span className={styles.date_range_badge}>
                  {getFormattedDateRange(dateRange.startDate, dateRange.endDate)}
                </span>
              </div>
              <div className={styles.stats_grid}>
                <div className={styles.stat_item}><div className={styles.stat_label}>Litres sold</div><div className={styles.stat_value}>{formatNumberWithCommas(productSales.litres, 2)} <span className={styles.stat_unit}>L</span></div></div>
                <div className={styles.stat_item}><div className={styles.stat_label}>Kilograms sold</div><div className={styles.stat_value}>{formatNumberWithCommas(productSales.kilograms, 2)} <span className={styles.stat_unit}>kg</span></div></div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Orders</div>
                  <div data-stat-tone={statNumberTone("Orders", formatStat(data.overall.totalOrders || 0))} className={styles.stat_value}>
                    {formatStat(data.overall.totalOrders || 0)}
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Sales</div>
                  <div data-stat-tone={statNumberTone("Sales", formatStat(data.overall.totalAmount || 0))} className={styles.stat_value}>
                    ₹{formatStat(data.overall.totalAmount || 0)}
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Paid</div>
                  <div data-stat-tone={statNumberTone("Paid", formatStat(data.overall.paidAmount || 0))} className={`${styles.stat_value} ${styles.text_green}`}>
                    ₹{formatStat(data.overall.paidAmount || 0)}
                  </div>
                </div>
                <div className={styles.stat_item}>
                  <div className={styles.stat_label}>Due</div>
                  <div data-stat-tone={statNumberTone("Due", formatStat(data.overall.dueAmount || 0))} className={`${styles.stat_value} ${styles.text_red}`}>
                    ₹{formatStat(data.overall.dueAmount || 0)}
                  </div>
                </div>
              </div>
            </div>
          )} */}

          {productSales.products.length > 0 && (
            <section className={styles.summary_card} aria-label="Products sold">
              <div className={styles.summary_header}>
                <h2>Products sold</h2>
                <span className={styles.date_range_badge}>
                  {getFormattedDateRange(
                    dateRange.startDate,
                    dateRange.endDate,
                  )}
                </span>
              </div>
              <div className={styles.stats_grid}>
                {productSales.products.map((product) => (
                  <div className={styles.stat_item} key={product.name}>
                    <div className={styles.stat_label}>{product.name}</div>
                    <div className={styles.stat_value}>
                      {formatNumberWithCommas(product.quantity, 2)}{" "}
                      <span className={styles.stat_unit}>
                        {product.unit || "unit unknown"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          <CustomerProductSales products={productSales.products} />
          {data.payment?.length > 0 && (
            <CustomerOrderStatus payment={data.payment} />
          )}
        </>
      )}
    </div>
  );
}
