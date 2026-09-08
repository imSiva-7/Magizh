"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ToastContainer, toast } from "react-toastify";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/attendance.module.css";

export default function EmployeeAttendance() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [selectedEmpID, setSelectedEmpID] = useState("");
  const [attendanceData, setAttendanceData] = useState(null);
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    amount: "",
    date: new Date().toISOString().split("T")[0],
    reason: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Date filter state
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);

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
    }
  }, []);

  // Fetch attendance data for selected employee
  const fetchAttendanceData = useCallback(async (empID, selectedMonth) => {
    if (!empID) return;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/attendance?empID=${empID}&month=${selectedMonth}`
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch attendance");
      }
      const data = await res.json();
      setAttendanceData(data);
    } catch (error) {
      console.error("Fetch attendance error:", error);
      toast.error(error.message || "Failed to load attendance data");
      setAttendanceData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    const empIDFromURL = searchParams.get("empID");
    if (empIDFromURL) {
      setSelectedEmpID(empIDFromURL);
    }
  }, [searchParams]);

  useEffect(() => {
    if (selectedEmpID && month) {
      fetchAttendanceData(selectedEmpID, month);
    }
  }, [selectedEmpID, month, fetchAttendanceData]);

  const handleEmployeeChange = (empID) => {
    setSelectedEmpID(empID);
    if (empID) {
      router.push(`/employee/attendance?empID=${empID}`);
    } else {
      router.push("/employee/attendance");
      setAttendanceData(null);
    }
  };

  const handleMonthChange = (newMonth) => {
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
        date: new Date().toISOString().split("T")[0],
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
    if (!window.confirm("Are you sure you want to delete this advance payment?")) {
      return;
    }

    try {
      const res = await fetch(`/api/attendance?id=${advanceId}`, {
        method: "DELETE",
      });

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
      <div className={styles.filterSection}>
        <div className={styles.filterGrid}>
          <div className={styles.inputGroup}>
            <label htmlFor="employee-select">Select Employee</label>
            <select
              id="employee-select"
              value={selectedEmpID}
              onChange={(e) => handleEmployeeChange(e.target.value)}
              className={styles.selectInput}
            >
              <option value="">-- Choose Employee --</option>
              {employees.map((emp) => (
                <option key={emp._id} value={emp.empID}>
                  {emp.empID} - {emp.name}
                </option>
              ))}
            </select>
          </div>

          {selectedEmpID && (
            <div className={styles.inputGroup}>
              <label htmlFor="month-select">Select Month</label>
              <input
                id="month-select"
                type="month"
                value={month}
                onChange={(e) => handleMonthChange(e.target.value)}
                className={styles.input}
                max={currentMonth}
              />
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Loading attendance data...</p>
        </div>
      )}

      {/* Attendance Data Display */}
      {!loading && attendanceData && (
        <>
          {/* Employee Info Card */}
          <div className={styles.infoCard}>
            <h2>Employee Information</h2>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Name:</span>
                <span className={styles.infoValue}>
                  {attendanceData.employee.name}
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
            <h2>Salary Summary - {month}</h2>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Days in Month:</span>
                <span className={styles.summaryValue}>
                  {attendanceData.period.daysInPeriod}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Days Worked:</span>
                <span className={styles.summaryValue}>
                  {attendanceData.period.daysWorked}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Standard Hours:</span>
                <span className={styles.summaryValue}>
                  {attendanceData.summary.standardHours}h
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Regular Hours:</span>
                <span className={styles.summaryValue}>
                  {attendanceData.summary.totalRegularHours}h
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Overtime Hours:</span>
                <span className={styles.summaryValue}>
                  {attendanceData.summary.totalOvertimeHours}h
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Total Hours:</span>
                <span className={styles.summaryValue}>
                  {attendanceData.summary.totalHoursWorked}h
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Hourly Rate:</span>
                <span className={styles.summaryValue}>
                  {formatCurrency(attendanceData.summary.hourlyRate)}/h
                </span>
              </div>
             
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Regular Pay:</span>
                <span className={styles.summaryValue}>
                  {formatCurrency(attendanceData.summary.regularPay)}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Overtime Pay:</span>
                <span className={styles.summaryValue}>
                  {formatCurrency(attendanceData.summary.overtimePay)}
                </span>
              </div>
              <div className={`${styles.summaryItem} ${styles.highlight}`}>
                <span className={styles.summaryLabel}>Gross Salary:</span>
                <span className={styles.summaryValue}>
                  {formatCurrency(attendanceData.summary.grossSalary)}
                </span>
              </div>
              <div className={`${styles.summaryItem} ${styles.deduction}`}>
                <span className={styles.summaryLabel}>Total Advances:</span>
                <span className={styles.summaryValue}>
                  - {formatCurrency(attendanceData.summary.totalAdvances)}
                </span>
              </div>
              <div className={`${styles.summaryItem} ${styles.netSalary}`}>
                <span className={styles.summaryLabel}>Net Salary:</span>
                <span className={styles.summaryValue}>
                  {formatCurrency(attendanceData.summary.netSalary)}
                </span>
              </div>
            </div>
          </div>

          {/* Advances Section */}
          <div className={styles.advancesSection}>
            <div className={styles.advancesHeader}>
              <h2>Advance Payments</h2>
              {isAdmin && !showAdvanceForm && (
                <button
                  onClick={() => setShowAdvanceForm(true)}
                  className={styles.addButton}
                >
                  + Add Advance
                </button>
              )}
            </div>

            {showAdvanceForm && (
              <form onSubmit={handleAdvanceSubmit} className={styles.advanceForm}>
                <div className={styles.formGrid}>
                  <div className={styles.inputGroup}>
                    <label htmlFor="amount">Amount *</label>
                    <input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={advanceForm.amount}
                      onChange={(e) =>
                        setAdvanceForm({ ...advanceForm, amount: e.target.value })
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
                        setAdvanceForm({ ...advanceForm, reason: e.target.value })
                      }
                      className={styles.input}
                      placeholder="Enter reason (optional)"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
                <div className={styles.formActions}>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={styles.submitButton}
                  >
                    {isSubmitting ? "Saving..." : "Save Advance"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdvanceForm(false);
                      setAdvanceForm({
                        amount: "",
                        date: new Date().toISOString().split("T")[0],
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
                        <td>{advance.date}</td>
                        <td className={styles.amountCell}>
                          {formatCurrency(advance.amount)}
                        </td>
                        <td>{advance.reason || "-"}</td>
                        {isAdmin && (
                          <td className={styles.actionsCell}>
                            <button
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
              <p className={styles.emptyMessage}>No advance payments recorded</p>
            )}
          </div>

          {/* Attendance Records Table */}
          <div className={styles.attendanceSection}>
            <h2>Daily Attendance Records</h2>
            {attendanceData.attendance.length > 0 ? (
              <div className={styles.tableWrapper}>
                <table className={styles.attendanceTable}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Check In</th>
                      <th>Check Out</th>
                      <th>Hours Worked</th>
                      <th>Regular</th>
                      <th>Overtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceData.attendance.map((day) => (
                      <tr key={day.date}>
                        <td className={styles.dateCell}>{day.date}</td>
                        <td className={styles.timeCell}>
                          {formatTime(day.checkIn)}
                        </td>
                        <td className={styles.timeCell}>
                          {formatTime(day.checkOut)}
                        </td>
                        <td className={styles.hoursCell}>{day.hoursWorked}h</td>
                        <td className={styles.regularCell}>
                          {day.regularHours}h
                        </td>
                        <td className={styles.overtimeCell}>
                          {day.overtimeHours > 0 ? `${day.overtimeHours}h` : "-"}
                        </td>
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
      {!loading && !attendanceData && selectedEmpID && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📊</div>
          <p>No attendance data available for the selected period</p>
        </div>
      )}

      {!loading && !selectedEmpID && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>👥</div>
          <p>Please select an employee to view attendance data</p>
        </div>
      )}
    </div>
  );
}
