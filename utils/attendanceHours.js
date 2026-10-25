export function formatAttendanceHours(hours) {
  const minutes = Math.round(Math.max(0, Number(hours) || 0) * 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function completedAttendanceAverage(attendance = []) {
  const completed = attendance.filter(day => day.status === "present" && day.checkIn && day.checkOut);
  const hours = completed.reduce((sum, day) => sum + (Number(day.hoursWorked) || 0), 0);
  return { days: completed.length, hours, average: completed.length ? hours / completed.length : null };
}
