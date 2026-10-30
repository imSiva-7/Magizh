import { createHash } from "node:crypto";
import { getTodayDate as indiaDate } from "./india-date.mjs";
import { attendanceDayHours, completedAttendanceAverage } from "../../utils/attendanceHours.js";

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
        paidLeaveDays: employee.paidLeaveDays,
        createdAt: employee.createdAt,
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
    const hoursWorked = attendanceDayHours(day);
    return {
      date: `${month}-${key}`,
      checkIn: present ? day.checkIn : "",
      checkOut: present ? day.checkOut || "" : "",
      hoursWorked,
      // Derive payable hours from actual attendance, ignoring legacy 10-hour splits.
      regularHours: Math.min(hoursWorked, fullDayHours),
      overtimeHours: Math.max(hoursWorked - fullDayHours, 0),
      punches: day?.punches || [],
      status: present ? "present" : `${month}-${key}` === today ? "pending" : (++absences <= paidLeaveAllowance ? "paid_leave" : "excess_leave"),
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
  const completed = completedAttendanceAverage(attendance);
  const workedHours = completed.hours;
  const countedHours = workedHours + paidLeaveHours;
  const shortfallHours = Math.max(0, targetHours - countedHours);
  const allocatedLeaveHours = paidLeaveAllowance * fullDayHours;
  const graceAllowanceHours = fullDayHours;
  // Full pay depends on worked hours against the employee's allocated allowance.
  const leaveAndGraceAllowance = allocatedLeaveHours + graceAllowanceHours;
  const fullSalaryThresholdHours = Math.max(0, targetHours - leaveAndGraceAllowance);
  const fullSalaryEligible = targetHours > 0 && workedHours > 0 && workedHours >= fullSalaryThresholdHours;
  const graceEligible = fullSalaryEligible;
  const payableHours = fullSalaryEligible ? targetHours : Math.min(countedHours, targetHours);
  const regularPay = Math.min(workedHours, targetHours) * hourlyRate;
  const paidLeavePay = Math.min(paidLeaveHours, Math.max(0, targetHours - workedHours)) * hourlyRate;
  const topUpHours = Math.max(0, payableHours - countedHours);
  const graceHours = Math.min(graceAllowanceHours, topUpHours);
  const fullSalaryAdjustmentHours = Math.max(0, topUpHours - graceHours);
  const overtimePay = 0;
  const advances = employee.advances?.[month] || [];
  const totalAdvances = advances.reduce(
    (total, advance) => total + (Number(advance.amount) || 0),
    0,
  );
  const grossSalary = payableHours * hourlyRate;
  const fingerprint = payrollFingerprint(employee, month, today);

  const round = (value) => Number(value.toFixed(2));
  const salaryIncludingLeavePay = round(grossSalary);
  const paidLeavePayRounded = round(paidLeavePay);
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
      totalHoursWorked: round(workedHours),
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
      allocatedLeaveHours,
      graceAllowanceHours,
      completedDays: completed.days,
      averageHoursPerCompletedDay: completed.average,
      fullSalaryThresholdHours,
      leaveAndGraceAllowance,
      salaryCeiling: round(targetHours * hourlyRate),
      graceHours: round(graceHours),
      gracePay: round(graceHours * hourlyRate),
      fullSalaryAdjustmentHours: round(fullSalaryAdjustmentHours),
      fullSalaryAdjustmentPay: round(fullSalaryAdjustmentHours * hourlyRate),
      elapsedDays,
      employedDaysInMonth,
      remainingDays: daysInPeriod - last,
      workedDays: count("present"),
      absentDays: absences,
      excessLeaveDays: count("excess_leave"),
      attendanceRate: elapsedDays ? round(count("present") / elapsedDays * 100) : 0,
      incompleteDays: count("present") - completed.days,
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
      paidLeavePay: paidLeavePayRounded,
      salaryWithoutLeavePay: round(salaryIncludingLeavePay - paidLeavePayRounded),
      salaryIncludingLeavePay,
      unusedLeavePay: 0,
      grossSalary: salaryIncludingLeavePay,
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
    "joiningDate",
    "paidLeaveDays",
    "createdAt",
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
