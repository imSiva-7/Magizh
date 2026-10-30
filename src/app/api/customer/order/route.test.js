import { getServerSession } from "next-auth";
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
beforeEach(() => { getServerSession.mockResolvedValue({ user: { role: "admin" } }); });
import { ObjectId } from "mongodb";
import { POST, PUT, DELETE, GET } from "./route";
import getDatabase from "@/database/connectToMongoDB";

jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("next/server", () => ({ NextResponse: { json: (data, options) => ({ data, status: options?.status || 200 }) } }));

function database(stock, retry = false) {
  let state = { orders: [], stock_ledger: [], stock_balance: [{ _id: "current", milk: stock }], total_orders: [], customer_summaries: [] };
  const clone = value => {
    if (value === null || typeof value !== "object" || value instanceof ObjectId || value instanceof Date) return value;
    if (Array.isArray(value)) return value.map(clone);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  };
  const matches = (row, query) => Object.entries(query).every(([key, value]) => String(row[key]) === String(value));
  const db = { client: { startSession: () => ({
    async withTransaction(action) {
      const previous = clone(state);
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
      async findOne(query) { return clone(state[name].find(row => matches(row, query)) || null); },
      find(query) { return { toArray: async () => clone(state[name].filter(row => matches(row, query))) }; },
      async updateOne(query, update, options) {
        let row = state[name].find(row => matches(row, query));
        if (!row && options?.upsert) { row = { ...query, ...update.$setOnInsert }; state[name].push(row); }
        if (!row) return { matchedCount: 0 };
        Object.assign(row, update.$set);
        for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
        return { matchedCount: 1 };
      },
      async deleteOne(query) {
        const count = state[name].length;
        state[name] = state[name].filter(row => !matches(row, query));
        return { deletedCount: count - state[name].length };
      },
      async replaceOne(query, value) {
        state[name] = state[name].filter(row => !matches(row, query));
        state[name].push(value);
      },
    };
  }, state: () => state };
  return db;
}

const request = () => ({ json: async () => ({ customerId: new ObjectId().toHexString(), date: "2026-10-16", affectStockValue: true, items: [{ product: "Milk", quantity: 2, ratePerUnit: 50, totalAmount: 100 }], totalAmount: 100 }) });

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

test("creation cannot disguise a balance reduction as a negative order", async () => {
  const db = database(10);
  getDatabase.mockResolvedValue(db);
  getServerSession.mockResolvedValue({ user: { role: "employee" } });
  const payload = await request().json();
  expect((await POST({ json: async () => ({ ...payload, totalAmount: -100 }) })).status).toBe(400);
  expect((await POST({ json: async () => ({ ...payload, items: [{ ...payload.items[0], quantity: -2 }] }) })).status).toBe(400);
  expect(db.state().orders).toHaveLength(0);
  expect(db.state().total_orders).toHaveLength(0);
});

test("new orders retain the GST option for later editing", async () => {
  const db = database(10);
  getDatabase.mockResolvedValue(db);
  const payload = await request().json();
  expect((await POST({ json: async () => ({ ...payload, gstType: "exclusive" }) })).status).toBe(201);
  expect(db.state().orders[0]).toMatchObject({ gstType: "exclusive", gstRate: 5 });
  expect((await POST({ json: async () => ({ ...payload, gstType: "invalid" }) })).status).toBe(400);
  expect(db.state().orders).toHaveLength(1);
});

const change = (id, details) => ({ url: `http://localhost/api/customer/order?id=${id}`, json: async () => details });
const item = (quantity, product = "Milk") => ({ product, quantity, ratePerUnit: 50, totalAmount: Number(quantity) * 50 });
async function create(db, details = {}) {
  getDatabase.mockResolvedValue(db);
  const payload = await request().json();
  const result = await POST({ json: async () => ({ ...payload, ...details }) });
  expect(result.status).toBe(201);
  return result.data._id;
}
const ledgerTotal = (db, product) => db.state().stock_ledger.filter(row => row.product === product).reduce((sum, row) => sum + row.quantity, 0);

test.each([false, undefined])("unchecked or missing stock selection %s leaves stock unchanged through create, update and delete", async affectStockValue => {
  const db = database(10);
  const id = await create(db, { affectStockValue });
  expect(db.state().orders[0].affectStockValue).toBe(false);
  expect((await PUT(change(id, { items: [item(6)] }))).status).toBe(200);
  expect((await DELETE(change(id))).status).toBe(200);
  expect(db.state().stock_balance[0].milk).toBe(10);
  expect(db.state().stock_ledger).toHaveLength(0);
});

test("checked order quantity edits and checkbox toggles apply exact reversals", async () => {
  const db = database(10);
  const id = await create(db);
  expect(db.state().stock_balance[0].milk).toBe(8);
  expect((await PUT(change(id, { items:[item(5)] }))).status).toBe(200);
  expect(db.state().stock_balance[0].milk).toBe(5);
  expect((await PUT(change(id, { items:[item(3)] }))).status).toBe(200);
  expect(db.state().stock_balance[0].milk).toBe(7);
  expect((await PUT(change(id, { affectStockValue:false }))).status).toBe(200);
  expect(db.state().stock_balance[0].milk).toBe(10);
  expect((await PUT(change(id, { items:[item(4)] }))).status).toBe(200);
  expect(db.state().stock_balance[0].milk).toBe(10);
  expect((await PUT(change(id, { affectStockValue:true }))).status).toBe(200);
  expect(db.state().stock_balance[0].milk).toBe(6);
  expect(ledgerTotal(db, "milk")).toBe(-4);
  expect((await DELETE(change(id))).status).toBe(200);
  expect(db.state().stock_balance[0].milk).toBe(10);
  expect(ledgerTotal(db, "milk")).toBe(0);
  const length=db.state().stock_ledger.length;
  expect((await DELETE(change(id))).status).toBe(404);
  expect(db.state().stock_ledger).toHaveLength(length);
  expect(db.state().stock_balance[0].milk).toBe(10);
});

test("changing products restores old products and deducts new duplicate product lines together", async () => {
  const db=database(10);
  db.state().stock_balance[0].curd=20;
  const id=await create(db);
  expect((await PUT(change(id,{items:[item(3,"Curd"),item(2,"Curd")]}))).status).toBe(200);
  expect(db.state().stock_balance[0]).toMatchObject({milk:10,curd:15});
  expect((await DELETE(change(id))).status).toBe(200);
  expect(db.state().stock_balance[0]).toMatchObject({milk:10,curd:20});
});

test("date, comment and status-only edits do not change stock twice", async () => {
  const db=database(10), id=await create(db);
  expect((await PUT(change(id,{date:"2026-10-17",comment:"Updated",paymentStatus:"Paid"}))).status).toBe(200);
  expect(db.state().stock_ledger).toHaveLength(1);
  expect(db.state().stock_balance[0].milk).toBe(8);
  expect(db.state().total_orders[0]).toMatchObject({totalOrders:1,totalAmount:100});
});

test("insufficient stock on an edit rolls back the order, original reversal, balance, ledger and summaries", async () => {
  const db=database(10), id=await create(db);
  const before=JSON.stringify(db.state());
  expect((await PUT(change(id,{items:[item(11)]}))).status).toBe(400);
  expect(JSON.stringify(db.state())).toBe(before);
});

test("enabling stock for an oversized order fails without changing the checkbox", async () => {
  const db=database(1), id=await create(db,{affectStockValue:false});
  expect((await PUT(change(id,{affectStockValue:true}))).status).toBe(400);
  expect(db.state().orders[0].affectStockValue).toBe(false);
  expect(db.state().stock_balance[0].milk).toBe(1);
  expect(db.state().stock_ledger).toHaveLength(0);
});

test.each([
  {quantity:-2}, {quantity:0}, {quantity:"not a number"}, {quantity:true},
  {quantity:Infinity}, {quantity:0.00001}, {ratePerUnit:-50}, {totalAmount:-100},
  {product:"Unknown"}, {product:"toString"}, {product:12},
])("invalid edited item %j cannot restore stock or overwrite the order", async details => {
  const db=database(10), id=await create(db);
  const before=JSON.stringify(db.state());
  expect((await PUT(change(id,{items:[{...item(2),...details}]}))).status).toBe(400);
  expect(JSON.stringify(db.state())).toBe(before);
});

test.each([null,"false",0,1])("non-boolean stock selection %s is rejected for create and update", async affectStockValue => {
  const db=database(10), id=await create(db,{affectStockValue:false});
  const payload=await request().json();
  expect((await POST({json:async()=>({...payload,affectStockValue})})).status).toBe(400);
  expect((await PUT(change(id,{affectStockValue}))).status).toBe(400);
  expect(db.state().orders).toHaveLength(1);
  expect(db.state().stock_balance[0].milk).toBe(10);
});

test.each([false,true])("legacy missing stock flag only restores stock when there is ledger evidence: %s", async affected => {
  const db=database(10), id=await create(db,{affectStockValue:affected});
  delete db.state().orders[0].affectStockValue;
  const response=await GET({url:`http://localhost/api/customer/order?id=${id}`});
  expect(response.data.affectStockValue).toBe(affected);
  expect((await DELETE(change(id))).data.stockRestored).toBe(affected);
  expect(db.state().stock_balance[0].milk).toBe(10);
});

test("fractional quantities can exactly exhaust and restore stock", async () => {
  const db=database(0.3);
  const first=await create(db,{items:[item(0.1)],totalAmount:5});
  const second=await create(db,{items:[item(0.2)],totalAmount:10});
  expect(db.state().stock_balance[0].milk).toBe(0);
  expect((await DELETE(change(first))).status).toBe(200);
  expect((await DELETE(change(second))).status).toBe(200);
  expect(db.state().stock_balance[0].milk).toBe(0.3);
});
