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

test("history only lists check-ins within the employment and date range", async () => {
  const data = await (await GET(request())).json();
  expect(data.records.map(({ empID, date }) => [empID, date])).toEqual([
    ["0001", "2026-10-16"], ["0001", "2026-10-15"],
  ]);
  expect(data.records[1]).toMatchObject({ hoursWorked: 11.25, regularHours: 9, overtimeHours: 2.25 });
  expect(data.summary).toMatchObject({ totalHours: 11.25, incompleteCount: 1, uniqueEmployees: 1 });
});

test("today only lists employees who have checked in", async () => {
  employees[0].attendance[month].days[20] = { checkIn: "08:00", checkOut: null };
  try {
    const data = await (await GET(request("&startDate=2026-10-20&endDate=2026-10-20"))).json();
    expect(data.records).toMatchObject([{ empID: "0001", date: "2026-10-20", checkOut: "" }]);
  } finally {
    delete employees[0].attendance[month].days[20];
  }
});

test("invalid calendar month fails before database access", async () => {
  getDatabase.mockClear();
  expect((await GET({ url: "http://localhost/api/attendance/history?month=2026-13" })).status).toBe(400);
  expect(getDatabase).not.toHaveBeenCalled();
});
