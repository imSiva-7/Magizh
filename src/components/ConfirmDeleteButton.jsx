"use client";

import { useEffect, useRef } from "react";
import styles from "./ConfirmDeleteButton.module.css";

export default function ConfirmDeleteButton({
  confirming,
  onCancel,
  children,
  ...buttonProps
}) {
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!confirming) return;

    const handleClickOutside = (event) => {
      if (buttonRef.current && !buttonRef.current.contains(event.target)) {
        onCancel();
      }
    };

    document.addEventListener("pointerdown", handleClickOutside, true);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside, true);
    };
  }, [confirming, onCancel]);

  return (
    <button type="button" {...buttonProps} ref={buttonRef}>
      <span className={styles.label}>
        <span aria-hidden="true" className={styles.widthLabel}>Delete</span>
        <span aria-hidden="true" className={styles.widthLabel}>Confirm</span>
        <span>{children ?? (confirming ? "Confirm" : "Delete")}</span>
      </span>
    </button>
  );
}
