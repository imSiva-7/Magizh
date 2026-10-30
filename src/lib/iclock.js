import { createHash } from "node:crypto";

const METHODS = { 0: "password", 1: "fingerprint", 2: "card", 15: "face" };
const MAX_RETRIES = 5;

// The terminal sends wall-clock time in India, independently of the server's TZ.
export function parsePunches(text, deviceId) {
  const records = new Map();
  let invalidCount = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [rawEmployeeId, rawTimestamp, state, verification] = line.split("\t");
    const employeeId = rawEmployeeId?.trim();
    const timestampText = rawTimestamp?.trim();
    const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(
      timestampText || "",
    );
    if (!employeeId || !/^[a-zA-Z0-9_-]{1,64}$/.test(employeeId) || !match) {
      invalidCount++;
      continue;
    }
    const [, date, time] = match;
    // Round-trip validation rejects impossible calendar dates that Date normalizes.
    const calendar = new Date(`${date}T${time}Z`);
    if (
      !Number.isFinite(calendar.getTime()) ||
      calendar.toISOString().slice(0, 19) !== `${date}T${time}` ||
      date < "2000-01-01"
    ) {
      invalidCount++;
      continue;
    }
    const punch = {
      employeeId,
      date,
      time,
      deviceId,
      timestamp: new Date(`${date}T${time}+05:30`),
      method:
        METHODS[Number.parseInt(verification?.trim() || "1", 10)] || "unknown",
      ...(state?.trim() ? { state: state.trim().slice(0, 16) } : {}),
    };
    records.set(`${employeeId}|${date}|${time}|${deviceId}`, punch);
  }
  return { records: [...records.values()], invalidCount };
}

export function mergeDay(previous, records) {
  const byIdentity = new Map();
  for (const punch of [...(previous?.punches || []), ...records]) {
    // Ignore verification changes on retries; the event identity is device + time.
    const { employeeId: _employeeId, date: _date, ...stored } = punch;
    byIdentity.set(`${stored.deviceId || ""}|${stored.time}`, stored);
  }
  const punches = [...byIdentity.values()].sort((a, b) =>
    a.time.localeCompare(b.time),
  );
  // Keep raw device events, but never overwrite an administrator's correction.
  if (previous?.manualTimes) return { ...previous, punches };
  const checkIn = punches[0].time;
  const last = punches[punches.length - 1].time;
  const checkOut = last !== checkIn ? last : null;
  const seconds = (time) =>
    time.split(":").reduce((value, part) => value * 60 + Number(part), 0);
  const hours = checkOut ? (seconds(checkOut) - seconds(checkIn)) / 3600 : 0;
  return {
    ...previous,
    date: records[0].date,
    punches,
    checkIn,
    checkOut,
    hoursWorked: Number(hours.toFixed(2)),
    regularHours: Number(Math.min(hours, 9).toFixed(2)),
    overtimeHours: Number(Math.max(hours - 9, 0).toFixed(2)),
  };
}

const dayPath = (date) =>
  `attendance.${date.slice(0, 7)}.days.${date.slice(8, 10)}`;
const getPath = (document, path) =>
  path.split(".").reduce((value, key) => value?.[key], document);

// Reads and writes only the days in this batch. Compare-and-set prevents a retry
// or a simultaneous upload from overwriting a day that changed after our read.
async function saveEmployee(db, employeeId, records) {
  const employees = db.collection("employee");
  const groups = new Map();
  for (const record of records) {
    const path = dayPath(record.date);
    if (!groups.has(path)) groups.set(path, []);
    groups.get(path).push(record);
  }
  const projection = Object.fromEntries(
    [...groups.keys()].map((path) => [path, 1]),
  );
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const employee = await employees.findOne(
      { empID: employeeId },
      { projection },
    );
    if (!employee) {
      // Acknowledge only after unknown IDs are saved durably for reconciliation.
      await db.collection("iclock_unmatched").bulkWrite(
        records.map((record) => ({
          updateOne: {
            filter: {
              _id: createHash("sha256")
                .update(
                  `${employeeId}|${record.date}|${record.time}|${record.deviceId}`,
                )
                .digest("hex"),
            },
            update: { $setOnInsert: { ...record, receivedAt: new Date() } },
            upsert: true,
          },
        })),
        { ordered: false },
      );
      return { unmatched: records.length };
    }

    // Older employees may have an explicitly null attendance/month/days object.
    // Initialize only null/missing parents under their own atomic guards.
    let initialized = false;
    const parentPaths = new Set(["attendance"]);
    for (const recordsForDay of groups.values()) {
      const month = `attendance.${recordsForDay[0].date.slice(0, 7)}`;
      parentPaths.add(month);
      parentPaths.add(`${month}.days`);
    }
    for (const path of parentPaths) {
      if (getPath(employee, path) === null) {
        await employees.updateOne(
          { _id: employee._id, [path]: null },
          { $set: { [path]: {} } },
        );
        initialized = true;
        break;
      }
    }
    if (initialized) continue;

    const filter = { _id: employee._id };
    const changes = {};
    for (const [path, dayRecords] of groups) {
      const previous = getPath(employee, path);
      const next = mergeDay(previous, dayRecords);
      if (JSON.stringify(previous) === JSON.stringify(next)) continue;
      filter[path] =
        previous === undefined ? { $exists: false } : { $eq: previous };
      changes[path] = next;
      changes[`payroll.${dayRecords[0].date.slice(0, 7)}`] = null;
    }
    if (!Object.keys(changes).length) return { unmatched: 0 };
    const result = await employees.updateOne(filter, {
      $set: { ...changes, updatedAt: new Date() },
    });
    if (result.matchedCount === 1) return { unmatched: 0 };
  }
  throw new Error("Attendance changed during upload; retry required");
}

export async function savePunches(db, records) {
  const employees = new Map();
  for (const record of records) {
    if (!employees.has(record.employeeId)) employees.set(record.employeeId, []);
    employees.get(record.employeeId).push(record);
  }
  let unmatched = 0;
  // Keep DB concurrency bounded; each employee is written once per batch normally.
  const pending = [...employees.entries()];
  let next = 0;
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(4, pending.length) }, async () => {
      while (next < pending.length) {
        const [employeeId, punches] = pending[next++];
        const result = await saveEmployee(db, employeeId, punches);
        unmatched += result.unmatched;
      }
    }),
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  return { employees: employees.size, unmatched };
}
