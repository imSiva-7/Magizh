import { PATCH } from "./route";
import { getServerSession } from "next-auth";
import getDatabase from "@/database/connectToMongoDB";
import { mergeDay } from "@/lib/iclock";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));
const previous = { date: "2026-01-15", checkIn: "08:00:00", checkOut: "16:00:00", punches: [{ time: "08:00:00", deviceId: "clock" }], hoursWorked: 8, regularHours: 8, overtimeHours: 0 };
const findOne = jest.fn(), updateOne = jest.fn();
const request = (extra = {}) => ({ json: async () => ({ empID: "0001", date: previous.date, checkIn: "08:30", checkOut: "19:45", expectedCheckIn: previous.checkIn, expectedCheckOut: previous.checkOut, ...extra }) });
beforeEach(() => {
  jest.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { role: "admin", email: "admin@example.test" } });
  getDatabase.mockResolvedValue({ collection: () => ({ findOne, updateOne }) });
  findOne.mockResolvedValue({ _id: "employee", attendance: { "2026-01": { days: { "15": previous } } } });
  updateOne.mockResolvedValue({ matchedCount: 1 });
});
test.each([null, "employee", "dev"])("rejects non-admin %s before DB access", async role => {
  getServerSession.mockResolvedValue(role ? { user: { role } } : null);
  expect((await PATCH(request())).status).toBe(role ? 403 : 401);
  expect(getDatabase).not.toHaveBeenCalled();
});
test.each([{ checkOut: "07:00" }, { checkIn: "24:00" }, { date: "2026-02-30" }, { date: "2999-01-01" }, { empID: { $ne: null } }])("rejects invalid correction %j", async value => {
  expect((await PATCH(request(value))).status).toBe(400);
  expect(updateOne).not.toHaveBeenCalled();
});
test("preserves punches and records history while recomputing regular and overtime hours", async () => {
  expect((await PATCH(request())).status).toBe(200);
  const [filter, update] = updateOne.mock.calls[0];
  expect(filter["attendance.2026-01.days.15"]).toEqual({ $eq: previous });
  const day = update.$set["attendance.2026-01.days.15"];
  expect(day).toMatchObject({ checkIn: "08:30:00", checkOut: "19:45:00", hoursWorked: 11.25, regularHours: 9, overtimeHours: 2.25, punches: previous.punches });
  expect(day.corrections[0]).toMatchObject({ previousCheckIn: "08:00:00", editedBy: "admin@example.test" });
  const merged = mergeDay(day, [{ date: previous.date, time: "20:00:00", deviceId: "clock" }]);
  expect(merged.hoursWorked).toBe(11.25);
  expect(merged.checkOut).toBe("19:45:00");
  expect(merged.punches).toHaveLength(2);
});
test("allows missing checkout with zero hours", async () => {
  expect((await PATCH(request({ checkOut: "" }))).status).toBe(200);
  expect(updateOne.mock.calls[0][1].$set["attendance.2026-01.days.15"]).toMatchObject({ checkOut: null, hoursWorked: 0, overtimeHours: 0 });
});
test("rejects stale form values", async () => {
  expect((await PATCH(request({ expectedCheckIn: "09:00:00" }))).status).toBe(409);
  expect(updateOne).not.toHaveBeenCalled();
});
test("rejects concurrent device changes", async () => {
  updateOne.mockResolvedValue({ matchedCount: 0 });
  expect((await PATCH(request())).status).toBe(409);
});
