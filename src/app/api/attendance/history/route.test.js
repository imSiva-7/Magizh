import { GET } from "./route";
import { requireSummaryAdmin } from "@/lib/summary-auth";
import getDatabase from "@/database/connectToMongoDB";

jest.mock("@/lib/summary-auth", () => ({ requireSummaryAdmin: jest.fn() }));
jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@/lib/india-date.mjs", () => ({ getTodayDate: () => "2026-10-20" }));

test("missing-checkout history accepts manual records without requiring device punches", async () => {
  requireSummaryAdmin.mockResolvedValue(null);
  const manual = { empID: "0001", date: "2026-10-15", checkIn: "08:00:00", checkOut: null, punchCount: 0, hoursWorked: 0 };
  const aggregate = jest.fn(() => ({ toArray: async () => [manual] }));
  getDatabase.mockResolvedValue({ collection: () => ({ aggregate }) });
  const response = await GET({ url: "http://localhost/api/attendance/history?month=2026-10&status=incomplete" });
  const data = await response.json();
  expect(data.records).toEqual([{ ...manual, regularHours: 0, overtimeHours: 0 }]);
  expect(data.summary.incompleteCount).toBe(1);
  const filters = aggregate.mock.calls[0][0].find(stage => stage.$match?.$and).$match.$and;
  expect(filters).toContainEqual({ checkIn: { $exists: true, $nin: [null, ""] } });
  expect(filters.some(filter => filter.punchCount)).toBe(false);
});

test("history excludes future and pre-joining attendance and derives hours from valid timestamps", async () => {
  requireSummaryAdmin.mockResolvedValue(null);
  const rows = [
    { empID: "0001", date: "2026-10-14", joiningDate: "2026-10-15", checkIn: "08:00:00", checkOut: "18:00:00", hoursWorked: 10 },
    { empID: "0001", date: "2026-10-15", joiningDate: "2026-10-15", checkIn: "08:30:00", checkOut: "19:45:00", hoursWorked: 999 },
    { empID: "0001", date: "2026-10-21", checkIn: "08:00:00", checkOut: "18:00:00", hoursWorked: 10 },
    { empID: "0002", date: "2026-10-16", checkIn: "08:00:00", checkOut: null, hoursWorked: 999 },
  ];
  getDatabase.mockResolvedValue({ collection: () => ({ aggregate: () => ({ toArray: async () => rows }) }) });
  const response = await GET({ url: "http://localhost/api/attendance/history?month=2026-10" });
  const data = await response.json();
  expect(data.records).toHaveLength(2);
  expect(data.records[0]).toMatchObject({ hoursWorked: 11.25, regularHours: 9, overtimeHours: 2.25 });
  expect(data.records[0]).not.toHaveProperty("joiningDate");
  expect(data.records[1].hoursWorked).toBe(0);
  expect(data.summary).toMatchObject({ totalHours: 11.25, incompleteCount: 1 });
});

test("invalid calendar month fails before database access", async () => {
  getDatabase.mockClear();
  requireSummaryAdmin.mockResolvedValue(null);
  expect((await GET({ url: "http://localhost/api/attendance/history?month=2026-13" })).status).toBe(400);
  expect(getDatabase).not.toHaveBeenCalled();
});
