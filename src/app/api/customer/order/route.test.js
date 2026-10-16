import { ObjectId } from "mongodb";
import { POST } from "./route";
import getDatabase from "@/database/connectToMongoDB";

jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("next/server", () => ({ NextResponse: { json: (data, options) => ({ data, status: options?.status || 200 }) } }));

function database(stock, retry = false) {
  let state = { orders: [], stock_ledger: [], stock_balance: [{ _id: "current", milk: stock }], total_orders: [], customer_summaries: [] };
  const matches = (row, query) => Object.entries(query).every(([key, value]) => String(row[key]) === String(value));
  const db = { client: { startSession: () => ({
    async withTransaction(action) {
      const previous = Object.fromEntries(Object.entries(state).map(([key, rows]) => [key, rows.map(row => ({ ...row }))]));
      try {
        if (retry) { await action(); state = previous; }
        return await action();
      } catch (error) { state = previous; throw error; }
    },
    async endSession() {},
  }) }, collection(name) {
    state[name] ||= [];
    return {
      async insertOne(value) { value._id ||= new ObjectId(); state[name].push({ ...value }); return { insertedId: value._id }; },
      async insertMany(values) { state[name].push(...values); },
      async findOne(query) { return state[name].find(row => matches(row, query)) || null; },
      find(query) { return { toArray: async () => state[name].filter(row => matches(row, query)) }; },
      async updateOne(query, update, options) {
        let row = state[name].find(row => matches(row, query));
        if (!row && options?.upsert) { row = { ...query, ...update.$setOnInsert }; state[name].push(row); }
        if (!row) return { matchedCount: 0 };
        Object.assign(row, update.$set);
        for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
        return { matchedCount: 1 };
      },
      async replaceOne(query, value) {
        state[name] = state[name].filter(row => !matches(row, query));
        state[name].push(value);
      },
    };
  }, state: () => state };
  return db;
}

const request = () => ({ json: async () => ({ customerId: new ObjectId().toHexString(), date: "2026-10-16", items: [{ product: "Milk", quantity: 2, ratePerUnit: 50, totalAmount: 100 }], totalAmount: 100 }) });

test("insufficient stock rolls back the order inserted before stock validation", async () => {
  const db = database(1);
  getDatabase.mockResolvedValue(db);
  const response = await POST(request());
  expect(response.status).toBe(400);
  expect(db.state().orders).toHaveLength(0);
  expect(db.state().customer_summaries).toHaveLength(0);
  expect(db.state().total_orders).toHaveLength(0);
  expect(db.state().stock_balance[0].milk).toBe(1);
});

test("a saved order updates stock, account totals and customer summary together", async () => {
  const db = database(10);
  getDatabase.mockResolvedValue(db);
  expect((await POST(request())).status).toBe(201);
  expect(db.state().orders).toHaveLength(1);
  expect(db.state().stock_ledger).toHaveLength(1);
  expect(db.state().stock_balance[0].milk).toBe(8);
  expect(db.state().total_orders).toHaveLength(2);
  expect(db.state().customer_summaries[0]).toMatchObject({ totalOrders: 1, totalAmount: 100, orderDueAmount: 100, quantities: { milk: 2 } });
});

test("transaction retries reuse the parsed request and commit a single order", async () => {
  const db = database(10, true);
  getDatabase.mockResolvedValue(db);
  const payload = await request().json();
  const json = jest.fn().mockResolvedValueOnce(payload).mockRejectedValue(new Error("Request body already consumed"));
  expect((await POST({ json })).status).toBe(201);
  expect(json).toHaveBeenCalledTimes(1);
  expect(db.state().orders).toHaveLength(1);
  expect(db.state().stock_balance[0].milk).toBe(8);
});
