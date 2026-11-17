import { statNumberTone } from "@/lib/stat-number-tone";
import StatTrendBackground from "@/components/StatTrendBackground";
import trendStyles from "@/css/stat-trend.module.css";
import styles from "@/app/page.module.css";

export default function SummaryStat({ label, metric = label, value, hint, colorClass = "", className = "", trend, tone = "milk" }) {
  return (
    <div className={`${styles.global_stat_item} ${trendStyles.card} ${className}`}>
      <StatTrendBackground points={trend} tone={tone} />
      <div className={styles.global_stat_label}>{label}</div>
      <div data-stat-tone={statNumberTone(metric, value)} className={`${styles.global_stat_value} ${colorClass}`}>{value}</div>
      {hint && <div className={styles.global_stat_hint}>{hint}</div>}
    </div>
  );
}
