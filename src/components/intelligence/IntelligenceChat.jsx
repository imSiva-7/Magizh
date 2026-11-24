"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { ADMIN_QUESTIONS, HISTORY_LIMIT, INTELLIGENCE_ROLES, QUESTION_LIMIT, WORKSPACE_QUESTIONS } from "@/lib/magizh-intelligence";
import { IntelligenceIcon, intelligenceRequest, SETUP_TEXT, sourcePeriod } from "./IntelligenceText";
import styles from "./MagizhIntelligence.module.css";

function Chat({ role }) {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(null);
  const [connectionError, setConnectionError] = useState("");
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState([]);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const launcher = useRef(null);
  const dialog = useRef(null);
  const closeButton = useRef(null);
  const log = useRef(null);
  const activeRequest = useRef(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    const panel = dialog.current;
    const trigger = launcher.current;
    panel.showModal();
    closeButton.current?.focus();
    return () => { panel.close(); if (trigger?.isConnected) trigger.focus(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    intelligenceRequest({ signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setConfigured(data.configured);
    }).catch(error => {
      if (!controller.signal.aborted) setConnectionError(error.message);
    });
    return () => controller.abort();
  }, [open, retry]);

  useEffect(() => {
    if (open && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [open, turns, pending, error]);

  async function send(value) {
    const question = value.trim();
    if (!configured || activeRequest.current || !question || question.length > QUESTION_LIMIT) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setDraft("");
    setError("");
    setPending(question);
    try {
      const result = await intelligenceRequest({
        body: { action: "chat", question, history: turns.slice(-HISTORY_LIMIT).map(turn => turn.question) },
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setTurns(previous => [...previous, { question, ...result }]);
    } catch (error) {
      if (!controller.signal.aborted) {
        setDraft(question);
        if (error.code === "not_configured") setConfigured(false);
        else setError(error.message);
      }
    } finally {
      if (!controller.signal.aborted) setPending("");
      activeRequest.current = null;
    }
  }

  const suggestions = role === "admin" ? [...WORKSPACE_QUESTIONS, ...ADMIN_QUESTIONS] : WORKSPACE_QUESTIONS;
  return <>
    <button ref={launcher} type="button" data-button="primary" className={styles.launcher} aria-haspopup="dialog" aria-label="Open Magizh Intelligence" onClick={() => { setConnectionError(""); setOpen(true); }}>
      <IntelligenceIcon /> <span>Ask Magizh</span>
    </button>
    {open && <dialog ref={dialog} className={styles.dialog} aria-labelledby="intelligence-chat-title" onCancel={event => { event.preventDefault(); setOpen(false); }}>
      <div className={styles.chatHeader}>
        <span className={styles.iconBadge}><IntelligenceIcon /></span>
        <div><h2 id="intelligence-chat-title">Magizh Intelligence</h2><p>Read-only · Verify AI advice before acting</p></div>
        <button ref={closeButton} type="button" data-button="icon" aria-label="Close Magizh Intelligence" onClick={() => setOpen(false)}>×</button>
      </div>
      <div className={styles.log} ref={log} role="log" aria-label="Conversation" tabIndex={0}>
        <p>Ask about stock or production{role === "admin" ? ", or get a summary of sales, procurement, and customer balances" : ""}. The AI provider receives your questions and permitted totals. Don’t include personal or sensitive details.</p>
        {connectionError ? <div><p role="alert">{connectionError}</p><button type="button" data-button="secondary" onClick={() => { setConfigured(null); setConnectionError(""); setRetry(n => n + 1); }}>Try again</button></div>
          : configured === null ? <p>Checking AI setup…</p>
            : !configured ? <p className={styles.notice}>{SETUP_TEXT}</p>
              : !turns.length && !pending && <div className={styles.suggestions}>
                {suggestions.map(question => <button type="button" key={question} data-button="secondary" onClick={() => send(question)}>{question}</button>)}
              </div>}
        {turns.map(({ question, answer, sources }, index) => <div className={styles.turn} key={index}>
          <p className={styles.question}><strong>You</strong> {question}</p>
          <div className={styles.answer}>
            <strong>Magizh</strong><p className={styles.plainAnswer}>{answer}</p>
            {sources.length > 0 && <small>Sources: {sources.map(source => `${source.label} (${sourcePeriod(source)})`).join("; ")}</small>}
          </div>
        </div>)}
        {pending && <div className={styles.turn}><p className={styles.question}><strong>You</strong> {pending}</p><p>Checking the available records…</p></div>}
        {error && <p className={styles.notice} role="alert">{error}</p>}
      </div>
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); send(draft); }}>
        <label className={styles.srOnly} htmlFor="intelligence-question">Your question</label>
        <input id="intelligence-question" type="text" value={draft} onChange={event => setDraft(event.target.value)} maxLength={QUESTION_LIMIT} disabled={!configured || Boolean(pending) || Boolean(connectionError)} placeholder="Ask a question…" autoComplete="off" />
        <button type="submit" data-button="primary" disabled={!configured || !draft.trim() || Boolean(pending) || Boolean(connectionError)}>Send</button>
      </form>
    </dialog>}
  </>;
}

export default function IntelligenceChat() {
  const pathname = usePathname();
  const { status, data } = useSession();
  const user = data?.user;
  if (status !== "authenticated" || !INTELLIGENCE_ROLES.includes(user?.role) || ["/login", "/register", "/unauthorized"].includes(pathname)) return null;
  return <Chat key={`${user.id ?? user.email}:${user.role}`} role={user.role} />;
}
