import { buildPayroll } from "./payroll";

function person({ month = "2026-04", leave = 0, workedHours = 252, allowance = 4, joiningDate, createdAt } = {}) {
  const [year, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const start = joiningDate ? Number(joiningDate.slice(8)) : 1;
  const workedDays = count - start + 1 - leave;
  const days = Object.fromEntries(Array.from({ length: workedDays }, (_, i) => [String(start + i).padStart(2, "0"), { checkIn: "08:00", checkOut: "18:00", hoursWorked: i === 0 ? workedHours : 0 }]));
  return { salary: 15000, paidLeaveDays: allowance, joiningDate, createdAt, attendance: { [month]: { days } } };
}
const report = (p, month = "2026-04") => buildPayroll(p, month, "2026-12-01").summary;

test.each([[260, 14444.44], [260.99, 14499.44], [261, 15000], [270, 15000], [300, 15000]])("%s counted hours produce %s salary", (hours, expected) => {
  expect(report(person({ workedHours: hours })).grossSalary).toBe(expected);
});
test("paid leave taken counts toward the threshold", () => {
  expect(report(person({ leave: 4, workedHours: 225 }))).toMatchObject({ countedHours: 261, paidLeaveHours: 36, graceHours: 9, paidLeavePay: 2000, salaryWithoutLeavePay: 13000, salaryIncludingLeavePay: 15000, grossSalary: 15000, unusedLeavePay: 0 });
});
test("five leave days disable grace but preserve four eligible paid leave days", () => {
  expect(report(person({ leave: 5, workedHours: 225 }))).toMatchObject({ countedHours: 261, paidLeaveDays: 4, graceEligible: false, graceHours: 0, grossSalary: 14500, fullSalaryThresholdHours: 270 });
});
test("five leave days can still earn full pay by reaching the actual target", () => {
  expect(report(person({ leave: 5, workedHours: 234 })).grossSalary).toBe(15000);
});
test("new employee allowance counts only two paid leave days", () => {
  expect(report(person({ leave: 4, allowance: 2, workedHours: 225 }))).toMatchObject({ paidLeaveDays: 2, paidLeaveHours: 18, countedHours: 243, grossSalary: 13500 });
});
test("unused leave adds no hours or payout", () => {
  expect(report(person({ workedHours: 250 }))).toMatchObject({ paidLeaveHours: 0, countedHours: 250, unusedLeavePay: 0, salaryWithoutLeavePay: 13888.89, salaryIncludingLeavePay: 13888.89, grossSalary: 13888.89 });
});
test("creation month excludes paid leave and uses India time", () => {
  const p = person({ month: "2026-04", leave: 4, workedHours: 225, createdAt: "2026-03-31T20:00:00Z" });
  expect(report(p)).toMatchObject({ paidLeaveEligible: false, paidLeaveHours: 0, grossSalary: 12500 });
});
test.each([["2026-02",28],["2028-02",29],["2026-10",31]])("monthly target follows calendar days in %s", (month, days) => {
  const p = person({ month, workedHours: days * 9 - 9 });
  expect(buildPayroll(p, month, `${Number(month.slice(0,4)) + 1}-01-01`).summary).toMatchObject({ targetHours: days * 9, fullSalaryThresholdHours: days * 9 - 9, grossSalary: 15000 });
});
test("mid-month joiners retain a prorated salary ceiling and exclude earlier hours", () => {
  const p = person({ joiningDate: "2026-04-16", workedHours: 126 });
  p.attendance["2026-04"].days["01"] = { hoursWorked: 200 };
  expect(report(p)).toMatchObject({ targetHours: 135, countedHours: 126, salaryCeiling: 7500, grossSalary: 7500 });
  expect(buildPayroll(p,"2026-04","2026-04-10").summary.grossSalary).toBe(0);
});
test("no hours cannot trigger free grace even for a one-day employment period", () => {
  expect(report(person({ joiningDate: "2026-04-30", workedHours: 0 })).grossSalary).toBe(0);
});
test("advances are subtracted only after earning the capped monthly salary", () => {
  const p = person({ workedHours: 300 });
  p.advances = { "2026-04": [{amount:2000}] };
  expect(report(p)).toMatchObject({ grossSalary:15000, totalAdvances:2000, netSalary:13000 });
});
test("current month does not count future attendance or leave", () => {
  const p = person({ workedHours: 10 });
  p.attendance["2026-04"].days["30"].hoursWorked = 300;
  expect(buildPayroll(p,"2026-04","2026-04-01").summary).toMatchObject({ countedHours:10, grossSalary:555.56, paidLeaveDays:0 });
});
