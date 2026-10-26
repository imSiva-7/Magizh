"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatAttendanceMonth } from "@/utils/attendanceDates.mjs";
import styles from "./Leaderboard.module.css";

export function useEmployeeRankings(month, refresh = 0, enabled = true) {
  const { data: session } = useSession();
  enabled = enabled && session?.user?.role === "admin";
  const [state, setState] = useState({ month: null, rankings: [], loading: true, error: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!month || !enabled) return;
    const controller = new AbortController();
    setState({ month, rankings: [], loading: true, error: "" });
    async function load() {
      try {
        const response = await fetch(`/api/attendance/rankings?month=${encodeURIComponent(month)}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok || data.month !== month || !Array.isArray(data.rankings)) throw new Error("Hours ranking unavailable");
        if (!controller.signal.aborted) setState({ month, rankings: data.rankings, loading: false, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) setState({ month, rankings: [], loading: false, error: error.message });
      }
    }
    load();
    return () => controller.abort();
  }, [month, refresh, enabled, retry]);
  const byEmployee = useMemo(() => new Map(state.rankings.map(row => [String(row.empID), row])), [state.rankings]);
  const current = enabled && state.month === month;
  return { rankings: current ? state.rankings : [], loading: Boolean(enabled && month && (!current || state.loading)), error: current ? state.error : "", byEmployee: current ? byEmployee : new Map(), retry: () => setRetry(value => value + 1) };
}

export function EmployeeRankBadge({ ranking, month }) {
  if (!ranking) return null;
  const label = ranking.rank === 1 ? (ranking.tied ? "Joint top employee" : "Top employee") : `${ranking.tied ? "Joint " : ""}#${ranking.rank}`;
  const description = `${label} · ${ranking.totalHours.toFixed(2)} hours · ${formatAttendanceMonth(month)}`;
  return <span className={`${styles.badge} ${ranking.rank === 1 ? styles.gold : styles.standard}`} title={description} aria-label={description} data-employee-rank={ranking.rank}>{ranking.rank === 1 && <span aria-hidden="true">★ </span>}{label}</span>;
}

export function EmployeeLeaderboard({ month, state }) {
  if (!month) return null;
  return <section className={styles.board} aria-label="Monthly employee hours ranking">
    <div className={styles.heading}><h2>Top employees</h2><span>{formatAttendanceMonth(month)}</span></div>
    <p className={styles.hint}>Ranked by completed attendance hours. Missing checkouts are excluded. Search and status filters do not change ranks.</p>
    {state.loading ? <p role="status">Loading hours ranking…</p> : state.error ? <p role="alert">{state.error} <button data-button="secondary" type="button" onClick={state.retry}>Retry ranking</button></p> : !state.rankings.length ? <p className={styles.hint}>No completed attendance hours to rank this month.</p> : <ol className={styles.leaders}>
      {state.rankings.filter(row => row.rank <= 3).map(row => <li key={row.empID}>
        <EmployeeRankBadge ranking={row} month={month} />
        <Link href={`/employee/attendance?empID=${encodeURIComponent(row.empID)}&month=${month}`}>{row.name}</Link>
        <strong>{row.totalHours.toFixed(2)} <small>hours</small></strong>
      </li>)}
    </ol>}
  </section>;
}
