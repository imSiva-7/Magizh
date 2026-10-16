import { ObjectId } from "mongodb";
import { PUT } from "./route";
import getDatabase from "@/database/connectToMongoDB";
jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("next/server", () => ({ NextResponse: { json: (data, options) => ({ data, status: options?.status || 200 }) } }));
const id = new ObjectId();
function database({ failLedger = false } = {}) {
  let state = { total_orders: [{ _id: id, totalAmount: 1000, paidAmount: 0, dueAmount: 1000 }, { _id: "global", paidAmount: 0, dueAmount: 1000 }], totalOrdersLedger: [] };
  const clone = () => Object.fromEntries(Object.entries(state).map(([key, rows]) => [key, rows.map(row => ({ ...row, ...(row.payments ? { payments: [...row.payments] } : {}) }))]));
  return { state: () => state, client: { startSession: () => ({ withTransaction: async action => { const previous = clone(); try { return await action(); } catch (error) { state = previous; throw error; } }, endSession: async () => {} }) }, collection(name) { return {
    findOne: async (query) => {
      const row = state[name].find(row => String(row._id) === String(query._id));
      if (query["payments.paymentId"]) {
        const receipt = row?.payments?.find(entry => entry.paymentId === query["payments.paymentId"]);
        return receipt ? { payments: [receipt] } : null;
      }
      return row;
    },
    updateOne: async (query, update) => {
      if (name === "totalOrdersLedger" && failLedger) throw new Error("Ledger unavailable");
      let row = state[name].find(row => String(row._id) === String(query._id));
      if (!row) { row = { _id: query._id, payments: [] }; state[name].push(row); }
      Object.assign(row, update.$set);
      for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
      if (update.$push) row.payments.push(update.$push.payments);
    },
  }; } };
}
const request = (details) => ({ url: `http://localhost/api/customer/total_orders?customerId=${id}`, json: async () => details });

test("partial receipts accumulate, settle and become credit without changing orders", async () => {
  const db = database(); getDatabase.mockResolvedValue(db);
  expect((await PUT(request({ paidAmount: "300.25" }))).data.dueAmount).toBe(699.75);
  expect((await PUT(request({ paidAmount: "200.25" }))).data.dueAmount).toBe(499.5);
  expect((await PUT(request({ paidAmount: "599.50" }))).data.dueAmount).toBe(-100);
  expect(db.state().totalOrdersLedger[0].payments).toHaveLength(3);
  expect(db.state().total_orders[1].paidAmount).toBe(1100);
});

test("same receipt ID is idempotent and changed details are rejected", async () => {
  const db = database(); getDatabase.mockResolvedValue(db);
  const details = { paidAmount: "300", paymentId: "test-receipt-001", method: "UPI", reference: "upi-123" };
  expect((await PUT(request(details))).status).toBe(200);
  expect((await PUT(request(details))).status).toBe(200);
  expect(db.state().totalOrdersLedger[0].payments).toHaveLength(1);
  expect(db.state().total_orders[0].paidAmount).toBe(300);
  expect((await PUT(request({ ...details, paidAmount: "301" }))).status).toBe(409);
});

test("corrections need a reason and cannot reverse more than received", async () => {
  const db = database(); getDatabase.mockResolvedValue(db);
  await PUT(request({ paidAmount: "300" }));
  expect((await PUT(request({ paidAmount: "-100" }))).status).toBe(400);
  expect((await PUT(request({ paidAmount: "-301", kind: "correction", note: "Mistake" }))).status).toBe(400);
  const result = await PUT(request({ paidAmount: "-100", kind: "correction", note: "Receipt was entered too high" }));
  expect(result.data.paidAmount).toBe(200);
  expect(result.data.dueAmount).toBe(800);
  for (const value of ["0", "12abc", "1.001"]) expect((await PUT(request({ paidAmount: value }))).status).toBe(400);
});

test("ledger failure rolls back balances", async () => {
  const db = database({ failLedger: true }); getDatabase.mockResolvedValue(db);
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await PUT(request({ paidAmount: "300" }))).status).toBe(500);
    expect(db.state().total_orders[0].paidAmount).toBe(0);
  } finally { log.mockRestore(); }
});
