"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { ToastContainer, toast } from "react-toastify";
import Link from "next/link";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/attendance.module.css";

const getCurrentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const formatTime = (time) => {
  if (!time) return "—";
  try {
    const [h, m] = time.split(":");
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${display}:${m} ${ampm}`;
  } catch {
    return time;
  }
};

const formatDateShort = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
};

const formatHours = (h) => (Number(h) || 0).toFixed(2);

function AttendanceHistoryContent() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [data, setData] = useState({ records: [], summary: null });
  const [loading, setLoading] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchHistory = useCallback(async () => {
    if (!month) return;
    if (startDate && endDate && startDate > endDate) {
      toast.error("Start date cannot be after end date");
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("month", month);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (searchDebounced.trim())
        params.append("search", searchDebounced.trim());
      if (statusFilter !== "all") params.append("status", statusFilter);

      const res = await fetch(`/api/attendance/history?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load history");
      }
      const json = await res.json();
      setData({
        records: Array.isArray(json.records) ? json.records : [],
        summary: json.summary || null,
      });
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Failed to load attendance history");
      setData({ records: [], summary: null });
    } finally {
      setLoading(false);
    }
  }, [month, startDate, endDate, searchDebounced, statusFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleClearFilters = () => {
    setMonth(getCurrentMonth());
    setStartDate("");
    setEndDate("");
    setSearch("");
    setStatusFilter("all");
  };

  // Group rows by date so the table reads "who came in on each day"
  const groupedRecords = useMemo(() => {
    const groups = new Map();
    for (const r of data.records) {
      const key = r.date || "unknown";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    // Map iteration order = insertion order, and records came back sorted
    // date desc from the API, so groups are already in the right order.
    return Array.from(groups.entries()).map(([date, rows]) => ({
      date,
      rows,
      totalHours: rows.reduce((s, r) => s + (Number(r.hoursWorked) || 0), 0),
      incomplete: rows.filter((r) => !r.checkOut).length,
    }));
  }, [data.records]);

  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;

  return (
    <div className={styles.container}>
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Header */}
      <div className={styles.headerSection}>
        <div className={styles.headerContent}>
          <h1>Attendance History</h1>
          <Link
            href="/employee/attendance"
            className={styles.secondaryButton}
          >
            ← Individual View
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filterSection}>
        <div className={styles.filterGrid}>
          <div className={styles.inputGroup}>
            <label htmlFor="month">Month *</label>
            <input
              id="month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              max={getCurrentMonth()}
              className={styles.input}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="startDate">From Date</label>
            <input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={styles.input}
              min={monthStart}
              max={monthEnd}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="endDate">To Date</label>
            <input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={styles.input}
              min={startDate || monthStart}
              max={monthEnd}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="search">Search Employee</label>
            <input
              id="search"
              type="text"
              placeholder="Name or employee ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.input}
              autoComplete="off"
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="status">Status</label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={styles.selectInput}
            >
              <option value="all">All records</option>
              <option value="complete">Complete (has checkout)</option>
              <option value="incomplete">Incomplete (no checkout)</option>
            </select>
          </div>
        </div>

        <div className={styles.filterActions}>
          <button
            type="button"
            onClick={handleClearFilters}
            className={styles.secondaryButton}
            disabled={loading}
          >
            Clear Filters
          </button>
          <button
            type="button"
            onClick={fetchHistory}
            className={styles.primaryButton}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Summary */}
      {!loading && data.summary && data.records.length > 0 && (
        <div className={styles.summaryCard}>
          <h2>
            Summary
            <span className={styles.monthBadge}>{month}</span>
          </h2>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Total Records</span>
              <span className={styles.summaryValue}>
                {data.summary.totalRecords}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Employees</span>
              <span className={styles.summaryValue}>
                {data.summary.uniqueEmployees}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Total Hours</span>
              <span className={styles.summaryValue}>
                {data.summary.totalHours}h
              </span>
            </div>
            <div className={`${styles.summaryItem} ${styles.deduction}`}>
              <span className={styles.summaryLabel}>Incomplete Days</span>
              <span className={styles.summaryValue}>
                {data.summary.incompleteCount}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Loading attendance history...</p>
        </div>
      )}

      {/* Grouped table — one block per date */}
      {!loading && groupedRecords.length > 0 && (
        <div className={styles.attendanceSection}>
          <h2>Records ({data.records.length})</h2>

          <div className={styles.historyGroups}>
            {groupedRecords.map((group) => (
              <div key={group.date} className={styles.historyGroup}>
                <div className={styles.historyGroupHeader}>
                  <span className={styles.historyGroupDate}>
                    {formatDateShort(group.date)}
                  </span>
                  <div className={styles.historyGroupStats}>
                    <span className={styles.historyGroupStat}>
                      {group.rows.length} entr
                      {group.rows.length === 1 ? "y" : "ies"}
                    </span>
                    <span className={styles.historyGroupStat}>
                      {group.totalHours.toFixed(2)}h total
                    </span>
                    {group.incomplete > 0 && (
                      <span
                        className={`${styles.historyGroupStat} ${styles.historyGroupStatWarn}`}
                      >
                        {group.incomplete} incomplete
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.tableWrapper}>
                  <table className={styles.attendanceTable}>
                    <thead>
                      <tr>
                        <th>Emp ID</th>
                        <th>Name</th>
                        <th>Check In</th>
                        <th>Check Out</th>
                        <th>Hours</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, idx) => {
                        const isIncomplete = !row.checkOut;
                        return (
                          <tr
                            key={`${row.empID}-${row.date}-${idx}`}
                            className={
                              isIncomplete ? styles.incompleteRow : ""
                            }
                          >
                            <td className={styles.empIdCell}>{row.empID}</td>
                            <td className={styles.nameCell}>{row.name}</td>
                            <td className={styles.timeCell}>
                              {formatTime(row.checkIn)}
                            </td>
                            <td className={styles.timeCell}>
                              {isIncomplete ? (
                                <span className={styles.missingBadge}>
                                  Missing
                                </span>
                              ) : (
                                formatTime(row.checkOut)
                              )}
                            </td>
                            <td className={styles.hoursCell}>
                              {formatHours(row.hoursWorked)}h
                            </td>
                            <td className={styles.statusCell}>
                              {isIncomplete ? (
                                <span className={styles.statusIncomplete}>
                                  Incomplete
                                </span>
                              ) : (
                                <span className={styles.statusComplete}>
                                  Complete
                                </span>
                              )}
                            </td>
                            <td className={styles.actionsCell}>
                              <Link
                                href={`/employee/attendance?empID=${row.empID}`}
                                className={styles.viewLink}
                              >
                                View
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && data.records.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📊</div>
          <p>
            {searchDebounced
              ? `No records match "${searchDebounced}"`
              : "No attendance records found for the selected filters"}
          </p>
        </div>
      )}
    </div>
  );
}

export default function AttendanceHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Loading...</p>
        </div>
      }
    >
      <AttendanceHistoryContent />
    </Suspense>
  );
}