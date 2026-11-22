import { getTodayDate } from "./india-date.mjs";

export function currentGoalPeriod(now = new Date()) {
  const throughDate = getTodayDate(now);
  const month = throughDate.slice(0, 7);
  return { month, startDate: `${month}-01`, throughDate };
}

export function validateGoalTargets(targets) {
  const result = {};
  for (const key of ["sales", "profit"]) {
    const value = targets?.[key];
    if (value === null) {
      result[key] = null;
    } else if (typeof value === "number" && Number.isFinite(value) && value > 0 &&
      Number(value.toFixed(2)) === value && Number.isSafeInteger(Math.round(value * 100))) {
      result[key] = value;
    } else {
      throw new Error(`${key === "sales" ? "Sales" : "Profit"} goal must be a positive amount with up to two decimal places, or left blank.`);
    }
  }
  return result;
}

export function goalProgress(actual, target) {
  if (target === null) return null;
  const ratio = (actual / target) * 100;
  const rounded = Number(ratio.toFixed(1));
  const percent = actual < target ? Math.min(99.9, rounded) : rounded;
  const remaining = Number(Math.max(0, target - actual).toFixed(2));
  return {
    percent,
    progress: Math.max(0, Math.min(100, ratio)),
    remaining,
    reached: actual >= target,
  };
}
