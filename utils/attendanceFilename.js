import { reportFilename } from "./reportFilename";

export function attendanceFilename(name, month) {
  return reportFilename("Attendance and Salary", name || "Employee", [month]);
}
