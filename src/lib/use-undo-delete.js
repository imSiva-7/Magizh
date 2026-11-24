import { createElement, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { DELETE_TOAST_CLASS } from "./delete-toast";

export const DELETE_UNDO_MS = 5000;

export function useUndoDelete() {
  const jobs = useRef(new Map());
  const [pendingIds, setPendingIds] = useState(() => new Set());

  useEffect(() => {
    const active = jobs.current;
    return () => {
      for (const { timer, toastId } of active.values()) {
        clearTimeout(timer);
        toast.dismiss(toastId);
      }
      active.clear();
    };
  }, []);

  function scheduleDelete(id, label, commit) {
    if (jobs.current.has(id)) return;
    const updatePending = () => setPendingIds(new Set(jobs.current.keys()));
    const job = {};
    const undo = () => {
      if (jobs.current.get(id) !== job || job.started) return;
      clearTimeout(job.timer);
      toast.dismiss(job.toastId);
      jobs.current.delete(id);
      updatePending();
    };

    job.toastId = toast(
      createElement("div", null,
        `${label} will be deleted in 5 seconds. `,
        createElement("button", { type: "button", "data-button": "secondary", onClick: undo }, "Undo"),
      ),
      { className: DELETE_TOAST_CLASS, autoClose: false, closeOnClick: false, closeButton: false, draggable: false },
    );
    job.timer = setTimeout(async () => {
      job.started = true;
      toast.dismiss(job.toastId);
      try {
        await commit();
      } finally {
        if (jobs.current.get(id) === job) {
          jobs.current.delete(id);
          updatePending();
        }
      }
    }, DELETE_UNDO_MS);
    jobs.current.set(id, job);
    updatePending();
  }

  return { pendingIds, scheduleDelete };
}
