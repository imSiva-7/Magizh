"use client";

import styles from "@/css/stat-trend.module.css";

// Decorative only: the labelled statistic remains the accessible content.
export default function StatTrendBackground({ points = [], tone = "milk" }) {
  const valid = points.filter(
    (point) =>
      Number.isFinite(point.value) && Number.isFinite(Date.parse(point.date)),
  );
  if (!valid.length) return null;
  const ordered = [...valid].sort((a, b) => a.date.localeCompare(b.date));
  const start = Date.parse(ordered[0].date),
    end = Date.parse(ordered.at(-1).date);
  const min = Math.min(0, ...ordered.map((point) => point.value));
  const max = Math.max(0, ...ordered.map((point) => point.value));
  const coordinates = ordered.map((point) => ({
    x:
      start === end
        ? 160
        : 8 + ((Date.parse(point.date) - start) / (end - start)) * 304,
    y: max === min ? 76 : 86 - ((point.value - min) / (max - min)) * 66,
  }));
  const line = coordinates
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`,
    )
    .join(" ");
  return (
    <svg
      className={`${styles.graphic} ${tone === "amount" ? styles.amount : styles.milk}`}
      viewBox="0 0 320 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      data-testid="stat-trend"
      data-points={ordered.length}
    >
      {ordered.length > 1 ? (
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeOpacity=".4"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
      ) : (
        <path d={`M154,${coordinates[0].y} L166,${coordinates[0].y}`} fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity=".4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}
