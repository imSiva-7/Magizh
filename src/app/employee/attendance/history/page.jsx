"use client";
import AdminSummary from "@/components/AdminSummary";
import { useSession } from "next-auth/react";
import AttendanceTimeEditor from "@/components/AttendanceTimeEditor";
import DataSkeleton from "@/components/DataSkeleton";
import { formatAttendanceHours } from "@/utils/attendanceHours";

import { useState, useEffect, useMemo } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { attendanceToday, formatAttendanceDate } from "@/utils/attendanceDates.mjs";
import Link from "next/link";
import PageHeading from "@/components/PageHeading";
import styles from "@/css/attendance.module.css";
import { useEmployeeRankings, EmployeeLeaderboard } from "@/components/EmployeeRank";

const getCurrentMonth = () => attendanceToday().slice(0, 7);
const formatTime = (time) => {
  if (!time) return "—";
  const [hour, minute] = time.split(":");
  const hours = Number(hour);
  return `${hours % 12 || 12}:${minute} ${hours >= 12 ? "PM" : "AM"}`;
};

export default function AttendanceHistoryPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [month, setMonth] = useState(getCurrentMonth);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [status, setStatus] = useState("all");
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState({ records: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const ranking = useEmployeeRankings(month, refresh);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!month) {
      setLoading(false);
      setData({ records: [], summary: null });
      return;
    }
    const controller = new AbortController();
    async function fetchHistory() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ month });
        if (searchDebounced.trim()) params.set("search", searchDebounced.trim());
        if (status !== "all") params.set("status", status);
        const response = await fetch(`/api/attendance/history?${params}`, { signal: controller.signal });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Could not load attendance history");
        setData({ records: Array.isArray(json.records) ? json.records : [], summary: json.summary || null });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause.message || "Could not load attendance history");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    fetchHistory();
    return () => controller.abort();
  }, [month, searchDebounced, status, refresh]);

  const groups = useMemo(() => {
    const byDate = new Map();
    for (const record of data.records) {
      if (!byDate.has(record.date)) byDate.set(record.date, []);
      byDate.get(record.date).push(record);
    }
    return [...byDate.entries()];
  }, [data.records]);

  const reset = () => {
    setMonth(getCurrentMonth());
    setSearch("");
    setSearchDebounced("");
    setStatus("all");
  };

  return (
    <div className={`${styles.container} ${styles.compactHistory}`}>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        closeOnClick
        pauseOnHover
        draggable
      />
      <div className={styles.headerContent}>
        <PageHeading title="Attendance History" section="YOUR TEAM" description="Daily check-in, check-out, and hours worked. Times in IST." />
        <Link data-button="secondary" href="/employee/attendance" className={styles.secondaryButton}>Employee details</Link>
      </div>

      <AdminSummary><div data-filter="card" className={styles.historyControls}>
        <div className={styles.inputGroup}>
          <label htmlFor="history-month">Month</label>
          <input id="history-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} max={getCurrentMonth()} className={styles.input} required />
        </div>
        <div className={styles.inputGroup}>
          <label htmlFor="history-search">Employee</label>
          <input id="history-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or employee ID" autoComplete="off" className={styles.input} />
        </div>
        <div className={styles.inputGroup}>
          <label htmlFor="history-status">Show</label>
          <select id="history-status" value={status} onChange={(event) => setStatus(event.target.value)} className={styles.selectInput}>
            <option value="all">All attendance</option>
            <option value="complete">Complete</option>
            <option value="incomplete">Missing checkout</option>
          </select>
        </div>
        <div data-filter="actions" className={styles.historyControlActions}>
          <button data-button="secondary" type="button" onClick={reset} className={styles.secondaryButton}>Reset</button>
          <button data-button="primary" type="button" onClick={() => setRefresh((value) => value + 1)} className={styles.primaryButton} disabled={loading} aria-label="Refresh attendance">Refresh</button>
        </div>
      </div></AdminSummary>

      <EmployeeLeaderboard month={month} state={ranking} />

      {loading ? (
        <DataSkeleton label="Loading attendance…" />
      ) : error ? (
        <div className={styles.emptyState} role="alert"><p>{error}</p><button data-button="secondary" type="button" onClick={() => setRefresh((value) => value + 1)} className={styles.primaryButton}>Try again</button></div>
      ) : !data.records.length ? (
        <div className={styles.emptyState}><p>{!month ? "Choose a month to view attendance." : searchDebounced ? `No attendance found for “${searchDebounced}”.` : "No attendance found for these filters."}</p></div>
      ) : (
        <>
          {data.summary && <AdminSummary><div className={styles.historyOverview} aria-label="Attendance summary">
            <div className={styles.historyStat}><span>Employees</span><strong>{data.summary.uniqueEmployees}</strong><small>with attendance</small></div>
            <div className={`${styles.historyStat} ${styles.historyStatHours}`}><span>Total hours</span><strong>{formatAttendanceHours(data.summary.totalHours)}</strong><small>recorded this month</small></div>
            <div className={`${styles.historyStat} ${data.summary.incompleteCount > 0 ? styles.historyStatAttention : ""}`}><span>Missing checkout</span><strong>{data.summary.incompleteCount || 0}</strong><small>{data.summary.incompleteCount ? "needs attention" : "all checkouts recorded"}</small></div>
          </div></AdminSummary>}
          <div className={styles.historyGroups}>
            {groups.map(([date, records]) => (
              <section key={date} className={styles.historyGroup} aria-label={formatAttendanceDate(date)}>
                <div className={styles.historyGroupHeader}><h2 className={styles.historyDateTitle}><time dateTime={date}>{formatAttendanceDate(date)}</time></h2></div>
                <div className={styles.tableWrapper}>
                  <table className={styles.attendanceTable}>
                    <thead><tr><th scope="col">Employee</th><th scope="col">Check in (IST)</th><th scope="col">Check out (IST)</th><th scope="col">Hours</th>{isAdmin && <th scope="col">Actions</th>}</tr></thead>
                    <tbody>{records.map((record, index) => (
                      <tr key={`${record.empID}-${date}-${index}`}>
                        <td className={styles.nameCell}>
                          <Link href={`/employee/attendance?empID=${encodeURIComponent(record.empID)}`} className={styles.historyEmployee}>{record.name || record.empID}</Link>
                          <span className={styles.historyEmployeeId}>{record.empID}</span>
                        </td>
                        <td className={styles.timeCell}>{formatTime(record.checkIn)}</td>
                        <td className={styles.timeCell}>{record.checkOut ? formatTime(record.checkOut) : <span className={styles.missingBadge}>Missing</span>}</td>
                        <td className={styles.hoursCell}>{formatAttendanceHours(record.hoursWorked)}</td>
                        {isAdmin && <td><AttendanceTimeEditor empID={record.empID} day={record} onSaved={() => { setRefresh(value => value + 1); toast.success("Attendance times updated"); }} /></td>}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
