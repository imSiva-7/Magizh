export function formatAttendanceHours(hours) {
  const minutes = Math.round(Math.max(0, Number(hours) || 0) * 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

// Keep the grace boundary visible: 8h 29m 59s must not display as 8h 30m.
export function formatAttendanceAverage(hours) {
  if (hours === null || hours === undefined || !Number.isFinite(Number(hours))) return "—";
  const seconds = Math.floor(Math.max(0, Number(hours)) * 3600 + 1e-7);
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function attendanceDayHours(day) {
  const seconds = value => {
    if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return null;
    const [hour, minute, second = 0] = value.split(":").map(Number);
    return hour * 3600 + minute * 60 + second;
  };
  const start = seconds(day?.checkIn), end = seconds(day?.checkOut);
  return start !== null && end !== null && end > start ? (end - start) / 3600 : 0;
}

export function completedAttendanceAverage(attendance = []) {
  const completed = attendance.filter(day => day.status === "present" && attendanceDayHours(day) > 0);
  const seconds = completed.reduce((sum, day) => sum + Math.round(attendanceDayHours(day) * 3600), 0);
  const hours = seconds / 3600;
  return { days: completed.length, hours, average: completed.length ? hours / completed.length : null };
}
