import { ObjectId } from "mongodb";
import { GET, POST, PATCH } from "./route";
import { requireStaff, requireAdmin } from "@/lib/mutation-auth";
import getDatabase from "@/database/connectToMongoDB";
jest.mock("@/lib/mutation-auth", () => ({ requireStaff: jest.fn(), requireAdmin: jest.fn() }));
jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@/lib/india-date.mjs", () => ({ getTodayDate: () => "2026-10-23" }));

const customerId = new ObjectId(), id = new ObjectId();
let subscription, findOne, updateOne, insertOne;
beforeEach(() => {
  jest.clearAllMocks(); requireStaff.mockResolvedValue(null); requireAdmin.mockResolvedValue(null);
  subscription = { _id: id, customerId, startDate: "2026-10-01", nextDate: "2026-10-10", status: "paused" };
  findOne = jest.fn(async () => subscription); updateOne = jest.fn(async () => ({ matchedCount: 1 })); insertOne = jest.fn(async () => ({ insertedId: id }));
  getDatabase.mockResolvedValue({ client: { startSession: () => ({ withTransaction: action => action(), endSession: async () => {} }) }, collection: name => name === "customers" ? { findOne: async () => ({ _id: customerId, customerName: "Customer" }) } : { findOne, updateOne, insertOne } });
});
const request = body => new Request("https://example.test/api/customer/subscriptions", { method: "POST", body: JSON.stringify(body) });
test.each([[GET, "requireStaff"], [POST, "requireStaff"], [PATCH, "requireAdmin"]])("authorization blocks access before DB lookup", async (method, role) => {
  (role === "requireStaff" ? requireStaff : requireAdmin).mockResolvedValue(new Response(null, { status: 403 }));
  expect((await method(request({}))).status).toBe(403); expect(getDatabase).not.toHaveBeenCalled();
});
test("resume skips paused dates instead of backfilling orders", async () => {
  expect((await PATCH(request({ id: String(id), action: "resume" }))).status).toBe(200);
  expect(updateOne.mock.calls[0][1].$set).toMatchObject({ status: "active", nextDate: "2026-10-23" });
});
test("resume never rewinds a future cursor", async () => {
  subscription.nextDate = "2026-11-01";
  expect((await PATCH(request({ id: String(id), action: "resume" }))).status).toBe(200);
  expect(updateOne.mock.calls[0][1].$set.nextDate).toBe("2026-11-01");
});
test("already processed dates cannot be skipped or restored", async () => {
  subscription.nextDate = "2026-10-24";
  expect((await PATCH(request({ id: String(id), action: "skip", date: "2026-10-23" }))).status).toBe(409);
  expect(updateOne).not.toHaveBeenCalled();
});
test("server calculates subscription fields rather than accepting client status", async () => {
  const response = await POST(request({ customerId: String(customerId), startDate: "2026-10-23", weekdays: [0,1,2,3,4,5,6], items: [{ product: "Milk", quantity: 2, ratePerUnit: 50 }], gstType: "inclusive", affectStockValue: false, status: "cancelled", totalAmount: 1 }));
  expect(response.status).toBe(201);
  expect(insertOne.mock.calls[0][0]).toMatchObject({ customerName: "Customer", status: "active", nextDate: "2026-10-23" });
  expect(insertOne.mock.calls[0][0]).not.toHaveProperty("totalAmount");
});
