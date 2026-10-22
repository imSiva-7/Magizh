import { createHash } from "node:crypto";
import { getTodayDate as indiaDate } from "./india-date.mjs";

export const validMonth = (month) =>
  typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
export function validJoiningDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function payrollFingerprint(employee, month, today) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        salary: employee.salary,
        joiningDate: employee.joiningDate,
        name: employee.name,
        empID: employee.empID,
        attendance: employee.attendance?.[month] || null,
        leaves: employee.leaves?.[month] || null,
        advances: employee.advances?.[month] || null,
        through: month === today.slice(0, 7) ? today : month,
      }),
    )
    .digest("hex");
}

export function buildPayroll(employee, month, today) {
  const [year, number] = month.split("-").map(Number);
  const daysInPeriod = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const last =
    month > today.slice(0, 7)
      ? 0
      : month === today.slice(0, 7)
        ? Number(today.slice(8))
        : daysInPeriod;
  const joiningDate = validJoiningDate(employee.joiningDate) ? employee.joiningDate : null;
  const start = joiningDate && joiningDate.slice(0, 7) === month ? Number(joiningDate.slice(8)) : 1;
  const elapsedDays = joiningDate && joiningDate.slice(0, 7) > month ? 0 : Math.max(0, last - start + 1);
  const employedDaysInMonth = joiningDate && joiningDate.slice(0, 7) > month ? 0 : daysInPeriod - start + 1;
  const days = employee.attendance?.[month]?.days || {};
  const creationMonth = employee.createdAt ? indiaDate(employee.createdAt).slice(0, 7) : "";
  const paidLeaveEligible = !creationMonth || month > creationMonth;
  const paidLeaveAllowance = paidLeaveEligible ? (employee.paidLeaveDays === undefined || employee.paidLeaveDays === 4 ? 4 : 2) : 0;
  let absences = 0;
  const attendance = Array.from({ length: elapsedDays }, (_, i) => {
    const key = String(i + start).padStart(2, "0");
    const day = days[key];
    const present = Boolean(day);
    return {
      date: `${month}-${key}`,
      checkIn: present ? day.checkIn : "",
      checkOut: present ? day.checkOut || "" : "",
      hoursWorked: present ? Number(day.hoursWorked) || 0 : 0,
      regularHours: present
        ? Number(day.regularHours ?? Math.min(Number(day.hoursWorked) || 0, 10))
        : 0,
      overtimeHours: present
        ? Number(
            day.overtimeHours ??
              Math.max((Number(day.hoursWorked) || 0) - 10, 0),
          )
        : 0,
      punches: day?.punches || [],
      status: present ? "present" : (++absences <= paidLeaveAllowance ? "paid_leave" : "excess_leave"),
    };
  });
  const sum = (field) =>
    attendance.reduce((total, day) => total + day[field], 0);
  const count = (status) =>
    attendance.filter((day) => day.status === status).length;
  const paidLeaveDays = count("paid_leave");
  const hourlyRate = (Number(employee.salary) || 0) / (daysInPeriod * 10);
  // Pay only recorded hours, using the unrounded rate throughout.
  const regularPay = sum("regularHours") * hourlyRate;
  const overtimePay = sum("overtimeHours") * hourlyRate;
  const advances = employee.advances?.[month] || [];
  const totalAdvances = advances.reduce(
    (total, advance) => total + (Number(advance.amount) || 0),
    0,
  );
  const grossSalary = sum("hoursWorked") * hourlyRate;
  const fingerprint = payrollFingerprint(employee, month, today);

  const round = (value) => Number(value.toFixed(2));
  return {
    employee: {
      empID: employee.empID,
      name: employee.name,
      salary: employee.salary,
      mobile: employee.mobile,
      joiningDate,
    },
    period: {
      month,
      daysInPeriod,
      daysWorked: count("present"),
      startDate: `${month}-${String(start).padStart(2, "0")}`,
      endDate: `${month}-${String(last || daysInPeriod).padStart(2, "0")}`,
    },
    attendance,
    advances,
    fingerprint,
    payroll: {
      status: "automatic",
    },
    summary: {
      totalHoursWorked: round(sum("hoursWorked")),
      totalRegularHours: round(sum("regularHours")),
      totalOvertimeHours: round(sum("overtimeHours")),
      scheduledWorkingDays: daysInPeriod,
      expectedWorkingDays: Math.max(0, employedDaysInMonth - paidLeaveAllowance),
      payableDays: elapsedDays,
      elapsedDays,
      employedDaysInMonth,
      remainingDays: daysInPeriod - last,
      workedDays: count("present"),
      absentDays: elapsedDays - count("present"),
      excessLeaveDays: count("excess_leave"),
      attendanceRate: elapsedDays ? round(count("present") / elapsedDays * 100) : 0,
      incompleteDays: attendance.filter(day => day.status === "present" && !day.checkOut).length,
      paidLeaveDays,
      paidLeaveAllowance,
      paidLeaveEligible,
      remainingPaidLeave: Math.max(0, paidLeaveAllowance - paidLeaveDays),
      unpaidLeaveDeduction: 0,
      unpaidAbsenceDays: 0,
      pendingLeaveDays: count("pending"),
      paidLeaveHours: paidLeaveDays * 10,
      standardHours: daysInPeriod * 10,
      hourlyRate: round(hourlyRate),
      overtimeRate: round(hourlyRate),
      regularPay: round(regularPay),
      overtimePay: round(overtimePay),
      paidLeavePay: round(paidLeaveDays * 10 * hourlyRate),
      unusedLeavePay: 0,
      grossSalary: round(grossSalary),
      totalAdvances: round(totalAdvances),
      netSalary: round(grossSalary - totalAdvances),
    },
  };
}

// Guard every salary input so a concurrent edit cannot be approved using stale data.
export function payrollGuard(employee, month) {
  const filter = { _id: employee._id };
  for (const path of [
    "salary",
    "name",
    "empID",
    `attendance.${month}`,
    `leaves.${month}`,
    `advances.${month}`,
  ]) {
    const value = path
      .split(".")
      .reduce((object, key) => object?.[key], employee);
    filter[path] = value === undefined ? { $exists: false } : { $eq: value };
  }
  return filter;
}
