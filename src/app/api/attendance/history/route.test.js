import { GET } from "./route";
import { requireSummaryAdmin } from "@/lib/summary-auth";
import getDatabase from "@/database/connectToMongoDB";

jest.mock("@/lib/summary-auth", () => ({ requireSummaryAdmin: jest.fn() }));
jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@/lib/india-date.mjs", () => ({
  ...jest.requireActual("@/lib/india-date.mjs"),
  getTodayDate: (...args) => args.length ? jest.requireActual("@/lib/india-date.mjs").getTodayDate(...args) : "2026-10-20",
}));

const month = "2026-10";
const employees = [
  {
    empID: "0001", name: "Manual", joiningDate: "2026-10-15",
    attendance: { [month]: { days: {
      14: { checkIn: "08:00", checkOut: "18:00" },
      15: { checkIn: "08:30", checkOut: "19:45", hoursWorked: 999 },
      16: { checkIn: "08:00", checkOut: null, hoursWorked: 999 },
      21: { checkIn: "08:00", checkOut: "18:00" },
    } } },
  },
  { empID: "0002", name: "New", createdAt: new Date("2026-10-16T20:00:00Z"), paidLeaveDays: 2 },
  { empID: "0003", name: "Existing", createdAt: new Date("2026-09-30T10:00:00Z"), paidLeaveDays: 2 },
  { empID: "0004", name: "Future", createdAt: new Date("2026-11-01T10:00:00Z") },
];

const request = (params = "") => ({ url: "http://localhost/api/attendance/history?month=2026-10" + params });
beforeEach(() => {
  requireSummaryAdmin.mockResolvedValue(null);
  getDatabase.mockResolvedValue({ collection: () => ({ find: () => ({ toArray: async () => employees }) }) });
});

test("missing-checkout history includes manual attendance without counting absent staff", async () => {
  const data = await (await GET(request("&status=incomplete"))).json();
  expect(data.records).toMatchObject([{ empID: "0001", date: "2026-10-16", status: "present", punchCount: 0, hoursWorked: 0 }]);
  expect(data.summary.incompleteCount).toBe(1);
});

test("history includes employees with no punches only from their employment start", async () => {
  const data = await (await GET(request())).json();
  const records = id => data.records.filter(row => row.empID === id);
  expect(records("0001").at(-1)).toMatchObject({ date: "2026-10-15", hoursWorked: 11.25, regularHours: 9, overtimeHours: 2.25 });
  expect(records("0001").at(-1)).not.toHaveProperty("joiningDate");
  expect(records("0002").map(({ date, status }) => [date, status])).toEqual([
    ["2026-10-20", "pending"], ["2026-10-19", "excess_leave"], ["2026-10-18", "excess_leave"], ["2026-10-17", "excess_leave"],
  ]);
  expect(records("0003").slice(-3).map(row => row.status)).toEqual(["excess_leave", "paid_leave", "paid_leave"]);
  expect(records("0004")).toHaveLength(0);
  expect(data.summary).toMatchObject({ totalHours: 11.25, incompleteCount: 1, uniqueEmployees: 3 });
});

test("filtering by date keeps the full month's paid leave allocation", async () => {
  const data = await (await GET(request("&startDate=2026-10-03&endDate=2026-10-03&status=excess_leave&search=existing"))).json();
  expect(data.records).toMatchObject([{ empID: "0003", date: "2026-10-03", status: "excess_leave" }]);
});

test("invalid calendar month fails before database access", async () => {
  getDatabase.mockClear();
  expect((await GET({ url: "http://localhost/api/attendance/history?month=2026-13" })).status).toBe(400);
  expect(getDatabase).not.toHaveBeenCalled();
});
