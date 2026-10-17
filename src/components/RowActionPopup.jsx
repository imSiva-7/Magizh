"use client";

import { useLayoutEffect, useRef } from "react";

// Native popovers render above scrolling tables without losing DOM ancestry.
export default function RowActionPopup({ children, className, onClose }) {
  const popupRef = useRef(null);

  useLayoutEffect(() => {
    const popup = popupRef.current;
    const wrapper = popup.parentElement;
    const trigger = wrapper.querySelector("button");
    const scrollPositions = new Map([[document, { left: scrollX, top: scrollY }]]);
    for (let element = trigger.parentElement; element; element = element.parentElement) {
      scrollPositions.set(element, { left: element.scrollLeft, top: element.scrollTop });
    }
    const position = () => {
      const rect = trigger.getBoundingClientRect();
      const gap = 6, edge = 8;
      const height = popup.getBoundingClientRect().height;
      const width = popup.getBoundingClientRect().width;
      const below = innerHeight - rect.bottom - edge;
      const top = below >= height || below >= rect.top - edge
        ? rect.bottom + gap
        : rect.top - height - gap;
      popup.style.left = `${Math.max(edge, Math.min(rect.right - width, innerWidth - width - edge))}px`;
      popup.style.top = `${Math.max(edge, Math.min(top, innerHeight - height - edge))}px`;
    };
    const escape = event => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        trigger.focus({ preventScroll: true });
      }
    };
    const focusOutside = event => {
      if (!wrapper.contains(event.target)) onClose();
    };
    const scrollOutside = event => {
      if (popup.contains(event.target)) return;
      const previous = scrollPositions.get(event.target);
      const left = event.target === document ? scrollX : event.target.scrollLeft;
      const top = event.target === document ? scrollY : event.target.scrollTop;
      // Ignore queued events from the scroll that brought the trigger into view.
      if (previous && (previous.left !== left || previous.top !== top)) onClose();
    };
    popup.showPopover();
    position();
    popup.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
    window.addEventListener("resize", position);
    document.addEventListener("scroll", scrollOutside, true);
    document.addEventListener("keydown", escape);
    document.addEventListener("focusin", focusOutside);
    return () => {
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", scrollOutside, true);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("focusin", focusOutside);
      popup.hidePopover();
    };
  }, [onClose]);

  return <div ref={popupRef} popover="manual" className={className} onClick={event => { if (event.target.closest("button:not(:disabled)")) onClose(); }} style={{ position: "fixed", inset: "auto", margin: 0, padding: 0, maxWidth: "calc(100vw - 16px)", minWidth: "min(140px, calc(100vw - 16px))", maxHeight: "calc(100dvh - 16px)", overflowY: "auto", animation: "none" }}>{children}</div>;
}
