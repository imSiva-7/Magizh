"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { toast } from "react-toastify";
import { DELETE_TOAST_CLASS } from "@/lib/delete-toast";
import styles from "./ConfirmDeleteButton.module.css";

const CONFIRM_DELAY_MS = 500;
const DELETE_NOTICE_KEY = "magizh:delete-confirmation-notice";
let deleteNoticeShown = false;

function showDeleteNotice() {
  if (deleteNoticeShown) return;
  deleteNoticeShown = true;

  try {
    if (window.localStorage.getItem(DELETE_NOTICE_KEY)) return;
    window.localStorage.setItem(DELETE_NOTICE_KEY, "1");
  } catch {
    // Keep the notice once per page load if storage is unavailable.
  }

  toast.info("Delete now takes two clicks. Select Confirm to delete, or click outside to cancel.", {
    toastId: DELETE_NOTICE_KEY,
    role: "status",
    autoClose: 6500,
    className: DELETE_TOAST_CLASS,
  });
}

export default function ConfirmDeleteButton({
  confirming,
  onCancel,
  onClick,
  children,
  ...buttonProps
}) {
  const buttonRef = useRef(null);
  const confirmAfter = useRef(0);
  const cancelConfirmation = useEffectEvent(() => onCancel());

  const handleClick = (event) => {
    const now = performance.now();

    if (confirming && now < confirmAfter.current) {
      event.stopPropagation();
      return;
    }

    if (!confirming) {
      confirmAfter.current = now + CONFIRM_DELAY_MS;
      showDeleteNotice();
    }
    onClick(event);
  };

  useEffect(() => {
    if (!confirming) return;

    const handleClickOutside = (event) => {
      if (buttonRef.current && !buttonRef.current.contains(event.target)) {
        cancelConfirmation();
      }
    };

    document.addEventListener("pointerdown", handleClickOutside, true);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside, true);
    };
  }, [confirming]);

  return (
    <button
      type="button"
      {...buttonProps}
      ref={buttonRef}
      onClick={handleClick}
      data-confirming-delete={confirming ? "" : undefined}
    >
      <span className={styles.label}>
        <span aria-hidden="true" className={styles.widthLabel}>Delete</span>
        <span aria-hidden="true" className={styles.widthLabel}>Confirm</span>
        <span>{children ?? (confirming ? "Confirm" : "Delete")}</span>
      </span>
    </button>
  );
}
