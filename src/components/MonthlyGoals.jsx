"use client";

import { useEffect, useState } from "react";
import { formatDateForDisplay } from "@/lib/india-date.mjs";
import { goalProgress, validateGoalTargets } from "@/lib/monthly-goals.mjs";
import styles from "./MonthlyGoals.module.css";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

function GoalCard({ name, actual, target }) {
  const progress = goalProgress(actual, target);
  return (
    <article aria-label={`${name} goal`} className={styles.metric}>
      <div className={styles.metricTop}>
        <h3>{name}</h3>
        {progress && <span className={`${styles.percent} ${progress.reached ? styles.reached : ""}`}>{progress.percent}%</span>}
      </div>
      <strong className={styles.amount} data-stat-tone={actual < 0 ? "negative" : undefined}>{currency.format(actual)}</strong>
      {progress ? (
        <>
          <p className={styles.target}>Target: <strong>{currency.format(target)}</strong></p>
          <progress className={styles.progress} max={100} value={progress.progress} aria-label={`${name} goal progress`} aria-valuetext={`${progress.percent}% of target`} />
          <p className={styles.remaining}>{progress.reached ? "Goal reached!" : `${currency.format(progress.remaining)} to go`}</p>
        </>
      ) : (
        <p className={styles.target}>No target set yet</p>
      )}
    </article>
  );
}

export default function MonthlyGoals() {
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch("/api/overview/goals", { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data?.targets || !data?.actual || !data?.month || !data?.throughDate) {
          throw new Error(data?.error || "Could not load monthly goals.");
        }
        if (!controller.signal.aborted) setModel(data);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error.message || "Could not load monthly goals.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [reload]);

  function beginEdit() {
    setDraft({ sales: model.targets.sales ?? "", profit: model.targets.profit ?? "" });
    setSaveError("");
    setNotice("");
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaveError("");
    let targets;
    try {
      targets = validateGoalTargets({
        sales: draft.sales === "" ? null : Number(draft.sales),
        profit: draft.profit === "" ? null : Number(draft.profit),
      });
    } catch (error) {
      setSaveError(error.message);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/overview/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: model.month, targets }),
      });
      const data = await response.json();
      if (response.status === 409) {
        setDraft(null);
        setNotice(data.error);
        setReload(value => value + 1);
        return;
      }
      if (!response.ok || !data.targets) throw new Error(data.error || "Could not save monthly goals.");
      setModel(previous => ({ ...previous, targets: data.targets }));
      setDraft(null);
      setNotice("Monthly goals saved.");
    } catch (error) {
      setSaveError(error.message || "Could not save monthly goals.");
    } finally {
      setSaving(false);
    }
  }

  const hasTargets = model && Object.values(model.targets).some(target => target !== null);

  return (
    <section className={styles.panel} aria-labelledby="monthly-goals-title" aria-busy={loading}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>MONTH TO DATE</span>
          <h2 id="monthly-goals-title">Monthly goals</h2>
          {model && <p className={styles.subtitle}>{monthName.format(new Date(`${model.month}-01T00:00:00Z`))} · Through {formatDateForDisplay(model.throughDate)}</p>}
        </div>
        {model && !draft && !loading && !loadError && (
          <button type="button" data-button={hasTargets ? "secondary" : "primary"} onClick={beginEdit}>{hasTargets ? "Edit goals" : "Set goals"}</button>
        )}
      </div>

      {notice && <p className={styles.notice} aria-live="polite">{notice}</p>}
      {loading ? <p className={styles.message} aria-live="polite">Loading monthly goals…</p> : loadError ? (
        <div className={styles.errorState}>
          <p role="alert">{loadError}</p>
          <button type="button" data-button="secondary" onClick={() => setReload(value => value + 1)}>Retry goals</button>
        </div>
      ) : model && (
        <>
          {draft && (
            <form className={styles.form} onSubmit={save}>
              <p className={styles.formHint}>Leave blank to clear a target.</p>
              <div className={styles.formGrid}>
                <label>Monthly sales goal (₹)
                  <input type="number" min="0.01" step="0.01" inputMode="decimal" autoFocus value={draft.sales} disabled={saving} onChange={event => setDraft(previous => ({ ...previous, sales: event.target.value }))} placeholder="500000" />
                </label>
                <label>Monthly profit goal (₹)
                  <input type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.profit} disabled={saving} onChange={event => setDraft(previous => ({ ...previous, profit: event.target.value }))} placeholder="150000" />
                </label>
              </div>
              {saveError && <p className={styles.error} role="alert">{saveError}</p>}
              <div className={styles.actions}>
                <button type="button" data-button="secondary" disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
                <button type="submit" data-button="primary" disabled={saving}>{saving ? "Saving…" : "Save goals"}</button>
              </div>
            </form>
          )}
          <div className={styles.grid}>
            <GoalCard name="Sales" actual={model.actual.sales} target={model.targets.sales} />
            <GoalCard name="Profit" actual={model.actual.profit} target={model.targets.profit} />
          </div>
          <div className={styles.footer}>
            <p>Monthly procurement: <strong>{currency.format(model.actual.procurement)}</strong></p>
          </div>
        </>
      )}
    </section>
  );
}
