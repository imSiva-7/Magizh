"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import RowActionPopup from "./RowActionPopup";
import styles from "./AttendanceTimeEditor.module.css";

function TimePicker({ label, value, onChange, disabled }) {
  const [hours = "09", minutes = "00"] = (value || "09:00:00").split(":");
  const hour = Number(hours), period = hour >= 12 ? "PM" : "AM";
  const change = (part, selected) => {
    const h = part === "hour" ? Number(selected) : (hour % 12 || 12);
    const m = part === "minute" ? selected : minutes;
    const meridiem = part === "period" ? selected : period;
    onChange(String(h % 12 + (meridiem === "PM" ? 12 : 0)).padStart(2, "0") + ":" + m + ":00");
  };
  return <fieldset className={styles.picker} disabled={disabled}>
    <legend>{label}</legend>
    <div className={styles.timeColumns}>
      <label>Hour<select aria-label={label + " hour"} value={hour % 12 || 12} onChange={e => change("hour", e.target.value)}>{Array.from({length:12}, (_, i) => <option key={i+1} value={i+1}>{String(i+1).padStart(2,"0")}</option>)}</select></label>
      <label>Minute<select aria-label={label + " minute"} value={minutes} onChange={e => change("minute", e.target.value)}>{Array.from({length:60}, (_, i) => <option key={i} value={String(i).padStart(2,"0")}>{String(i).padStart(2,"0")}</option>)}</select></label>
      <label>AM / PM<select aria-label={label + " AM or PM"} value={period} onChange={e => change("period", e.target.value)}><option>AM</option><option>PM</option></select></label>
    </div>
  </fieldset>;
}

export default function AttendanceTimeEditor({ empID, day, onSaved }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const dialogRef = useRef(null), triggerRef = useRef(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current, trigger = triggerRef.current;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      trigger?.focus({ preventScroll: true });
    };
  }, [open]);
  async function save(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try {
      const response = await fetch("/api/attendance/times", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empID, date: day.date, checkIn, checkOut, expectedCheckIn: day.checkIn || "", expectedCheckOut: day.checkOut || "" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save attendance");
      setOpen(false);
      await onSaved();
    } catch (cause) { setError(cause.message); }
    finally { busy.current = false; setSaving(false); }
  }
  return <div className={styles.wrapper}>
    <button ref={triggerRef} type="button" data-button="icon" aria-label={`Attendance actions for ${empID} on ${day.date}`} aria-expanded={menuOpen} aria-haspopup="true" disabled={saving} onClick={() => setMenuOpen(value => !value)}>⋮</button>
    {menuOpen && <RowActionPopup className={styles.menu} onClose={closeMenu}>
      <button type="button" onClick={() => {
        setCheckIn(day.checkIn || "09:00:00"); setCheckOut(day.checkOut || ""); setError(""); setOpen(true);
      }}>Edit times</button>
    </RowActionPopup>}
    {open && <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy.current) setOpen(false); }}>
      <form data-entry-form className={styles.form} onSubmit={save} aria-label={`Edit attendance for ${empID} on ${day.date}`}>
        <div className={styles.heading}><div><h2 id={titleId}>Edit attendance</h2><p>{day.date} · {empID} · IST</p></div><button type="button" data-button="icon" aria-label="Close attendance editor" disabled={saving} onClick={() => setOpen(false)}>×</button></div>
        <TimePicker label="Check in" value={checkIn} disabled={saving} onChange={setCheckIn} />
        <label className={styles.checkbox}><input type="checkbox" checked={Boolean(checkOut)} disabled={saving} onChange={event => setCheckOut(event.target.checked ? (day.checkOut || "18:00:00") : "")} />Check out recorded</label>
        {checkOut && <TimePicker label="Check out" value={checkOut} disabled={saving} onChange={setCheckOut} />}
        <small>Choose times on the same day. Hours and salary update automatically.</small>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}><button data-button="secondary" type="button" disabled={saving} onClick={() => setOpen(false)}>Cancel</button><button data-button="primary" disabled={saving}>{saving ? "Saving…" : "Save times"}</button></div>
      </form>
    </dialog>}
  </div>;
}
