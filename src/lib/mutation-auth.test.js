import { getServerSession } from "next-auth";
import { requireAdmin, requireStaff } from "./mutation-auth";
import getDatabase from "@/database/connectToMongoDB";
import * as customers from "@/app/api/customer/route";
import * as orders from "@/app/api/customer/order/route";
import * as suppliers from "@/app/api/supplier/route";
import * as procurements from "@/app/api/supplier/procurement/route";
import * as employees from "@/app/api/employee/route";
import * as attendance from "@/app/api/attendance/route";
import * as productions from "@/app/api/production/route";
import * as adjustments from "@/app/api/stock/adjust/route";
import * as thresholds from "@/app/api/stock/thresholds/route";
import * as migration from "@/app/api/migrate/employee-attendance/route";
import * as payments from "@/app/api/customer/total_orders/route";
import * as registration from "@/app/api/register/route";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@/lib/mongodb", () => ({ __esModule: true, default: Promise.resolve({}) }));

beforeEach(() => { jest.clearAllMocks(); });

const changes = [
  ["customers", customers, ["PUT", "DELETE"]],
  ["orders", orders, ["PUT", "PATCH", "DELETE"]],
  ["suppliers", suppliers, ["PUT", "DELETE"]],
  ["procurements", procurements, ["PUT", "PATCH", "DELETE"]],
  ["employees", employees, ["PUT", "DELETE"]],
  ["attendance advances", attendance, ["PUT", "DELETE"]],
  ["production", productions, ["DELETE"]],
  ["stock adjustments", adjustments, ["POST"]],
  ["minimum stock levels", thresholds, ["PUT"]],
  ["employee migration", migration, ["POST"]],
];

for (const [name, routes, methods] of changes) for (const method of methods) {
  const blockedRoles = name === "stock adjustments"
    ? [null, "dev", "supplier", "customer"]
    : [null, "employee", "dev", "supplier", "customer"];
  test.each(blockedRoles)(`${method} ${name} blocks %s before reading data`, async role => {
    getServerSession.mockResolvedValue(role ? { user: { role } } : null);
    const json = jest.fn();
    const response = await routes[method]({ url: "http://localhost/api/test", json });
    expect(response.status).toBe(role ? 403 : 401);
    expect(json).not.toHaveBeenCalled();
    expect(getDatabase).not.toHaveBeenCalled();
  });
}

test("employees can create stock adjustments", async () => {
  getServerSession.mockResolvedValue({ user: { role: "employee" } });
  const db = {
    collection: jest.fn(() => ({
      insertOne: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockResolvedValue({}),
    })),
  };
  getDatabase.mockResolvedValue(db);
  const response = await adjustments.POST({
    json: async () => ({ product: "butter", quantity: 2 }),
  });
  expect(response.status).toBe(200);
});

test.each(["admin", "employee", "dev"])("%s can add records; only admin can change them", async role => {
  getServerSession.mockResolvedValue({ user: { role } });
  expect(await requireStaff()).toBeNull();
  const response = await requireAdmin();
  if (role === "admin") expect(response).toBeNull();
  else expect(response.status).toBe(403);
});

test.each([null, "customer", "supplier"])("untrusted creator %s cannot insert business records", async role => {
  getServerSession.mockResolvedValue(role ? { user: { role } } : null);
  for (const routes of [customers, orders, suppliers, procurements, employees, attendance, productions]) {
    expect((await routes.POST({ json: jest.fn() })).status).toBe(role ? 403 : 401);
  }
  expect(getDatabase).not.toHaveBeenCalled();
});

test.each(["employee", "dev"])("%s cannot reverse receipts or label a correction as a normal payment", async role => {
  getServerSession.mockResolvedValue({ user: { role } });
  for (const details of [{ paidAmount: "-100", note: "Reverse receipt" }, { paidAmount: "100", kind: "correction", note: "Correct receipt" }]) {
    const response = await payments.PUT({ url: "http://localhost/api/customer/total_orders?customerId=aaaaaaaaaaaaaaaaaaaaaaaa", json: async () => details });
    expect(response.status).toBe(403);
  }
  expect(getDatabase).not.toHaveBeenCalled();
});

test.each([null, "employee", "dev"])("registration cannot grant an elevated role to %s", async role => {
  getServerSession.mockResolvedValue(role ? { user: { role } } : null);
  for (const target of ["admin", "dev"]) {
    expect((await registration.POST({ json: async () => ({ name: "User", email: "test@example.test", password: "password", role: target }) })).status).toBe(role ? 403 : 401);
  }
  expect(getDatabase).not.toHaveBeenCalled();
});

test.each(["employee", "dev"])("%s cannot change existing commissions through head-supplier creation", async role => {
  getServerSession.mockResolvedValue({ user: { role } });
  const response = await suppliers.POST({ json: async () => ({ isHeadSupplier: true, childSuppliers: [{ supplierId: "aaaaaaaaaaaaaaaaaaaaaaaa", cutPercentage: 10 }] }) });
  expect(response.status).toBe(403);
  expect(getDatabase).not.toHaveBeenCalled();
});
