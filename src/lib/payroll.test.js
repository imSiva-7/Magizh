import { buildPayroll, payrollFingerprint } from "./payroll";

function person({ month = "2026-04", leave = 0, workedHours = 252, allowance = 4, joiningDate, createdAt } = {}) {
  const [year, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const start = joiningDate ? Number(joiningDate.slice(8)) : 1;
  const workedDays = end - start + 1 - leave;
  const totalSeconds = Math.round(workedHours * 3600);
  const time = seconds => [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, "0")).join(":");
  const days = Object.fromEntries(Array.from({ length: workedDays }, (_, i) => {
    const seconds = Math.floor(totalSeconds / workedDays) + (i < totalSeconds % workedDays ? 1 : 0);
    return [String(start + i).padStart(2, "0"), { checkIn: "00:00:00", checkOut: seconds ? time(seconds) : null, hoursWorked: seconds / 3600 }];
  }));
  return { salary: 15000, paidLeaveDays: allowance, joiningDate, createdAt, attendance: { [month]: { days } } };
}
const report = (p, month = "2026-04") => buildPayroll(p, month, "2030-12-01").summary;

test.each([[224,14444.44,0], [225,15000,9], [234,15000,0]])("four used leave days plus %s worked hours earn %s with %s grace hours", (hours, salary, grace) => {
  expect(report(person({ leave:4, workedHours:hours }))).toMatchObject({ grossSalary:salary, graceHours:grace, paidLeaveHours:36 });
});
test("the allocated leave allowance sets full-pay eligibility even when leave was not used", () => {
  expect(report(person({ leave:0, workedHours:225 }))).toMatchObject({ grossSalary:15000, graceEligible:true, graceHours:9, paidLeaveHours:0, fullSalaryAdjustmentHours:36, unusedLeavePay:0 });
  expect(report(person({ leave:0, workedHours:261 }))).toMatchObject({ grossSalary:15000, graceHours:9 });
});
test("worked hours below the allocated threshold remain proportional", () => {
  expect(report(person({ leave:4, workedHours:221 }))).toMatchObject({ averageHoursPerCompletedDay:8.5, graceEligible:false, graceHours:0, shortfallHours:13, grossSalary:14277.78 });
});
test("reaching the worked-hours threshold earns full salary even with more than four absences", () => {
  expect(report(person({ leave:5, workedHours:225 }))).toMatchObject({ graceEligible:true, graceHours:9, paidLeaveDays:4, grossSalary:15000 });
  expect(report(person({ leave:5, workedHours:234 })).grossSalary).toBe(15000);
});
test("new employees get only two paid leave days", () => {
  expect(report(person({ leave:4, allowance:2, workedHours:225 }))).toMatchObject({ paidLeaveDays:2, paidLeaveHours:18, graceHours:0, grossSalary:13500 });
});
test("creation month has no paid leave even if its timestamp crosses midnight in India", () => {
  expect(report(person({ leave:4, workedHours:225, createdAt:"2026-03-31T20:00:00Z" }))).toMatchObject({ paidLeaveEligible:false, paidLeaveHours:0, graceHours:0, grossSalary:12500 });
});
test("unused leave is not paid", () => {
  expect(report(person({ workedHours:200 }))).toMatchObject({ paidLeaveHours:0, unusedLeavePay:0, salaryWithoutLeavePay:11111.11, salaryIncludingLeavePay:11111.11 });
});
test.each([["2026-02",28], ["2028-02",29], ["2026-10",31]])("calendar month %s has the correct target and full-pay boundary", (month, count) => {
  const s = report(person({ month, leave:4, workedHours:count*9-45 }), month);
  expect(s).toMatchObject({ targetHours:count*9, fullSalaryThresholdHours:count*9-45, graceHours:9, grossSalary:15000 });
});
test.each([[8.4,true,7500], [8.5,true,7500], [(8*3600+29*60+59)/3600,true,7500]])("midmonth average %s does not override the worked-hours threshold", (average, qualifies, expected) => {
  const s=report(person({ joiningDate:"2026-04-16", leave:2, workedHours:13*average }));
  expect(s.graceEligible).toBe(qualifies);
  expect(s.grossSalary).toBe(expected);
  expect(s.salaryCeiling).toBe(7500);
});
test("a shortfall one second over nine hours does not qualify", () => {
  expect(report(person({ leave:4, workedHours:225-1/3600 }))).toMatchObject({ graceHours:0, fullSalaryEligible:false, grossSalary:14499.98 });
});
test("actual complete times override stale stored hours; incomplete days count zero", () => {
  const p=person({ workedHours:270 });
  const days=p.attendance["2026-04"].days;
  days["01"].hoursWorked=999;
  days["02"].checkOut=null;
  const s=report(p);
  expect(s).toMatchObject({ totalHoursWorked:261, completedDays:29, incompleteDays:1, averageHoursPerCompletedDay:9, graceHours:9, grossSalary:15000 });
});
test("before-joining and future attendance is excluded", () => {
  const p=person({ joiningDate:"2026-04-16", workedHours:135 });
  p.attendance["2026-04"].days["01"]={ checkIn:"00:00",checkOut:"23:00",hoursWorked:23 };
  expect(report(p).totalHoursWorked).toBe(135);
  expect(buildPayroll(p,"2026-04","2026-04-10").summary.totalHoursWorked).toBe(0);
  expect(buildPayroll(person({ workedHours:270 }),"2026-04","2026-04-01").summary.totalHoursWorked).toBe(9);
});
test("today is pending until recorded, with no paid leave consumed", () => {
  const p=person({ workedHours:270 });
  delete p.attendance["2026-04"].days["01"];
  const r=buildPayroll(p,"2026-04","2026-04-01");
  expect(r.attendance[0].status).toBe("pending");
  expect(r.summary).toMatchObject({ paidLeaveDays:0, pendingLeaveDays:1, absentDays:0, grossSalary:0 });
});
test("salary components reconcile and advances are subtracted once", () => {
  const p=person({ leave:4,workedHours:225 });
  p.advances={ "2026-04":[{amount:2000}] };
  const s=report(p);
  expect(s).toMatchObject({ regularPay:12500, paidLeavePay:2000, gracePay:500, salaryWithoutLeavePay:13000, salaryIncludingLeavePay:15000, netSalary:13000 });
});
test("no completed days means no grace", () => {
  expect(report(person({ joiningDate:"2026-04-30",workedHours:0 }))).toMatchObject({ graceEligible:false, grossSalary:0 });
});
test("fingerprint tracks leave allowance and creation month inputs", () => {
  const p=person();
  const before=payrollFingerprint(p,"2026-04","2026-12-01");
  expect(payrollFingerprint({...p,paidLeaveDays:2},"2026-04","2026-12-01")).not.toBe(before);
  expect(payrollFingerprint({...p,createdAt:"2026-04-01"},"2026-04","2026-12-01")).not.toBe(before);
});

test.each([["2026-10",4,234,234], ["2026-10",2,252,252], ["2026-04",4,225,225], ["2026-04",2,243,243]])("%s with %s allocated leave days requires %s hours", (month,allowance,hours,threshold) => {
  const s=report(person({month,allowance,workedHours:hours}),month);
  expect(s.fullSalaryThresholdHours).toBe(threshold);
  expect(s.grossSalary).toBe(15000);
  expect(s.graceHours).toBeLessThanOrEqual(9);
  expect(s.paidLeavePay).toBe(0);
  expect(s.regularPay+s.gracePay+s.fullSalaryAdjustmentPay+s.paidLeavePay).toBeCloseTo(s.grossSalary,1);
  const below=report(person({month,allowance,workedHours:hours-1/3600}),month);
  expect(below.fullSalaryEligible).toBe(false);
  expect(below.grossSalary).toBeLessThan(15000);
});
