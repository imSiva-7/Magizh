// Colors describe the metric; they do not imply a change from the prior period.
export function statNumberTone(label, value) {
  const metric = String(label).trim().toLowerCase();
  const match = String(value ?? "").replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  const amount = match ? Number(match[0]) : null;
  if (amount === 0 || !match) return "neutral";
  if (metric === "net change") return "neutral";
  if (amount < 0) return "negative";
  if (["due", "outstanding", "attention"].includes(metric)) return "negative";
  if (["sales", "received", "paid", "credit", "value", "procurement", "stock value"].includes(metric)) return "positive";
  return "neutral";
}
