"use client";
import { formatAttendanceHours, completedAttendanceAverage } from "@/utils/attendanceHours";
import AttendanceTimeEditor from "@/components/AttendanceTimeEditor";
import { attendanceFilename } from "@/utils/attendanceFilename";
import DataSkeleton from "@/components/DataSkeleton";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { ToastContainer, toast } from "react-toastify";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/attendance.module.css";
import {
  attendanceToday,
  formatAttendanceDate,
  formatAttendanceMonth,
} from "@/utils/attendanceDates.mjs";

import {
  useEmployeeRankings,
  EmployeeRankBadge,
} from "@/components/EmployeeRank";

function AttendanceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [loading, setLoading] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [attendanceRefresh, setAttendanceRefresh] = useState(0);
  const [employees, setEmployees] = useState([]);
  const [selectedEmpID, setSelectedEmpID] = useState("");
  const [attendanceData, setAttendanceData] = useState(null);
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    amount: "",
    date: attendanceToday(),
    reason: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const attendanceRequestRef = useRef(null);

  // Date filter state
  const currentMonth = attendanceToday().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const ranking = useEmployeeRankings(month);

  // Fetch employees list
  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch("/api/employee");
      if (!res.ok) throw new Error("Failed to fetch employees");
      const data = await res.json();
      setEmployees(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Fetch employees error:", error);
      toast.error("Failed to load employees");
    } finally {
      setEmployeesLoading(false);
    }
  }, []);

  // Fetch attendance data for selected employee
  const fetchAttendanceData = useCallback(async (empID, selectedMonth) => {
    if (!empID) return;
    attendanceRequestRef.current?.abort();
    const controller = new AbortController();
    attendanceRequestRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/attendance?empID=${empID}&month=${selectedMonth}`,
        { signal: controller.signal, cache: "no-store" },
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch attendance");
      }
      const data = await res.json();
      if (!controller.signal.aborted) setAttendanceData(data);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Fetch attendance error:", error);
      toast.error(error.message || "Failed to load attendance data");
      setAttendanceData(null);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    const empIDFromURL = searchParams.get("empID");
    if (empIDFromURL) {
      setSelectedEmpID(empIDFromURL);
    } else if (employees.length) {
      setSelectedEmpID((current) => current || String(employees[0].empID));
    }
    const monthFromURL = searchParams.get("month");
    if (
      /^\d{4}-(0[1-9]|1[0-2])$/.test(monthFromURL || "") &&
      monthFromURL <= currentMonth
    )
      setMonth(monthFromURL);
  }, [searchParams, currentMonth, employees]);

  useEffect(() => {
    if (selectedEmpID && month) {
      fetchAttendanceData(selectedEmpID, month);
    }
    return () => attendanceRequestRef.current?.abort();
  }, [selectedEmpID, month, fetchAttendanceData, attendanceRefresh]);

  const handleEmployeeChange = (empID) => {
    attendanceRequestRef.current?.abort();
    setLoading(false);
    setAttendanceData(null);
    setShowAdvanceForm(false);
    setAdvanceForm({ amount: "", date: attendanceToday(), reason: "" });
    setSelectedEmpID(empID);
    if (empID) {
      router.push(`/employee/attendance?empID=${empID}&month=${month}`);
    } else {
      router.push("/employee/attendance");
      setAttendanceData(null);
    }
  };

  const handleMonthChange = (newMonth) => {
    attendanceRequestRef.current?.abort();
    setLoading(false);
    setAttendanceData(null);
    setShowAdvanceForm(false);
    setAdvanceForm({ amount: "", date: attendanceToday(), reason: "" });
    setMonth(newMonth);
  };

  const handleAdvanceSubmit = async (e) => {
    e.preventDefault();

    if (!advanceForm.amount || parseFloat(advanceForm.amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        empID: selectedEmpID,
        amount: parseFloat(advanceForm.amount),
        date: advanceForm.date,
        month: month,
        reason: advanceForm.reason.trim(),
      };

      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to add advance");
      }

      toast.success("Advance payment recorded successfully");
      setShowAdvanceForm(false);
      setAdvanceForm({
        amount: "",
        date: attendanceToday(),
        reason: "",
      });
      fetchAttendanceData(selectedEmpID, month);
    } catch (error) {
      console.error("Advance submit error:", error);
      toast.error(error.message || "Failed to record advance");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAdvance = async (advanceId) => {
    if (
      !window.confirm("Are you sure you want to delete this advance payment?")
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/attendance?id=${advanceId}&empID=${selectedEmpID}&month=${month}`,
        {
          method: "DELETE",
        },
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete advance");
      }

      toast.success("Advance payment deleted successfully");
      fetchAttendanceData(selectedEmpID, month);
    } catch (error) {
      console.error("Delete advance error:", error);
      toast.error(error.message || "Failed to delete advance");
    }
  };

  const formatCurrency = (amount) => {
    return `₹${parseFloat(amount).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatTime = (time) => {
    if (!time) return "-";
    try {
      const [hours, minutes] = time.split(":");
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? "PM" : "AM";
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${displayHour}:${minutes} ${ampm}`;
    } catch {
      return time;
    }
  };

  const handleExportPDF = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(
        "/api/attendance/payroll?empID=" + selectedEmpID + "&month=" + month,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = attendanceFilename(attendanceData?.employee?.name, month);
      link.click();
      URL.revokeObjectURL(url);
      toast.success("PDF exported successfully");
    } catch (error) {
      toast.error(error.message);
      fetchAttendanceData(selectedEmpID, month);
    } finally {
      setIsSubmitting(false);
    }
  };

  const completedHours = completedAttendanceAverage(attendanceData?.attendance);

  return (
    <div className={styles.container}>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        closeOnClick
        pauseOnHover
        draggable
      />

      <div className={styles.headerSection}>
        <div className={styles.headerContent}>
          <h1>Employee Attendance & Salary</h1>
        </div>
      </div>

      {/* Employee Selection */}
      <div data-filter="card" className={styles.filterSection}>
        <div data-filter="grid" className={styles.filterGrid}>
          <div className={styles.inputGroup}>
            <label htmlFor="employee-select">Select Employee</label>
            <select
              id="employee-select"
              value={selectedEmpID}
              onChange={(e) => handleEmployeeChange(e.target.value)}
              className={styles.selectInput}
              disabled={isSubmitting || employeesLoading}
            >
              <option value="">{employeesLoading ? "Loading employees…" : "-- Choose Employee --"}</option>
              {employees.map((emp) => (
                <option key={emp._id} value={emp.empID}>
                  {emp.empID} - {emp.name}
                </option>
              ))}
            </select>
          </div>

          {(selectedEmpID || employeesLoading) && (
            <div className={styles.inputGroup}>
              <label htmlFor="month-select">Select Month</label>
              <input
                id="month-select"
                type="month"
                value={month}
                onChange={(e) => handleMonthChange(e.target.value)}
                className={styles.input}
                max={currentMonth}
                disabled={isSubmitting}
              />
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {(employeesLoading || loading) && <DataSkeleton label="Loading attendance data..." />}

      {/* Attendance Data Display */}
      {!employeesLoading && !loading && attendanceData && (
        <>
          {/* Employee Info Card */}
          <div className={styles.infoCard}>
            <h2>Employee Information</h2>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Name:</span>
                <span className={styles.infoValue}>
                  {attendanceData.employee.name}{" "}
                  {!ranking.loading && !ranking.error && (
                    <EmployeeRankBadge
                      ranking={ranking.byEmployee.get(
                        String(attendanceData.employee.empID),
                      )}
                      month={month}
                    />
                  )}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Employee ID:</span>
                <span className={styles.infoValue}>
                  {attendanceData.employee.empID}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Monthly Salary:</span>
                <span className={styles.infoValue}>
                  {formatCurrency(attendanceData.employee.salary)}
                </span>
              </div>
            </div>
          </div>

          {/* Salary Summary Card */}
          <div className={styles.summaryCard}>
            <h2>Attendance & Salary Stats — {formatAttendanceMonth(month)}</h2>
            <p className={styles.salaryFormula}>
              9 hours or more earns a full day’s salary. Below 9 hours, pay is
              proportional. Daily salary = monthly salary ÷ days in month. Total
              each day’s pay, then subtract advances. Extra hours do not add
              extra pay.
            </p>
            {attendanceData.summary.paidLeaveEligible === false && (
              <p>
                Paid leave starts the month after this employee was created.
              </p>
            )}
            <div className={styles.summaryGrid}>
              {[
                ["Days in Month", attendanceData.period.daysInPeriod],
                ["Days Elapsed", attendanceData.summary.elapsedDays],
                ["Days Remaining", attendanceData.summary.remainingDays],
                ["Days Present", attendanceData.summary.workedDays],
                ["Absent Days", attendanceData.summary.absentDays],
                [
                  "Attendance Rate",
                  attendanceData.summary.attendanceRate + "%",
                ],
                [
                  "Paid Leave Allowance",
                  attendanceData.summary.paidLeaveAllowance,
                ],
                ["Paid Leave Used", attendanceData.summary.paidLeaveDays],
                [
                  "Paid Leave Remaining",
                  attendanceData.summary.remainingPaidLeave,
                ],
                ["Excess Leave Days", attendanceData.summary.excessLeaveDays],
                [
                  "Incomplete Attendance",
                  attendanceData.summary.incompleteDays,
                ],
                [
                  "Total Hours in Month",
                  formatAttendanceHours(attendanceData.summary.standardHours),
                ],
                ["Hours Worked", formatAttendanceHours(attendanceData.summary.totalHoursWorked)],
                [
                  "Payable Hours (Max 9 / Day)",
                  formatAttendanceHours(attendanceData.summary.payableHours),
                ],
                [
                  "Daily Salary",
                  formatCurrency(attendanceData.summary.dailyRate),
                ],
                [
                  "Extra Hours (No Extra Pay)",
                  formatAttendanceHours(attendanceData.summary.totalOvertimeHours),
                ],
                [
                  "Avg Hours / Completed Day",
                  completedHours.average === null ? "—" : formatAttendanceHours(completedHours.average),
                ],
                [
                  "Avg Salary per Day",
                  formatCurrency(
                    attendanceData.summary.workedDays > 0
                      ? attendanceData.summary.grossSalary /
                          attendanceData.summary.workedDays
                      : 0,
                  ),
                ],
                [
                  "Pay per Hour",
                  formatCurrency(attendanceData.summary.hourlyRate) + "/h",
                ],
                [
                  "Paid Leave (Not Added)",
                  formatCurrency(attendanceData.summary.paidLeavePay),
                ],
                [
                  "Gross Salary",
                  formatCurrency(attendanceData.summary.grossSalary),
                ],
                [
                  "Advances",
                  formatCurrency(attendanceData.summary.totalAdvances),
                ],
              ].map(([label, value]) => (
                <div key={label} className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>{label}</span>
                  <span className={styles.summaryValue}>{value}</span>
                </div>
              ))}
              <div className={`${styles.summaryItem} ${styles.netSalary}`}>
                <span className={styles.summaryLabel}>Net Salary</span>
                <span className={styles.summaryValue}>
                  {formatCurrency(attendanceData.summary.netSalary)}
                </span>
              </div>
            </div>
          </div>

          <section
            className={styles.summaryCard}
            aria-labelledby="salary-calculation-title"
          >
            <h2 id="salary-calculation-title">
              How {attendanceData.employee.name}’s salary is calculated
            </h2>
            <p>
              Actual figures for {formatAttendanceMonth(month)}, using
              attendance from{" "}
              {formatAttendanceDate(attendanceData.period.startDate)} to{" "}
              {formatAttendanceDate(attendanceData.period.endDate)}.
            </p>
            <ol className={styles.calculationSteps}>
              <li>
                <strong>Find the hourly rate.</strong> Monthly salary ÷ days in
                month ÷ 9 hours per day.
                <br />
                {formatCurrency(attendanceData.employee.salary)} ÷{" "}
                {attendanceData.period.daysInPeriod} ÷ 9 = ₹
                {(
                  Number(attendanceData.employee.salary) /
                  attendanceData.period.daysInPeriod /
                  9
                ).toFixed(6)}{" "}
                per hour.
              </li>
              <li>
                <strong>Count recorded hours worked.</strong>{" "}
                {attendanceData.summary.totalHoursWorked} hours, including{" "}
                {attendanceData.summary.totalOvertimeHours} extra hours above 9
                per day. Only up to 9 hours per day count toward salary; extra
                hours do not cover shorter days.
              </li>
              <li>
                <strong>Calculate earned salary.</strong> Add each day’s payable
                hours (maximum 9), then multiply by the hourly rate. For
                example, ₹15,000 in a 30-day month gives ₹500 for 9 or more
                hours, and ₹333.33 for 6 hours.
                <br />
                {attendanceData.summary.payableHours} × (
                {formatCurrency(attendanceData.employee.salary)} ÷{" "}
                {attendanceData.period.daysInPeriod} ÷ 9) ={" "}
                <strong>
                  {formatCurrency(attendanceData.summary.grossSalary)}
                </strong>
                .
              </li>
              <li>
                <strong>Subtract advances.</strong> Earned salary − advance
                payments.
                <br />
                {formatCurrency(attendanceData.summary.grossSalary)} −{" "}
                {formatCurrency(attendanceData.summary.totalAdvances)} ={" "}
                <strong>
                  {formatCurrency(attendanceData.summary.netSalary)} net salary
                </strong>
                .
              </li>
              <li>
                <strong>Check the daily averages.</strong>
                <br />
                Hours: {formatAttendanceHours(completedHours.hours)} ÷ {completedHours.days} completed days ={" "}
                {completedHours.average === null ? "—" : formatAttendanceHours(completedHours.average)} per day.
                Days without a checkout are excluded from this average.
                <br />
                Salary: {formatCurrency(
                  attendanceData.summary.grossSalary,
                )} ÷ {attendanceData.summary.workedDays} worked days ={" "}
                {formatCurrency(
                  attendanceData.summary.workedDays
                    ? attendanceData.summary.grossSalary /
                        attendanceData.summary.workedDays
                    : 0,
                )}{" "}
                per day, before advances.
                {attendanceData.summary.workedDays === 0 &&
                  " With no completed days, the hours average is unavailable."}
              </li>
            </ol>
            <p>
              <strong>Leave:</strong> {attendanceData.summary.paidLeaveDays}{" "}
              used × 9 hours × hourly rate ={" "}
              {formatCurrency(attendanceData.summary.paidLeavePay)} displayed
              leave value. This value is not added to salary. Unused leave earns
              no money.{" "}
              {attendanceData.summary.paidLeaveEligible === false
                ? "There is no paid leave allowance during the employee’s creation month."
                : "The monthly allowance is " +
                  attendanceData.summary.paidLeaveAllowance +
                  " days."}
            </p>
            <p>
              <strong>Joining date:</strong>{" "}
              {attendanceData.employee.joiningDate
                ? formatAttendanceDate(attendanceData.employee.joiningDate) +
                  ". Hours before this date are excluded."
                : "No joining date is recorded; attendance is counted from the start of the month."}{" "}
              The hourly rate always uses all calendar days in the month.
            </p>
            <p>
              Rates are shown rounded for readability; calculations use the full
              rate and final amounts are rounded to two decimals. A negative net
              salary means advances exceed earned pay.
            </p>
          </section>

          {/* Advances Section */}
          <div className={styles.advancesSection}>
            <div className={styles.advancesHeader}>
              <h2>Advance Payments</h2>
              {isAdmin && !showAdvanceForm && (
                <button
                  data-button="primary"
                  onClick={() => setShowAdvanceForm(true)}
                  className={styles.addButton}
                >
                  + Add Advance
                </button>
              )}
            </div>

            {showAdvanceForm && (
              <form
                data-entry-form
                onSubmit={handleAdvanceSubmit}
                className={styles.advanceForm}
              >
                <div className={styles.formGrid}>
                  <div className={styles.inputGroup}>
                    <label htmlFor="amount">Amount *</label>
                    <input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={advanceForm.amount}
                      onChange={(e) =>
                        setAdvanceForm({
                          ...advanceForm,
                          amount: e.target.value,
                        })
                      }
                      className={styles.input}
                      placeholder="Enter amount"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label htmlFor="date">Date *</label>
                    <input
                      id="date"
                      type="date"
                      value={advanceForm.date}
                      onChange={(e) =>
                        setAdvanceForm({ ...advanceForm, date: e.target.value })
                      }
                      className={styles.input}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label htmlFor="reason">Reason</label>
                    <input
                      id="reason"
                      type="text"
                      value={advanceForm.reason}
                      onChange={(e) =>
                        setAdvanceForm({
                          ...advanceForm,
                          reason: e.target.value,
                        })
                      }
                      className={styles.input}
                      placeholder="Enter reason (optional)"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
                <div className={styles.formActions}>
                  <button
                    data-button="primary"
                    type="submit"
                    disabled={isSubmitting}
                    className={styles.submitButton}
                  >
                    {isSubmitting ? "Saving..." : "Save Advance"}
                  </button>
                  <button
                    data-button="secondary"
                    type="button"
                    onClick={() => {
                      setShowAdvanceForm(false);
                      setAdvanceForm({
                        amount: "",
                        date: attendanceToday(),
                        reason: "",
                      });
                    }}
                    className={styles.cancelButton}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {attendanceData.advances.length > 0 ? (
              <div className={styles.advancesTable}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Reason</th>
                      {isAdmin && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceData.advances.map((advance) => (
                      <tr key={advance._id}>
                        <td>{formatAttendanceDate(advance.date)}</td>
                        <td className={styles.amountCell}>
                          {formatCurrency(advance.amount)}
                        </td>
                        <td>{advance.reason || "-"}</td>
                        {isAdmin && (
                          <td className={styles.actionsCell}>
                            <button
                              data-button="danger"
                              onClick={() => handleDeleteAdvance(advance._id)}
                              className={styles.deleteButton}
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.emptyMessage}>
                No advance payments recorded
              </p>
            )}
          </div>

          {/* Export Section */}
          {attendanceData && (
            <div className={styles.exportSection}>
              <span className={styles.entryCount}>
                Attendance data for {attendanceData.employee.name} (
                {formatAttendanceMonth(month)})
              </span>
              <div className={styles.exportButtons}>
                <button
                  data-button="secondary"
                  disabled={isSubmitting}
                  onClick={handleExportPDF}
                  className={styles.exportBtn}
                  aria-label="Export attendance as PDF"
                >
                  Export as PDF
                </button>
              </div>
            </div>
          )}
          {/* Attendance Records Table */}
          <div className={styles.attendanceSection}>
            <h2>Daily Attendance Records</h2>
            {attendanceData.attendance.length > 0 ? (
              <div className={styles.tableWrapper}>
                <table className={styles.attendanceTable}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Check In (IST)</th>
                      <th>Check Out (IST)</th>
                      <th>Hours Worked</th>
                      {isAdmin && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceData.attendance.map((day) => (
                      <tr
                        key={day.date}
                        className={
                          day.status === "paid_leave"
                            ? styles.paidLeaveRow
                            : day.status !== "present"
                              ? styles.absentRow
                              : ""
                        }
                      >
                        <td className={styles.dateCell}>
                          {formatAttendanceDate(day.date)}
                        </td>
                        <td className={styles.statusCell}>
                          {day.status !== "present" ? (
                            <span
                              className={
                                day.status === "paid_leave"
                                  ? styles.paidLeaveBadge
                                  : styles.absentBadge
                              }
                            >
                              {
                                {
                                  paid_leave: "Paid Leave",
                                  excess_leave: "Absent",
                                  pending: "Absent",
                                }[day.status]
                              }
                            </span>
                          ) : (
                            <span className={styles.presentBadge}>Present</span>
                          )}
                        </td>
                        <td className={styles.timeCell}>
                          {day.status !== "present"
                            ? "-"
                            : formatTime(day.checkIn)}
                        </td>
                        <td className={styles.timeCell}>
                          {day.status !== "present"
                            ? "-"
                            : formatTime(day.checkOut)}
                        </td>
                        <td className={styles.hoursCell}>
                          {day.status === "present" && !day.checkOut
                            ? (day.date === attendanceToday() ? "In progress" : "Missing checkout")
                            : day.hoursWorked > 0 ? formatAttendanceHours(day.hoursWorked) : "-"}
                        </td>
                        {isAdmin && (
                          <td>
                            {day.status === "present" && (
                              <AttendanceTimeEditor
                                empID={selectedEmpID}
                                day={day}
                                onSaved={() => {
                                  setAttendanceRefresh((value) => value + 1);
                                  ranking.retry();
                                  toast.success("Attendance times updated");
                                }}
                              />
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.emptyMessage}>
                No attendance records found for this period
              </p>
            )}
          </div>
        </>
      )}

      {/* Empty State */}
      {!employeesLoading && !loading && !attendanceData && selectedEmpID && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📊</div>
          <p>No attendance data available for the selected period</p>
        </div>
      )}

      {!employeesLoading && !loading && !selectedEmpID && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>👥</div>
          <p>Please select an employee to view attendance data</p>
        </div>
      )}
    </div>
  );
}

export default function EmployeeAttendance() {
  return (
    <Suspense fallback={<DataSkeleton label="Loading..." />}>
      <AttendanceContent />
    </Suspense>
  );
}
