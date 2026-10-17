"use client";
import { formatDateTimeForDisplay } from "@/lib/india-date.mjs";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "react-toastify";
import { moneyCents, paymentBalance } from "@/lib/customer-payments.mjs";
import styles from "@/css/customer-payment.module.css";

const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const balanceText = value => value < 0 ? `${money(-value)} credit` : `${money(value)} due`;

export default function CustomerPaymentDialog({ isOpen, customerId, customerName, currentPaid, currentDue, onClose, onSuccess, returnFocusRef }) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState("payment");
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [error, setError] = useState("");
  const attempt = useRef(null);
  const busy = useRef(false);
  const dialogRef = useRef(null);
  const amountRef = useRef(null);

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
    if (isOpen) {
      setAmount(""); setKind("payment"); setMethod("Cash"); setReference(""); setNote(""); setError(""); setHistory(null); setHistoryError(""); attempt.current = null;
    }
  }, [isOpen, customerId]);

  if (!isOpen) return null;
  let preview = null;
  try { if (amount && moneyCents(amount) !== 0) preview = paymentBalance(Number(currentPaid) + Number(currentDue), currentPaid, amount); } catch { /* Inline validation happens on submit. */ }

  const loadHistory = async () => {
    setHistoryLoading(true); setHistoryError("");
    try {
      const response = await fetch(`/api/customer/ledger?customerId=${customerId}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Payment history could not be loaded.");
      const data = await response.json();
      setHistory(data.payments || []);
    } catch (error) { setHistoryError(error.message); }
    finally { setHistoryLoading(false); }
  };

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

  return <dialog ref={dialogRef} className={`${styles.modal_content_large} ${styles.payment_dialog}`} aria-labelledby="customer-payment-title" onCancel={event => { event.preventDefault(); if (!busy.current) onClose(); }} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')].filter(element => element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
      <div className={styles.modal_header}><h3 id="customer-payment-title" title={customerName}>Record payment — {customerName}</h3><button data-button="icon" type="button" className={styles.close_btn} onClick={onClose} disabled={submitting} aria-label="Close payment dialog">✕</button></div>
      <p>Record the amount received, including partial payments. Extra payments stay as customer credit.</p>
      <div className={styles.payment_info}><p>Total received: <strong>{money(currentPaid)}</strong></p><p>Current balance: <strong>{balanceText(currentDue)}</strong></p></div>
      <form onSubmit={submit} className={styles.payment_form}>
        <label>Entry type<select value={kind} onChange={event => setKind(event.target.value)} disabled={submitting}><option value="payment">Payment received</option>{isAdmin && <option value="correction">Payment correction</option>}</select></label>
        <label>{kind === "payment" ? "Amount received (₹)" : "Correction amount (₹)"}<input ref={amountRef} type="number" step="0.01" inputMode="decimal" min={kind === "payment" ? "0.01" : undefined} value={amount} onChange={event => setAmount(event.target.value)} disabled={submitting} required /></label>
        {kind === "correction" && <p>Use a negative amount to reverse a receipt, or a positive amount to correct an under-recorded receipt. The reason is saved in payment history.</p>}
        <label>Payment method<select value={method} onChange={event => setMethod(event.target.value)} disabled={submitting}>{["Cash", "UPI", "Bank transfer", "Cheque", "Other"].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Reference (optional)<input value={reference} maxLength={100} onChange={event => setReference(event.target.value)} disabled={submitting} placeholder="UPI or bank reference" /></label>
        <label>{kind === "correction" ? "Correction reason" : "Note (optional)"}<input value={note} maxLength={500} onChange={event => setNote(event.target.value)} disabled={submitting} required={kind === "correction"} /></label>
        {preview && <p className={styles.balance_preview} role="status">Balance after this entry: <strong>{balanceText(preview.dueAmount)}</strong></p>}
        {error && <p role="alert" className={styles.text_red}>{error}</p>}
        <div className={styles.modal_actions}><button data-button="primary" type="submit" disabled={submitting}>{submitting ? "Saving…" : kind === "payment" ? "Save payment" : "Save correction"}</button><button data-button="secondary" type="button" className={styles.ledger_btn} onClick={loadHistory} disabled={historyLoading || submitting}>{historyLoading ? "Loading history…" : "View payment history"}</button><button data-button="secondary" type="button" onClick={onClose} disabled={submitting}>Cancel</button></div>
      </form>
      {historyError && <p role="alert">{historyError}</p>}
      {history !== null && <div className={styles.ledger_table_wrapper}><h4>Payment history</h4>{history.length ? <table className={styles.ledger_table}><caption>Receipts and corrections for {customerName}</caption><thead><tr><th>Date</th><th>Amount</th><th>Received total</th><th>Balance after entry</th><th>Details</th></tr></thead><tbody>{history.map((entry, index) => <tr key={entry.paymentId || index}><td>{formatDateTimeForDisplay(entry.date)}</td><td>{money(entry.amount)}{entry.kind === "correction" && " (correction)"}</td><td>{money(entry.newBalance)}</td><td>{entry.newDue == null ? "—" : balanceText(entry.newDue)}</td><td>{[entry.method, entry.reference, entry.note].filter(Boolean).join(" · ") || "Legacy payment"}</td></tr>)}</tbody></table> : <p>No payments recorded yet.</p>}</div>}
  </dialog>;
}
