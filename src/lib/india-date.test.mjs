import test from "node:test";
import assert from "node:assert/strict";
import { getTodayDate, getCurrentMonthStartDate, getPreviousMonthDate, formatDateForDisplay, formatDateTimeForDisplay, month, getIndiaTimePeriod } from "./india-date.mjs";

test("IST calendar and display dates stay consistent across device time zones", () => {
  const original = process.env.TZ;
  try {
    for (const zone of ["UTC", "America/Los_Angeles", "Asia/Tokyo", "Asia/Kolkata"]) {
      process.env.TZ = zone;
      assert.equal(formatDateForDisplay("2026-10-12"), "12/10/26");
      assert.equal(formatDateForDisplay("12/10/26"), "12/10/26");
      assert.equal(getTodayDate("2026-10-17T18:29:59Z"), "2026-10-17");
      assert.equal(getTodayDate("2026-10-17T18:30:00Z"), "2026-10-18");
      assert.equal(formatDateForDisplay("2026-10-17T19:00:00Z"), "18/10/26");
      assert.equal(getCurrentMonthStartDate("2026-12-31T20:00:00Z"), "2027-01-01");
      assert.equal(month("2026-12-31T20:00:00Z"), "2027-01");
      assert.equal(formatDateForDisplay("2026-10-12T00:10:00"), "12/10/26");
      assert.match(formatDateTimeForDisplay("2026-10-17T19:00:00Z"), /^18\/10\/26, 12:30 am IST$/i);
      assert.equal(getIndiaTimePeriod("2026-10-18T06:29:59Z"), "AM");
      assert.equal(getIndiaTimePeriod("2026-10-18T06:30:00Z"), "PM");
      assert.equal(getIndiaTimePeriod("2026-10-18T18:30:00Z"), "AM");
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("month navigation clamps month-end days and invalid dates stay invalid", () => {
  assert.equal(getPreviousMonthDate("2024-03-31"), "2024-02-29");
  assert.equal(getPreviousMonthDate("2026-03-31"), "2026-02-28");
  assert.equal(getPreviousMonthDate("2026-01-15"), "2025-12-15");
  assert.equal(formatDateForDisplay("2026-02-30"), "—");
  assert.equal(formatDateForDisplay("invalid"), "—");
  assert.equal(formatDateForDisplay(null), "");
});
