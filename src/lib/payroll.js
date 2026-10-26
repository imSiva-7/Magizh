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
  const fullDayHours = 9;
  let absences = 0;
  const attendance = Array.from({ length: elapsedDays }, (_, i) => {
    const key = String(i + start).padStart(2, "0");
    const day = days[key];
    const present = Boolean(day);
    return {
      date: `${month}-${key}`,
      checkIn: present ? day.checkIn : "",
      checkOut: present ? day.checkOut || "" : "",
      hoursWorked: present ? Math.max(0, Number(day.hoursWorked) || 0) : 0,
      // Derive payable hours from actual attendance, ignoring legacy 10-hour splits.
      regularHours: present ? Math.min(Math.max(0, Number(day.hoursWorked) || 0), fullDayHours) : 0,
      overtimeHours: present ? Math.max((Number(day.hoursWorked) || 0) - fullDayHours, 0) : 0,
      punches: day?.punches || [],
      status: present ? "present" : (++absences <= paidLeaveAllowance ? "paid_leave" : "excess_leave"),
    };
  });
  const sum = (field) =>
    attendance.reduce((total, day) => total + day[field], 0);
  const count = (status) =>
    attendance.filter((day) => day.status === status).length;
  const paidLeaveDays = count("paid_leave");
  const hourlyRate = (Number(employee.salary) || 0) / (daysInPeriod * fullDayHours);
  // Monthly hours include extra hours once and only paid leave actually used.
  // Preserve the calendar-day rate and prorate the ceiling for mid-month joiners.
  const targetHours = employedDaysInMonth * fullDayHours;
  const paidLeaveHours = paidLeaveDays * fullDayHours;
  const countedHours = Math.round((sum("hoursWorked") + paidLeaveHours) * 100) / 100;
  const shortfallHours = Math.max(0, targetHours - countedHours);
  const graceEligible = absences <= 4;
  const fullSalaryEligible = targetHours > 0 && countedHours > 0 &&
    (shortfallHours === 0 || (graceEligible && shortfallHours <= 9));
  const payableHours = fullSalaryEligible ? targetHours : Math.min(countedHours, targetHours);
  const regularPay = Math.min(sum("hoursWorked"), targetHours) * hourlyRate;
  const paidLeavePay = Math.min(paidLeaveHours, Math.max(0, targetHours - sum("hoursWorked"))) * hourlyRate;
  const graceHours = Math.max(0, payableHours - countedHours);
  const overtimePay = 0;
  const advances = employee.advances?.[month] || [];
  const totalAdvances = advances.reduce(
    (total, advance) => total + (Number(advance.amount) || 0),
    0,
  );
  const grossSalary = payableHours * hourlyRate;
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
      payableDays: round(payableHours / fullDayHours),
      fullDayHours,
      dailyRate: round((Number(employee.salary) || 0) / daysInPeriod),
      payableHours: round(payableHours),
      countedHours: round(countedHours),
      targetHours,
      shortfallHours: round(shortfallHours),
      fullSalaryEligible,
      graceEligible,
      fullSalaryThresholdHours: Math.max(0, targetHours - (graceEligible ? 9 : 0)),
      salaryCeiling: round(targetHours * hourlyRate),
      graceHours: round(graceHours),
      gracePay: round(graceHours * hourlyRate),
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
      paidLeaveHours,
      standardHours: daysInPeriod * fullDayHours,
      hourlyRate: round(hourlyRate),
      overtimeRate: 0,
      regularPay: round(regularPay),
      overtimePay: round(overtimePay),
      paidLeavePay: round(paidLeavePay),
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
