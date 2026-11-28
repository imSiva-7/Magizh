"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import dashboard from "@/app/page.module.css";
import styles from "./MonthlyComparison.module.css";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const axisMoney = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1,
});
const monthName = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dateInMonth = (month, day) => `${month}-${String(day).padStart(2, "0")}T00:00:00Z`;

function ComparisonChartPlaceholder() {
  return (
    <div aria-hidden="true">
      <dl className={`${styles.totals} ${styles.placeholderTotals}`}>
        {["current", "previous"].map((month) => (
          <div key={month}><dt>&nbsp;</dt><dd><strong>&nbsp;</strong><span>&nbsp;</span></dd></div>
        ))}
      </dl>
      <div className={`${dashboard.chartCanvas} ${styles.placeholderPlot}`} />
      <p className={styles.axisLabel}>&nbsp;</p>
      <div className={dashboard.chartDetails}>&nbsp;</div>
    </div>
  );
}

function ComparisonChartContent({ title, rows, currentEnd, previousEnd }) {
  const currentMonth = currentEnd.slice(0, 7);
  const previousMonth = previousEnd.slice(0, 7);
  const currentDay = Number(currentEnd.slice(8));
  const previousDay = Math.min(currentDay, Number(previousEnd.slice(8)));
  const current = {
    label: monthName.format(new Date(dateInMonth(currentMonth, 1))),
    date: shortDate.format(new Date(dateInMonth(currentMonth, currentDay))),
    value: rows[currentDay - 1]?.current,
  };
  const previous = {
    label: monthName.format(new Date(dateInMonth(previousMonth, 1))),
    date: shortDate.format(new Date(dateInMonth(previousMonth, previousDay))),
    value: rows[previousDay - 1]?.previous,
  };

  return (
    <>
      <dl className={styles.totals}>
        <div className={styles.current} data-fade-up="">
          <dt>{current.label}</dt>
          <dd><strong>{money.format(current.value)}</strong><span>Through {current.date}</span></dd>
        </div>
        <div className={styles.previous} data-fade-up="">
          <dt>{previous.label}</dt>
          <dd><strong>{money.format(previous.value)}</strong><span>Through {previous.date}</span></dd>
        </div>
      </dl>
      <div className={`${dashboard.chartCanvas} ${styles.plot}`} data-fade-up="">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height: 250 }}>
          <LineChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} ticks={[1, 5, 10, 15, 20, 25, rows.length]} />
            <YAxis tickFormatter={(value) => axisMoney.format(value)} tickLine={false} axisLine={false} width={64} tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={(day) => `Day ${day}`} formatter={(value) => money.format(value)} contentStyle={{ borderRadius: 12, borderColor: "#dce6df" }} />
            <Line dataKey="current" name={current.label} stroke="var(--comparison-current)" strokeWidth={3.5} dot={false} isAnimationActive={false} />
            <Line dataKey="previous" name={previous.label} stroke="var(--comparison-previous)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <ReferenceDot x={currentDay} y={current.value} r={5} fill="var(--comparison-current)" stroke="white" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className={styles.axisLabel} data-fade-up="">Day of the month</p>
      <details className={`${dashboard.chartDetails} ${styles.details}`} data-fade-up="">
        <summary>View daily totals</summary>
        <div className={dashboard.tableWrapper}>
          <table className={dashboard.chartTable} aria-label={`${title} running totals by day`}>
            <thead><tr><th scope="col">Day</th><th scope="col">{current.label}</th><th scope="col">{previous.label}</th></tr></thead>
            <tbody>{rows.map(({ day, current, previous }) => (
              <tr key={day}>
                <th scope="row">{day}</th>
                <td>{current === null ? "—" : money.format(current)}</td>
                <td>{previous === null ? "—" : money.format(previous)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </>
  );
}

function ComparisonChart({ title, id, rows, currentEnd, previousEnd }) {
  return (
    <section className={dashboard.chartCard} aria-labelledby={id} data-fade-up="">
      <div className={dashboard.chartHeader}><h3 id={id}>{title}</h3></div>
      {rows === undefined ? <ComparisonChartPlaceholder /> : rows.length ? (
        <ComparisonChartContent title={title} rows={rows} currentEnd={currentEnd} previousEnd={previousEnd} />
      ) : <p className={dashboard.chartEmpty} data-fade-up="">No {title.toLowerCase()} recorded in either month.</p>}
    </section>
  );
}

export default function MonthlyComparison() {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadComparison() {
      try {
        const response = await fetch("/api/overview/monthly-comparison", { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data?.currentEnd || !data?.previousEnd || !Array.isArray(data.sales) || !Array.isArray(data.procurement)) {
          throw new Error("Could not load the monthly comparison.");
        }
        if (!controller.signal.aborted) setResult({ data });
      } catch {
        if (!controller.signal.aborted) setResult({ error: true });
      }
    }
    loadComparison();
    return () => controller.abort();
  }, [attempt]);

  const data = result?.data;
  return (
    <section className={styles.comparison} aria-labelledby="monthly-comparison-title">
      <header className={styles.heading} data-fade-up="">
        <h2 id="monthly-comparison-title">This month vs last month</h2>
        <p>Running totals in rupees, lined up by day of the month.</p>
      </header>
      {!result && <p role="status" className={styles.loadingStatus}>Loading monthly comparison…</p>}
      {result?.error && (
        <div className={styles.status} data-fade-up="">
          <p role="alert">Could not load the monthly comparison.</p>
          <button type="button" data-button="secondary" onClick={() => { setResult(null); setAttempt(attempt + 1); }}>Retry comparison</button>
        </div>
      )}
      {!result?.error && (
        <div className={styles.chartGrid}>
          <ComparisonChart id="monthly-sales-title" title="Sales" rows={data?.sales} currentEnd={data?.currentEnd} previousEnd={data?.previousEnd} />
          <ComparisonChart id="monthly-procurement-title" title="Milk procurement" rows={data?.procurement} currentEnd={data?.currentEnd} previousEnd={data?.previousEnd} />
        </div>
      )}
    </section>
  );
}
