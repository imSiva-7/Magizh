import { getServerSession } from "next-auth";
import { requireSummaryAdmin } from "./summary-auth";
import getDatabase from "@/database/connectToMongoDB";
import { GET as customers } from "@/app/api/analytics/customers/route";
import { GET as suppliers } from "@/app/api/analytics/procurements/route";
import { GET as productions } from "@/app/api/analytics/productions/route";
import { GET as customerSummary } from "@/app/api/customer/summary/route";
import { GET as supplierSummary } from "@/app/api/supplier/summary/route";
import { GET as payments } from "@/app/api/customer/payment-summary/route";
import { GET as accounts } from "@/app/api/customer/account-summary/route";
import { GET as attendance } from "@/app/api/attendance/route";
import { GET as attendanceHistory } from "@/app/api/attendance/history/route";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

test.each([null, "employee", "dev", "customer", "supplier"])("summary endpoints reject %s before reading records", async role => {
  getServerSession.mockResolvedValue(role ? { user: { role } } : null);
  for (const route of [customers, suppliers, productions, customerSummary, supplierSummary, payments, accounts, attendance, attendanceHistory]) {
    expect((await route({ url: "http://localhost/api/test" })).status).toBe(role ? 403 : 401);
  }
  expect(getDatabase).not.toHaveBeenCalled();
});

test("admins can access summaries", async () => {
  getServerSession.mockResolvedValue({ user: { role: "admin" } });
  expect(await requireSummaryAdmin()).toBeNull();
});
