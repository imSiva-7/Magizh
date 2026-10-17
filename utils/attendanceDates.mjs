import { getTodayDate, formatDateForDisplay } from "../src/lib/india-date.mjs";

export function attendanceToday(now = new Date()) {
  return getTodayDate(now);
}

export function formatAttendanceDate(value) {
  if (!value) return "—";
  if (!Number.isFinite(new Date(value).getTime())) return "—";
  // Device day keys are already Indian calendar dates; never shift them.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : attendanceToday(new Date(value));
  return formatDateForDisplay(date);
}

export function formatAttendanceMonth(month) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", month: "long", year: "numeric",
  }).format(new Date(`${month}-01T00:00:00+05:30`));
}
