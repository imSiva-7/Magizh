"use client";

import { useState, useEffect, useMemo } from "react";
import { attendanceToday, formatAttendanceDate } from "@/utils/attendanceDates.mjs";
import Link from "next/link";
import PageHeading from "@/components/PageHeading";
import styles from "@/css/attendance.module.css";

const getCurrentMonth = () => attendanceToday().slice(0, 7);
const formatTime = (time) => {
  if (!time) return "—";
  const [hour, minute] = time.split(":");
  const hours = Number(hour);
  return `${hours % 12 || 12}:${minute} ${hours >= 12 ? "PM" : "AM"}`;
};

export default function AttendanceHistoryPage() {
  const [month, setMonth] = useState(getCurrentMonth);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [status, setStatus] = useState("all");
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState({ records: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      <div className={styles.headerContent}>
        <PageHeading title="Attendance History" section="YOUR TEAM" description="Daily check-in, check-out, and hours worked. Times in IST." />
        <Link data-button="secondary" href="/employee/attendance" className={styles.secondaryButton}>Employee details</Link>
      </div>

      <div data-filter="card" className={styles.historyControls}>
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
      </div>

      {loading ? (
        <div className={styles.loadingContainer} role="status"><div className={styles.spinner} aria-hidden="true" /><p>Loading attendance…</p></div>
      ) : error ? (
        <div className={styles.emptyState} role="alert"><p>{error}</p><button data-button="secondary" type="button" onClick={() => setRefresh((value) => value + 1)} className={styles.primaryButton}>Try again</button></div>
      ) : !data.records.length ? (
        <div className={styles.emptyState}><p>{!month ? "Choose a month to view attendance." : searchDebounced ? `No attendance found for “${searchDebounced}”.` : "No attendance found for these filters."}</p></div>
      ) : (
        <>
          {data.summary && <div className={styles.historyOverview} aria-label="Attendance summary">
            <span><strong>{data.summary.uniqueEmployees}</strong> employees</span>
            <span><strong>{Number(data.summary.totalHours || 0).toFixed(2)}h</strong> worked</span>
            {data.summary.incompleteCount > 0 && <span className={styles.historyAttention}><strong>{data.summary.incompleteCount}</strong> missing checkout</span>}
          </div>}
          <div className={styles.historyGroups}>
            {groups.map(([date, records]) => (
              <section key={date} className={styles.historyGroup} aria-label={formatAttendanceDate(date)}>
                <div className={styles.historyGroupHeader}><h2 className={styles.historyDateTitle}><time dateTime={date}>{formatAttendanceDate(date)}</time></h2></div>
                <div className={styles.tableWrapper}>
                  <table className={styles.attendanceTable}>
                    <thead><tr><th scope="col">Employee</th><th scope="col">Check in (IST)</th><th scope="col">Check out (IST)</th><th scope="col">Hours</th></tr></thead>
                    <tbody>{records.map((record, index) => (
                      <tr key={`${record.empID}-${date}-${index}`}>
                        <td className={styles.nameCell}>
                          <Link href={`/employee/attendance?empID=${encodeURIComponent(record.empID)}`} className={styles.historyEmployee}>{record.name || record.empID}</Link>
                          <span className={styles.historyEmployeeId}>{record.empID}</span>
                        </td>
                        <td className={styles.timeCell}>{formatTime(record.checkIn)}</td>
                        <td className={styles.timeCell}>{record.checkOut ? formatTime(record.checkOut) : <span className={styles.missingBadge}>Missing</span>}</td>
                        <td className={styles.hoursCell}>{Number(record.hoursWorked || 0).toFixed(2)}h</td>
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
