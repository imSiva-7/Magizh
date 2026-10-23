import { buildPayroll } from "./payroll";
const employee = (hours = 10) => ({ salary: 31000, paidLeaveDays: 2, attendance: { "2026-01": { days: { "01": { hoursWorked: hours, regularHours: Math.min(hours, 10), overtimeHours: Math.max(hours - 10, 0), checkOut: "18:00" } } } } });
test.each([[0, 0], [6, 666.67], [8, 888.89], [9, 1000], [10, 1000], [12, 1000]])("%i hours earn %i regardless of elapsed days", (hours, pay) => {
 const person = employee(hours);
 expect(buildPayroll(person, "2026-01", "2026-02-01").summary.grossSalary).toBe(pay);
 expect(buildPayroll(person, "2026-01", "2026-01-02").summary.grossSalary).toBe(pay);
});
test("extra hours earn no extra pay and advances are subtracted", () => {
 const person = employee(12); person.advances = { "2026-01": [{amount: 500}] };
 expect(buildPayroll(person, "2026-01", "2026-02-01").summary).toMatchObject({ hourlyRate: 111.11, regularPay: 1000, overtimePay: 0, grossSalary: 1000, netSalary: 500 });
});
test("Manoj with no worked hours and 2000 advance has no earned salary", () => {
 expect(buildPayroll({salary: 15000, advances: {"2026-10": [{amount: 500}, {amount: 1500}]}, attendance: {"2026-10": {days: {"22": {hoursWorked: 0}}}}}, "2026-10", "2026-10-22").summary).toMatchObject({grossSalary: 0, totalAdvances: 2000, netSalary: -2000});
});
test.each([2,4])("%i day leave allowance never adds a leave bonus", allowance => {
 const person = {...employee(), paidLeaveDays: allowance};
 expect(buildPayroll(person,"2026-01","2026-02-01").summary).toMatchObject({paidLeaveDays: allowance, grossSalary: 1000, unusedLeavePay: 0});
});
test("mid-month joining excludes earlier attendance and leave", () => {
 const person = employee();person.joiningDate="2026-01-16";
 person.attendance["2026-01"].days["16"]={hoursWorked: 5, checkOut:"18:00"};
 const report=buildPayroll(person,"2026-01","2026-02-01");
 expect(report.attendance[0].date).toBe("2026-01-16");
 expect(report.summary).toMatchObject({grossSalary:555.56,elapsedDays:16,workedDays:1,absentDays:15});
 expect(buildPayroll(person,"2026-01","2026-01-10").summary.grossSalary).toBe(0);
});
test.each([["2026-02",28],["2028-02",29],["2026-04",30]])("hourly rate in %s uses %i calendar days without early rounding", (month, days) => {
 const person={salary:15000,attendance:{[month]:{days:{"01":{hoursWorked:7.25,checkOut:"18:00"}}}}};
 const report=buildPayroll(person,month,month+"-02");
 expect(report.summary.grossSalary).toBe(Number((15000/(days*9)*7.25).toFixed(2)));
 expect(report.summary.workedDays+report.summary.absentDays).toBe(report.summary.elapsedDays);
 expect(buildPayroll(person,"2029-01",month+"-02").summary.grossSalary).toBe(0);
});

test.each([2, 4])("creation month excludes the %i day allowance and leave value", allowance => {
 const person = { ...employee(), paidLeaveDays: allowance, createdAt: new Date("2026-01-15T10:00:00Z") };
 const report = buildPayroll(person, "2026-01", "2026-02-01");
 expect(report.summary).toMatchObject({ paidLeaveEligible: false, paidLeaveAllowance: 0, paidLeaveDays: 0, remainingPaidLeave: 0, paidLeavePay: 0, grossSalary: 1000 });
 expect(report.attendance.some(day => day.status === "paid_leave")).toBe(false);
 expect(buildPayroll(person, "2026-02", "2026-03-01").summary).toMatchObject({ paidLeaveEligible: true, paidLeaveAllowance: allowance, paidLeaveDays: allowance });
});
test("creation month uses India time across a UTC month boundary", () => {
 const person = { ...employee(), createdAt: "2025-12-31T20:00:00Z" };
 expect(buildPayroll(person, "2026-01", "2026-02-01").summary.paidLeaveAllowance).toBe(0);
 expect(buildPayroll(person, "2026-02", "2026-03-01").summary.paidLeaveAllowance).toBe(2);
});
test("missing legacy creation dates preserve the configured allowance", () => {
 expect(buildPayroll(employee(), "2026-01", "2026-02-01").summary.paidLeaveAllowance).toBe(2);
});

 test("daily cap prevents a long day from covering a short day", () => {
  const person = employee(12);
  person.attendance["2026-01"].days["02"] = {hoursWorked: 6, regularHours: 6, checkOut: "17:00"};
  expect(buildPayroll(person, "2026-01", "2026-02-01").summary).toMatchObject({grossSalary: 1666.67, payableHours: 15, totalHoursWorked: 18, totalOvertimeHours: 3});
 });
 test("a complete 30-day month at nine hours earns the full monthly salary", () => {
  const person = {salary:15000, attendance:{"2026-04":{days:Object.fromEntries(Array.from({length:30}, (_,i)=>[String(i+1).padStart(2,"0"), {hoursWorked:9, checkOut:"18:00"}]))}}};
  expect(buildPayroll(person,"2026-04","2026-05-01").summary).toMatchObject({grossSalary:15000, dailyRate:500, payableHours:270});
 });
