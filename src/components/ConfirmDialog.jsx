"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./ConfirmDialog.module.css";

export default function ConfirmDialog({ title, children, onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try { await onConfirm(); }
    finally { busyRef.current = false; setBusy(false); }
  };

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); if (!busyRef.current) onCancel(); }}>
      <div className={styles.body}>
        <span className={styles.icon} aria-hidden="true">!</span>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{children}</p>
      </div>
      <div className={styles.actions}>
        <button ref={cancelRef} type="button" data-button="secondary" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" data-button="danger" disabled={busy} onClick={confirm}>{busy ? "Deleting…" : "Delete"}</button>
      </div>
    </dialog>
  );
}
