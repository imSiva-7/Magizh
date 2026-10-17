import styles from "./CategoryBadge.module.css";

const tones = {
  gender: { male: "blue", female: "rose", other: "neutral" },
  supplier: { society: "blue", milkman: "green", farmer: "amber", other: "neutral" },
  supplierRole: { head: "blue", child: "amber", "head supplier": "blue", "child supplier": "amber" },
  customer: { distributor: "blue", wholesale: "green", retail: "amber", restaurant: "purple", other: "neutral" },
};

export default function CategoryBadge({ kind, value, fallback = "Other" }) {
  const label = String(value || "").trim() || fallback;
  const tone = tones[kind]?.[label.toLowerCase()] || "neutral";
  return <span className={`${styles.badge} ${styles[tone]}`} data-category-badge={kind}>{label}</span>;
}
