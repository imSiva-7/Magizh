const indiaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
});

export function attendanceToday(now = new Date()) {
  const parts = Object.fromEntries(indiaDate.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatAttendanceDate(value) {
  if (!value) return "—";
  if (!Number.isFinite(new Date(value).getTime())) return "—";
  // Device day keys are already Indian calendar dates; never shift them.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : attendanceToday(new Date(value));
  return date.split("-").reverse().join("/");
}

export function formatAttendanceMonth(month) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", month: "long", year: "numeric",
  }).format(new Date(`${month}-01T00:00:00+05:30`));
}
