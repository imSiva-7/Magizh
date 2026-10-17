"use client";

import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { stockMoney, stockQuantity } from "@/lib/stock";
import styles from "@/css/stock.module.css";

const moneyAxis = (value) => Math.abs(value) >= 100000 ? `₹${(value / 100000).toFixed(1)}L` : Math.abs(value) >= 1000 ? `₹${(value / 1000).toFixed(0)}k` : `₹${value}`;

export default function StockCharts({ items }) {
  const [unit, setUnit] = useState("kg");
  const priced = items.filter((item) => item.estimatedValue !== null);
  return (
    <div className={styles.chartsGrid}>
      <section className={styles.panel} aria-labelledby="stock-value-title">
        <div className={styles.sectionHeading}><h2 id="stock-value-title">Estimated value by product</h2></div>
        <p className={styles.helper}>Based on average customer selling prices, not purchase cost.</p>
        {priced.length ? <div className={styles.chartCanvas}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height: 300 }}>
            <BarChart data={priced} layout="vertical" margin={{ top: 12, right: 20, left: 0, bottom: 8 }} accessibilityLayer>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dce5df" />
              <XAxis type="number" tickFormatter={moneyAxis} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [stockMoney(Number(value)), "Estimated value"]} />
              <Bar dataKey="estimatedValue" fill="#27795d" barSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div> : <div className={styles.chartEmpty}>Customer prices are needed to estimate stock value.</div>}
      </section>
      <section className={styles.panel} aria-labelledby="stock-level-title">
        <div className={styles.sectionHeading}>
          <h2 id="stock-level-title">Stock & minimum levels</h2>
          <div className={styles.segmented} role="group" aria-label="Chart units">{["kg", "L"].map((value) => <button data-button="toggle" key={value} type="button" aria-pressed={unit === value} onClick={() => setUnit(value)}>{value}</button>)}</div>
        </div>
        <p className={styles.helper}>Compare quantities within the same unit. Unset minimums are shown as zero.</p>
        <div className={styles.chartCanvas}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height: 300 }}>
            <BarChart data={items.filter((item) => item.unit === unit)} layout="vertical" margin={{ top: 12, right: 20, left: 0, bottom: 0 }} accessibilityLayer>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dce5df" />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value, name) => [`${stockQuantity(Number(value))} ${unit}`, name]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="quantity" name={`Available (${unit})`} fill="#27795d" barSize={12} radius={[0, 3, 3, 0]} isAnimationActive={false} />
              <Bar dataKey="minimum" name={`Minimum (${unit})`} fill="#d18b36" barSize={12} radius={[0, 3, 3, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
