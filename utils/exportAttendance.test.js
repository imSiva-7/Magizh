import { exportAttendanceToPDF } from "./exportAttendance";


test("salary PDF keeps essential leave details without extra payroll rows", () => {
  const result = exportAttendanceToPDF({
    employee: { empID: "0001", name: "Employee", salary: 31000 }, period: { daysInPeriod: 31, daysWorked: 1 },
    summary: { totalHoursWorked: 10, paidLeaveDays: 1, paidLeavePay: 1000, grossSalary: 2000, totalAdvances: 500, netSalary: 1500 },
    payroll: { status: "approved" }, advances: [], attendance: [{ date: "2026-01-02", status: "paid_leave", hoursWorked: 0 }],
  }, "2026-01", null, true);
  const pdf = Buffer.from(result).toString("latin1");
  expect(pdf.startsWith("%PDF")).toBe(true);
  for (const text of ["Employee ID: 0001", "Paid Leave Used", "Paid Leave Remaining", "Excess Leave Days", "Net Salary"]) expect(pdf).toContain(text);
  for (const text of ["Base Salary to Date", "Payroll Status", "Leave Salary Deduction", "Paid Leave Compensation"]) expect(pdf).not.toContain(text);
});

test("attendance PDF rounds daily worked hours to two decimal places", () => {
  const result = exportAttendanceToPDF({
    employee: { empID: "0001", name: "Employee" },
    period: { daysInPeriod: 31, daysWorked: 3 },
    summary: {},
    attendance: [
      { date: "2026-01-01", status: "present", hoursWorked: 12.24388888888889 },
      { date: "2026-01-02", status: "present", hoursWorked: 7.777777777777778 },
      { date: "2026-01-03", status: "present", hoursWorked: 9.47 },
      { date: "2026-01-04", status: "paid_leave", hoursWorked: 0 },
    ],
  }, "2026-01", null, true);
  const pdf = Buffer.from(result).toString("latin1");

  for (const hours of ["12.24h", "7.78h", "9.47h"]) {
    expect(pdf).toContain(`(${hours}) Tj`);
  }
  expect(pdf).not.toContain("(0.00h) Tj");
});
