"use client";

import { useId, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { getTodayDate } from "@/lib/india-date.mjs";
import styles from "./CalendarInput.module.css";

const shortMonth = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" });
const monthAndYear = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "UTC" });
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (value) => String(value).padStart(2, "0");
const monthKey = (year, month) => `${String(year).padStart(4, "0")}-${pad(month)}`;
const firstDay = (month) => new Date(`${month}-01T00:00:00Z`);

function shiftMonth(month, amount) {
  const date = firstDay(month);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return monthKey(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

export default function CalendarInput({
  type = "date",
  value,
  min,
  max,
  required,
  disabled,
  readOnly,
  ref,
  ...inputProps
}) {
  const popupId = useId();
  const fieldRef = useRef(null);
  const inputRef = useRef(null);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const titleRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);
  const monthOnly = type === "month";
  const today = getTodayDate();
  const current = monthOnly ? today.slice(0, 7) : today;
  const firstMonth = min?.slice(0, 7) || "0001-01";
  const lastMonth = max?.slice(0, 7) || "9999-12";
  const month = view?.month ?? today.slice(0, 7);
  const year = Number(month.slice(0, 4));
  const first = firstDay(month);
  const offset = (first.getUTCDay() + 6) % 7;
  const last = new Date(first);
  last.setUTCMonth(first.getUTCMonth() + 1, 0);

  useImperativeHandle(ref, () => inputRef.current, []);

  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (!open || !popup?.matches(":popover-open")) return;

    function position() {
      const field = fieldRef.current.getBoundingClientRect();
      const edge = 8;
      const gap = 6;
      const { clientWidth, clientHeight } = document.documentElement;
      const above = field.top - gap - edge;
      const below = clientHeight - field.bottom - gap - edge;
      const showBelow = below >= popup.offsetHeight || below >= above;
      const top = showBelow ? field.bottom + gap : field.top - gap - popup.offsetHeight;

      popup.style.left = `${Math.max(edge, Math.min(field.left, clientWidth - popup.offsetWidth - edge))}px`;
      popup.style.top = `${Math.max(edge, Math.min(top, clientHeight - popup.offsetHeight - edge))}px`;
    }

    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, view]);

  function startView() {
    if (popupRef.current.matches(":popover-open")) return;
    const selected = inputRef.current.value || current;
    const selectedMonth = selected.slice(0, 7);
    setView({
      month: selectedMonth < firstMonth ? firstMonth : selectedMonth > lastMonth ? lastMonth : selectedMonth,
      months: monthOnly,
    });
  }

  function isOutOfRange(date) {
    return (min && date < min) || (max && date > max);
  }

  function select(date) {
    popupRef.current.hidePopover();
    triggerRef.current?.focus({ preventScroll: true });

    const input = inputRef.current;
    if (input.value === date) return;
    // Use the native setter so React detects the change on the controlled input.
    const { set } = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    set.call(input, date);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  const browsingMonths = view?.months;
  const previous = browsingMonths ? monthKey(year - 1, 12) : shiftMonth(month, -1);
  const next = browsingMonths ? monthKey(year + 1, 1) : shiftMonth(month, 1);
  const canGoBack = browsingMonths ? year > Number(firstMonth.slice(0, 4)) : month > firstMonth;
  const canGoForward = browsingMonths ? year < Number(lastMonth.slice(0, 4)) : month < lastMonth;

  function navigate(target, allowed) {
    if (allowed) setView({ month: target, months: browsingMonths });
  }

  return (
    <div ref={fieldRef} className={styles.field} data-calendar-input>
      <input
        {...inputProps}
        ref={inputRef}
        type={type}
        value={value}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
      />
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={monthOnly ? "Open month picker" : "Open calendar"}
        aria-controls={popupId}
        aria-expanded={open}
        disabled={disabled || readOnly}
        popoverTarget={popupId}
        onClick={startView}
      >
        <span className={styles.calendarIcon} aria-hidden="true" />
      </button>
      <div
        ref={popupRef}
        id={popupId}
        popover="auto"
        className={styles.popup}
        role="group"
        aria-label={monthOnly ? "Choose a month" : "Choose a date"}
        onToggle={(event) => setOpen(event.currentTarget.matches(":popover-open"))}
      >
        {open && view && <>
          <div className={styles.header}>
            <button
              type="button"
              className={styles.nav}
              aria-label={browsingMonths ? "Previous year" : "Previous month"}
              aria-disabled={!canGoBack}
              onClick={() => navigate(previous, canGoBack)}
            ><span className={styles.previousArrow} aria-hidden="true" /></button>
            {monthOnly ? (
              <span className={styles.heading} aria-live="polite">{year}</span>
            ) : (
              <button
                ref={titleRef}
                type="button"
                className={styles.heading}
                aria-label={browsingMonths ? `${year}. Back to days` : `${monthAndYear.format(first)}. Choose month and year`}
                onClick={() => setView({ month, months: !browsingMonths })}
              >{browsingMonths ? year : monthAndYear.format(first)}</button>
            )}
            <button
              type="button"
              className={styles.nav}
              aria-label={browsingMonths ? "Next year" : "Next month"}
              aria-disabled={!canGoForward}
              onClick={() => navigate(next, canGoForward)}
            ><span className={styles.nextArrow} aria-hidden="true" /></button>
          </div>

          {browsingMonths ? (
            <div className={styles.months}>
              {Array.from({ length: 12 }, (_, index) => {
                const option = monthKey(year, index + 1);
                const date = firstDay(option);
                return (
                  <button
                    key={option}
                    type="button"
                    className={styles.option}
                    aria-label={monthAndYear.format(date)}
                    aria-pressed={value?.slice(0, 7) === option}
                    disabled={option < firstMonth || option > lastMonth}
                    onClick={() => {
                      if (monthOnly) {
                        select(option);
                      } else {
                        setView({ month: option, months: false });
                        titleRef.current?.focus({ preventScroll: true });
                      }
                    }}
                  >{shortMonth.format(date)}</button>
                );
              })}
            </div>
          ) : (
            <div className={styles.days}>
              {weekdays.map((day) => <span key={day} className={styles.weekday}>{day}</span>)}
              {Array.from({ length: last.getUTCDate() }, (_, index) => {
                const day = index + 1;
                const date = `${month}-${pad(day)}`;
                return (
                  <button
                    key={date}
                    type="button"
                    className={styles.option}
                    style={day === 1 ? { gridColumnStart: offset + 1 } : undefined}
                    aria-label={fullDate.format(new Date(`${date}T00:00:00Z`))}
                    aria-pressed={value === date}
                    disabled={Boolean(isOutOfRange(date))}
                    onClick={() => select(date)}
                  >{day}</button>
                );
              })}
            </div>
          )}
          <div className={styles.actions}>
            {!required && !inputProps["aria-required"] && (
              <button type="button" disabled={!value} onClick={() => select("")}>Clear</button>
            )}
            <button type="button" disabled={Boolean(isOutOfRange(current))} onClick={() => select(current)}>
              {monthOnly ? "This month" : "Today"}
            </button>
          </div>
        </>}
      </div>
    </div>
  );
}
