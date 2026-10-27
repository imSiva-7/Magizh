"use client";
import { formatDateTimeForDisplay } from "@/lib/india-date.mjs";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "react-toastify";
import { moneyCents, paymentBalance } from "@/lib/customer-payments.mjs";
import styles from "@/css/customer-payment.module.css";

const money = value => `₹${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;
const balanceText = value => value < 0 ? `${money(-value)} credit` : `${money(value)} due`;

export default function CustomerPaymentDialog({ isOpen, customerId, customerName, currentPaid, currentDue, onClose, onSuccess, returnFocusRef, initialView = "payment" }) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState("payment");
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [error, setError] = useState("");
  const attempt = useRef(null);
  const busy = useRef(false);
  const dialogRef = useRef(null);
  const historyDialogRef = useRef(null);
  const amountRef = useRef(null);
  const historyRequest = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const launcher = returnFocusRef?.current || document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    amountRef.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (launcher?.isConnected) launcher.focus({ preventScroll: true });
    };
  }, [isOpen, returnFocusRef]);

  useEffect(() => {
    if (!historyOpen || !historyDialogRef.current) return;
    const dialog = historyDialogRef.current;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, [historyOpen]);

  useEffect(() => {
    if (isOpen) {
      setAmount(""); setKind("payment"); setMethod("Cash"); setReference(""); setNote(""); setError(""); setHistory(null); setHistoryError(""); setHistoryLoading(false); setHistoryOpen(initialView === "history"); attempt.current = null;
    }
    return () => { historyRequest.current?.abort(); historyRequest.current = null; };
  }, [isOpen, customerId, initialView]);

  useEffect(() => {
    if (!historyOpen || !customerId) return;
    const controller = new AbortController();
    historyRequest.current = controller;
    setHistoryLoading(true);
    setHistoryError("");
    fetch(`/api/customer/ledger?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Payment history could not be loaded.");
        const data = await response.json();
        if (!controller.signal.aborted) setHistory(data.payments || []);
      })
      .catch(error => { if (!controller.signal.aborted) setHistoryError(error.message); })
      .finally(() => {
        if (historyRequest.current === controller) { setHistoryLoading(false); historyRequest.current = null; }
      });
    return () => { controller.abort(); if (historyRequest.current === controller) historyRequest.current = null; };
  }, [historyOpen, customerId]);

  if (!isOpen) return null;
  let preview = null;
  try { if (amount && moneyCents(amount) !== 0) preview = paymentBalance(Number(currentPaid) + Number(currentDue), currentPaid, amount); } catch { /* Inline validation happens on submit. */ }

  const submit = async event => {
    event.preventDefault();
    if (busy.current) return;
    setError("");
    try {
      if (kind === "correction" && !isAdmin) throw new Error("Only an admin can correct payments.");
      const cents = moneyCents(amount);
      if (!cents || (kind === "payment" && cents < 0)) throw new Error("Enter a positive payment amount.");
      if (kind === "correction" && !note.trim()) throw new Error("Enter a reason for the correction.");
      paymentBalance(Number(currentPaid) + Number(currentDue), currentPaid, amount);
    } catch (error) { setError(error.message); return; }
    const details = { paidAmount: amount, kind, method, reference: reference.trim(), note: note.trim() };
    const fingerprint = JSON.stringify(details);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, paymentId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` };
    busy.current = true; setSubmitting(true);
    try {
      const response = await fetch(`/api/customer/total_orders?customerId=${customerId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...details, paymentId: attempt.current.paymentId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Payment could not be recorded.");
      // Apply the server balance immediately, even if refreshing the full list fails.
      onSuccess?.(result);
      toast.success(result.message || "Payment recorded");
      onClose();
    } catch (error) { setError(`${error.message} You can retry the same payment safely.`); }
    finally { busy.current = false; setSubmitting(false); }
  };

  return <><dialog ref={dialogRef} className={`${styles.modal_content_large} ${styles.payment_dialog}`} aria-labelledby="customer-payment-title" onCancel={event => { event.preventDefault(); if (!busy.current) onClose(); }} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')].filter(element => element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
      <div className={styles.modal_header}><h3 id="customer-payment-title" title={customerName}>Record payment — {customerName}</h3><button data-button="icon" type="button" className={styles.close_btn} onClick={onClose} disabled={submitting} aria-label="Close payment dialog">✕</button></div>
      <p>Record the amount received, including partial payments. Extra payments stay as customer credit.</p>
      <div className={styles.payment_info}><p>Total received: <strong className={styles.received_number}>{money(currentPaid)}</strong></p><p>Current balance: <strong className={currentDue < 0 ? styles.credit_number : styles.due_number}>{balanceText(currentDue)}</strong></p></div>
      <form onSubmit={submit} className={styles.payment_form}>
        <label>Entry type<select value={kind} onChange={event => setKind(event.target.value)} disabled={submitting}><option value="payment">Payment received</option>{isAdmin && <option value="correction">Payment correction</option>}</select></label>
        <label>{kind === "payment" ? "Amount received (₹)" : "Correction amount (₹)"}<input ref={amountRef} className={styles.amount_input} type="number" step="0.01" inputMode="decimal" min={kind === "payment" ? "0.01" : undefined} placeholder={kind === "payment" ? "Enter amount (e.g. 500)" : "e.g. -100 or 50"} value={amount} onChange={event => setAmount(event.target.value)} disabled={submitting} required /></label>
        {kind === "correction" && <p>Use a negative amount to reverse a receipt, or a positive amount to correct an under-recorded receipt. The reason is saved in payment history.</p>}
        <label>Payment method<select value={method} onChange={event => setMethod(event.target.value)} disabled={submitting}>{["Cash", "UPI", "Bank transfer", "Cheque", "Other"].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Reference (optional)<input value={reference} maxLength={100} onChange={event => setReference(event.target.value)} disabled={submitting} placeholder="UPI or bank reference" /></label>
        <label>{kind === "correction" ? "Correction reason" : "Note (optional)"}<input value={note} maxLength={500} onChange={event => setNote(event.target.value)} disabled={submitting} required={kind === "correction"} /></label>
        {preview && <p className={styles.balance_preview} role="status">Balance after this entry: <strong>{balanceText(preview.dueAmount)}</strong></p>}
        {error && <p role="alert" className={styles.text_red}>{error}</p>}
        <div className={styles.modal_actions}><button data-button="primary" type="submit" disabled={submitting}>{submitting ? "Saving…" : kind === "payment" ? "Save payment" : "Save correction"}</button><button data-button="secondary" type="button" className={styles.ledger_btn} onClick={() => setHistoryOpen(true)} disabled={historyLoading || submitting}>View payment history</button><button data-button="secondary" type="button" onClick={onClose} disabled={submitting}>Cancel</button></div>
      </form>
      {historyError && <p role="alert">{historyError}</p>}
  </dialog>
    {historyOpen && <dialog ref={historyDialogRef} className={`${styles.modal_content_large} ${styles.history_dialog}`} aria-labelledby="payment-history-title" onCancel={event => { event.preventDefault(); setHistoryOpen(false); }} onClick={event => { if (event.target === event.currentTarget) setHistoryOpen(false); }}>
      <div className={styles.modal_header}><div><h3 id="payment-history-title">Payment history</h3><p className={styles.history_customer}>{customerName}</p></div><button data-button="icon" type="button" className={styles.close_btn} onClick={() => setHistoryOpen(false)} aria-label="Close payment history">✕</button></div>
      {!historyLoading && !historyError && <div className={styles.history_summary}>
        <div><span>Payment entries</span><strong>{history?.length ?? "—"}</strong></div>
        <div><span>Total received</span><strong className={styles.received_number}>{money(currentPaid)}</strong></div>
        <div><span>Current balance</span><strong className={currentDue < 0 ? styles.credit_number : styles.due_number}>{balanceText(currentDue)}</strong></div>
      </div>}
      {historyLoading ? <p className={styles.history_state} role="status">Loading payment history…</p> : historyError ? <p className={styles.history_state} role="alert">{historyError}</p> : history?.length ? <div className={styles.ledger_table_wrapper}><table className={styles.ledger_table}><caption className={styles.history_caption}>Payment history for {customerName}</caption><thead><tr><th>Date</th><th>Amount</th><th>Received total</th><th>Balance after entry</th><th>Details</th></tr></thead><tbody>{history.map((entry, index) => <tr key={entry.paymentId || index}><td>{formatDateTimeForDisplay(entry.date)}</td><td className={entry.amount < 0 ? styles.ledger_negative : styles.ledger_positive}>{money(entry.amount)}{entry.kind === "correction" && " · Adjustment"}</td><td>{money(entry.newBalance)}</td><td className={entry.newDue < 0 ? styles.ledger_positive : ""}>{entry.newDue == null ? "—" : balanceText(entry.newDue)}</td><td>{[entry.method, entry.reference, entry.note].filter(Boolean).join(" · ") || "Legacy payment"}</td></tr>)}</tbody></table></div> : !historyLoading && !historyError && <p className={styles.history_state}>No payments recorded yet.</p>}
      <div className={styles.modal_actions}><button data-button="secondary" type="button" onClick={() => setHistoryOpen(false)}>Close</button></div>
    </dialog>}
  </>;
}
