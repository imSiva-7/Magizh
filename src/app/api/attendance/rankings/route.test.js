import { GET } from "./route";
import { getServerSession } from "next-auth";
import getDatabase from "@/database/connectToMongoDB";
import { getEmployeeRankings } from "@/lib/employee-rankings";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@/lib/employee-rankings", () => ({ getEmployeeRankings: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { role: "admin" } });
  getDatabase.mockResolvedValue({});
  getEmployeeRankings.mockResolvedValue([{ empID: "0001", totalHours: 42.25, rank: 1 }]);
});
test.each([null, "employee", "supplier"])("rejects callers without employee access (%s) before database access", async role => {
  getServerSession.mockResolvedValue(role ? { user: { role } } : null);
  const response = await GET(new Request("http://localhost/api/attendance/rankings?month=2026-01"));
  expect(response.status).toBe(role ? 403 : 401);
  expect(getDatabase).not.toHaveBeenCalled();
});
test.each(["2026-00", "2026-13", "invalid", "2999-01"])("rejects invalid or future months (%s)", async month => {
  expect((await GET(new Request(`http://localhost/api/attendance/rankings?month=${month}`))).status).toBe(400);
  expect(getDatabase).not.toHaveBeenCalled();
});
test("returns the selected full-month ranks even if a caller supplies a search", async () => {
  const response = await GET(new Request("http://localhost/api/attendance/rankings?month=2026-01&search=someone"));
  expect(response.status).toBe(200);
  expect(getEmployeeRankings).toHaveBeenCalledWith({}, "2026-01");
  expect(await response.json()).toMatchObject({ month: "2026-01", rankings: [{ rank: 1, totalHours: 42.25 }] });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
