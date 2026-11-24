"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IntelligenceIcon, intelligenceRequest, SETUP_TEXT, sourcePeriod } from "./IntelligenceText";
import styles from "./MagizhIntelligence.module.css";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function IntelligenceOverview() {
  const [snapshot, setSnapshot] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [briefError, setBriefError] = useState("");
  const [retries, setRetries] = useState(0);
  const [briefing, setBriefing] = useState("");
  const [generating, setGenerating] = useState(false);
  const activeBrief = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    intelligenceRequest({ overview: true, signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setSnapshot(data);
    }).catch(error => {
      if (!controller.signal.aborted) setLoadError(error.message);
    });
    return () => { controller.abort(); activeBrief.current?.abort(); };
  }, [retries]);

  async function generateBriefing() {
    if (activeBrief.current) return;
    const controller = new AbortController();
    activeBrief.current = controller;
    setGenerating(true);
    setBriefing("");
    setBriefError("");
    try {
      const result = await intelligenceRequest({ body: { action: "briefing" }, signal: controller.signal });
      if (!controller.signal.aborted) {
        setSnapshot({ configured: true, overview: result.overview });
        setBriefing(result.answer);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error.code === "not_configured") setSnapshot(previous => ({ ...previous, configured: false }));
        else setBriefError(error.message);
      }
    } finally {
      if (!controller.signal.aborted) setGenerating(false);
      activeBrief.current = null;
    }
  }

  const data = snapshot?.overview;
  const flagged = data?.stock.products?.filter(product => product.needsAttention).length;
  const incompleteStock = data?.stock.products?.some(product => product.quantity === null);
  return (
    <section className={styles.card} aria-labelledby="intelligence-overview-heading">
      <div className={styles.cardHeader}>
        <span className={styles.iconBadge}><IntelligenceIcon /></span>
        <div>
          <h2 id="intelligence-overview-heading">Magizh Intelligence</h2>
          <p>Month-to-date activity and current stock and balances. Independent of the overview date filter.</p>
        </div>
      </div>
      {loadError ? <div>
        <p role="alert">{loadError}</p>
        <button type="button" data-button="secondary" onClick={() => { setLoadError(""); setRetries(n => n + 1); }}>Try again</button>
      </div> : !data ? <p aria-live="polite">Loading the operational snapshot…</p> : <>
        <dl className={styles.metrics}>
          <div><dt>Sales <span>{sourcePeriod(data.commercial)}</span></dt><dd>{money.format(data.commercial.salesINR)}</dd></div>
          <div><dt>Procurement <span>{sourcePeriod(data.commercial)}</span></dt><dd>{money.format(data.commercial.procurementINR)}</dd></div>
          <div><dt>Current customer due</dt><dd>{money.format(data.customer.currentCustomerDueINR)}</dd></div>
          <div><dt>Stock alerts <span>{sourcePeriod(data.stock)}</span></dt><dd>{incompleteStock || flagged === undefined ? "Incomplete" : flagged}</dd></div>
        </dl>
        <div className={styles.tasks}>
          <h3>Suggested next steps</h3>
          {data.tasks.length ? <ul>{data.tasks.map(task => <li key={task.label}><Link href={task.href}>{task.label}</Link></li>)}</ul>
            : <p>No follow-ups flagged in this snapshot.</p>}
        </div>
        <div className={styles.briefing} aria-live="polite">
          {!snapshot.configured ? <p>{SETUP_TEXT} The figures and suggested tasks above come directly from your records.</p>
            : <button type="button" data-button="primary" onClick={generateBriefing} disabled={generating}>
              {generating ? "Generating briefing…" : briefing ? "Regenerate AI briefing" : "Generate AI briefing"}
            </button>}
          {briefError && <p role="alert">{briefError}</p>}
          {briefing && <div className={styles.briefText}><h3>AI briefing</h3><p className={styles.plainAnswer}>{briefing}</p><small>Verify AI advice against your records before acting.</small></div>}
        </div>
      </>}
    </section>
  );
}
