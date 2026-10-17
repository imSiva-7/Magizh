export const INDIA_TIME_ZONE = "Asia/Kolkata";
const calendar = new Intl.DateTimeFormat("en-CA", { timeZone: INDIA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
function asDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") {
    const display = value.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if (display) value = `20${display[3]}-${display[2]}-${display[1]}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const calendarCheck = new Date(`${value}T00:00:00Z`);
      if (!Number.isFinite(calendarCheck.getTime()) || calendarCheck.toISOString().slice(0, 10) !== value) return null;
      value += "T00:00:00+05:30";
    }
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)) value += "+05:30";
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
export function getTodayDate(now = new Date()) {
  const date = asDate(now);
  if (!date) return "";
  const parts = Object.fromEntries(calendar.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export const month = (now = new Date()) => getTodayDate(now).slice(0, 7);
export const getCurrentMonthStartDate = (now = new Date()) => `${month(now)}-01`;
export function getPreviousMonthDate(now = new Date()) {
  const [year, currentMonth, day] = getTodayDate(now).split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, currentMonth - 1, 0));
  return `${lastDay.getUTCFullYear()}-${String(lastDay.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay.getUTCDate())).padStart(2, "0")}`;
}
export function formatDateForDisplay(value) {
  if (value === undefined || value === null || value === "") return "";
  const key = getTodayDate(value);
  if (!key) return "—";
  const [year, month, day] = key.split("-");
  return `${day}/${month}/${year.slice(-2)}`;
}
export const formatDate = formatDateForDisplay;
export const formatMonthForDisplay = value => /^\d{4}-\d{2}$/.test(String(value)) ? `${value.slice(5, 7)}/${value.slice(2, 4)}` : "—";
export function formatTimeForDisplay(value) {
  const date = asDate(value);
  return date ? new Intl.DateTimeFormat("en-IN", { timeZone: INDIA_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: true }).format(date) : "—";
}
export function getIndiaTimePeriod(now = new Date()) {
  const date = asDate(now);
  if (!date) return "";
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: INDIA_TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(date));
  return hour >= 12 ? "PM" : "AM";
}
export const formatDateTimeForDisplay = value => `${formatDateForDisplay(value) || "—"}, ${formatTimeForDisplay(value)} IST`;
