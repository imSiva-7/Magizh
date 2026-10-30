import getDatabase from "@/database/connectToMongoDB";
import { GET, POST } from "./route";
import { parsePunches, mergeDay, savePunches } from "@/lib/iclock";

jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));

const read = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
function set(object, path, value) {
  const parts = path.split(".");
  let current = object;
  for (const key of parts.slice(0, -1)) current = current[key] ||= {};
  current[parts.at(-1)] = structuredClone(value);
}
function mockDatabase(initial = [{ _id: "employee-1", empID: "2201", attendance: {} }]) {
  const documents = initial.map((row) => structuredClone(row));
  const unmatched = new Map();
  const employees = {
    findOne: jest.fn(async ({ empID }) => structuredClone(documents.find((row) => row.empID === empID) || null)),
    updateOne: jest.fn(async (filter, update) => {
      const document = documents.find((row) => row._id === filter._id);
      const matches = document && Object.entries(filter).every(([path, expected]) => {
        const actual = read(document, path);
        if (expected && "$exists" in Object(expected)) return (actual !== undefined) === expected.$exists;
        if (expected && "$eq" in Object(expected)) return JSON.stringify(actual) === JSON.stringify(expected.$eq);
        return expected === null ? actual == null : actual === expected;
      });
      if (!matches) return { matchedCount: 0 };
      for (const [path, value] of Object.entries(update.$set)) set(document, path, value);
      return { matchedCount: 1 };
    }),
  };
  const pending = {
    bulkWrite: jest.fn(async (operations) => {
      for (const { updateOne } of operations) {
        if (!unmatched.has(updateOne.filter._id)) unmatched.set(updateOne.filter._id, updateOne.update.$setOnInsert);
      }
    }),
  };
  return { collection: jest.fn((name) => name === "employee" ? employees : pending), employees, pending, documents, unmatched };
}

const punch = (time, date = "2026-10-15", employee = "2201") => `${employee}\t${date} ${time}\t0\t1\t0`;
const request = (body = "", query = "SN=TEST&table=ATTLOG", headers = {}) => new Request(`http://localhost/iclock/cdata?${query}`, { method: "POST", body, headers });
const day = (db, number = "15") => db.documents[0].attendance["2026-10"].days[number];
const originalAllowed = process.env.ICLOCK_ALLOWED_SERIALS;
let db;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ICLOCK_ALLOWED_SERIALS;
  db = mockDatabase();
  getDatabase.mockResolvedValue(db);
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  if (originalAllowed === undefined) delete process.env.ICLOCK_ALLOWED_SERIALS;
  else process.env.ICLOCK_ALLOWED_SERIALS = originalAllowed;
});

test("plain-text handshake supports upper/lowercase serial query and bypasses the DB", async () => {
  for (const query of ["SN=TEST", "sn=TEST&options=all"]) {
    const response = await GET(new Request(`http://localhost/iclock/cdata?${query}`));
    expect(await response.text()).toBe("OK");
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(getDatabase).not.toHaveBeenCalled();
});

test("rejects missing and unapproved device serials before DB access", async () => {
  expect((await POST(request(punch("08:00:00"), "table=ATTLOG"))).status).toBe(400);
  process.env.ICLOCK_ALLOWED_SERIALS = "ALLOWED, SECOND";
  expect((await POST(request(punch("08:00:00")))).status).toBe(403);
  expect((await GET(new Request("http://localhost/iclock/cdata?SN=TEST"))).status).toBe(403);
  expect(getDatabase).not.toHaveBeenCalled();
});

test("ignores operation/enrollment tables and empty attendance uploads", async () => {
  for (const [body, query] of [["user template data", "SN=TEST&table=OPLOG"], ["", "SN=TEST&table=ATTLOG"]]) {
    expect(await (await POST(request(body, query))).text()).toBe("OK");
  }
  expect(getDatabase).not.toHaveBeenCalled();
});

test("accepts CRLF, sorts records, calculates regular/overtime hours, and uses India time", async () => {
  const response = await POST(request([punch("19:30:00"), punch("08:00:00"), punch("08:00:00")].join("\r\n")));
  expect(await response.text()).toBe("OK");
  expect(day(db)).toMatchObject({ checkIn: "08:00:00", checkOut: "19:30:00", hoursWorked: 11.5, regularHours: 9, overtimeHours: 2.5 });
  expect(day(db).punches).toHaveLength(2);
  expect(day(db).punches[0].timestamp.toISOString()).toBe("2026-10-15T02:30:00.000Z");
  expect(db.employees.updateOne).toHaveBeenCalledTimes(1);
});

test("a repeated upload is idempotent and causes no extra attendance writes", async () => {
  const body = `${punch("08:00:00")}\n${punch("18:00:00")}`;
  await POST(request(body));
  await POST(request(body));
  expect(day(db).punches).toHaveLength(2);
  expect(db.employees.updateOne).toHaveBeenCalledTimes(1);
});

test("overlapping concurrent uploads retain both punches", async () => {
  const first = parsePunches(punch("08:00:00"), "TEST").records;
  const second = parsePunches(punch("18:00:00"), "TEST").records;
  await Promise.all([savePunches(db, first), savePunches(db, second)]);
  expect(day(db).punches).toHaveLength(2);
  expect(day(db).hoursWorked).toBe(10);
  expect(db.employees.findOne.mock.calls.length).toBeGreaterThan(2);
});

test("updates just the affected day and preserves unrelated days and employee fields", async () => {
  db.documents[0].name = "Unchanged employee";
  db.documents[0].attendance = { "2026-09": { days: { "01": { hoursWorked: 7 } } } };
  await POST(request(punch("08:00:00")));
  expect(db.documents[0].attendance["2026-09"].days["01"].hoursWorked).toBe(7);
  expect(db.documents[0].name).toBe("Unchanged employee");
  expect(db.employees.findOne.mock.calls[0][1].projection).toEqual({ "attendance.2026-10.days.15": 1 });
  expect(db.employees.updateOne.mock.calls[0][1].$set).not.toHaveProperty("attendance");
});

test("batches multiple days into one write per employee", async () => {
  await POST(request(`${punch("08:00:00", "2026-10-14")}\n${punch("09:00:00")}`));
  expect(day(db, "14").checkIn).toBe("08:00:00");
  expect(day(db).checkIn).toBe("09:00:00");
  expect(db.employees.updateOne).toHaveBeenCalledTimes(1);
});

test("preserves calendar-day policy: an overnight pair remains two incomplete days", async () => {
  await POST(request(`${punch("22:00:00", "2026-10-14")}\n${punch("06:00:00")}`));
  expect(day(db, "14").checkOut).toBeNull();
  expect(day(db).checkOut).toBeNull();
});

test.each([null, { "2026-10": null }, { "2026-10": { days: null } }])("handles legacy null attendance parents (%j)", async (attendance) => {
  db.documents[0].attendance = attendance;
  expect((await POST(request(punch("08:00:00")))).status).toBe(200);
  expect(day(db).punches).toHaveLength(1);
});

test("quarantines unknown employees durably, deduplicates retries, and returns OK", async () => {
  const body = punch("08:00:00", "2026-10-15", "9999");
  for (let i = 0; i < 2; i++) expect(await (await POST(request(body))).text()).toBe("OK");
  expect(db.unmatched.size).toBe(1);
  expect([...db.unmatched.values()][0]).toMatchObject({ employeeId: "9999", deviceId: "TEST" });
  expect(db.employees.updateOne).not.toHaveBeenCalled();
});

test("does not acknowledge success if the unmatched queue cannot save", async () => {
  db.pending.bulkWrite.mockRejectedValue(new Error("DB unavailable"));
  expect((await POST(request(punch("08:00:00", "2026-10-15", "9999")))).status).toBe(503);
});

test.each([punch("25:00:00"), punch("08:00:00", "2026-02-30"), "__proto__\tinvalid", "bad payload"])('rejects malformed attendance without any database writes: %s', async (body) => {
  expect((await POST(request(`${punch("09:00:00")}\n${body}`))).status).toBe(400);
  expect(getDatabase).not.toHaveBeenCalled();
});

test("rejects oversized bodies by advertised and actual streamed size", async () => {
  const advertised = await POST(request("", undefined, { "content-length": String(9 * 1024 * 1024) }));
  expect(advertised.status).toBe(413);
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1)); controller.close(); } });
  const streamed = new Request("http://localhost/iclock/cdata?SN=TEST", { method: "POST", body, duplex: "half" });
  expect((await POST(streamed)).status).toBe(413);
  expect(getDatabase).not.toHaveBeenCalled();
});

test("returns a retryable error on DB failure or exhausted concurrent update retries", async () => {
  getDatabase.mockRejectedValueOnce(new Error("Offline"));
  expect((await POST(request(punch("08:00:00")))).status).toBe(503);
  db.employees.updateOne.mockResolvedValue({ matchedCount: 0 });
  const response = await POST(request(punch("08:00:00")));
  expect(response.status).toBe(503);
  expect(response.headers.get("retry-after")).toBe("10");
  expect(db.employees.updateOne).toHaveBeenCalledTimes(5);
});

test("merging old duplicates repairs the day and retains extra day fields", () => {
  const records = parsePunches(`${punch("08:00:00")}\n${punch("18:00:00")}`, "TEST").records;
  const previous = mergeDay(null, records);
  previous.note = "Keep this";
  previous.punches.push(previous.punches[0]);
  const next = mergeDay(previous, records);
  expect(next.punches).toHaveLength(2);
  expect(next.note).toBe("Keep this");
  expect(next.hoursWorked).toBe(10);
});
