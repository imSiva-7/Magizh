import { ObjectId } from "mongodb";
import { generateSubscriptionDate, generateDueSubscriptions } from "./customer-subscriptions";

const clone = value => value instanceof ObjectId ? new ObjectId(String(value)) : value instanceof Date ? new Date(value) : Array.isArray(value) ? value.map(clone) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
const matches = (row, query) => Object.entries(query).every(([key, value]) => value && typeof value === "object" && "$lte" in value ? row[key] <= value.$lte : String(row[key]) === String(value));
function database(stock = 20) {
  const customerId = new ObjectId(), subscriptionId = new ObjectId();
  let state = {
    customers: [{ _id: customerId, customerName: "Test Customer" }],
    customer_subscriptions: [{ _id: subscriptionId, customerId, customerName: "Test Customer", status: "active", startDate: "2026-10-23", nextDate: "2026-10-23", weekdays: [0,1,2,3,4,5,6], items: [{ product: "Milk", quantity: 2, ratePerUnit: 50 }], gstType: "inclusive", affectStockValue: true }],
    stock_balance: [{ _id: "current", milk: stock }],
  };
  const db = { subscriptionId, state: () => state, client: { startSession: () => ({
    async withTransaction(action) { const previous = clone(state); try { return await action(); } catch (error) { state = previous; throw error; } },
    async endSession() {},
  }) }, collection(name) {
    state[name] ||= [];
    return {
      async findOne(query) { return clone(state[name].find(row => matches(row, query)) || null); },
      find(query) { let rows = state[name].filter(row => matches(row, query)); const cursor = { sort() { return cursor; }, limit(n) { rows = rows.slice(0, n); return cursor; }, async toArray() { return clone(rows); } }; return cursor; },
      async countDocuments(query) { return state[name].filter(row => matches(row, query)).length; },
      async insertOne(value) {
        value._id ||= new ObjectId();
        if (state[name].some(row => String(row._id) === String(value._id))) throw Object.assign(new Error("Duplicate key"), { code: 11000 });
        state[name].push(clone(value)); return { insertedId: value._id };
      },
      async insertMany(values) { state[name].push(...clone(values)); },
      async updateOne(query, update, options) {
        let row = state[name].find(row => matches(row, query));
        if (!row && options?.upsert) { row = { ...query, ...clone(update.$setOnInsert) }; state[name].push(row); }
        if (!row) return { matchedCount: 0 };
        Object.assign(row, clone(update.$set));
        for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
        return { matchedCount: 1 };
      },
      async replaceOne(query, value) { state[name] = state[name].filter(row => !matches(row, query)); state[name].push(clone(value)); },
    };
  } };
  return db;
}
test("generated order updates stock and balances once across repeated runs", async () => {
  const db = database();
  expect((await generateSubscriptionDate(db, db.subscriptionId, "2026-10-23")).outcome).toBe("created");
  expect((await generateSubscriptionDate(db, db.subscriptionId, "2026-10-23")).outcome).toBe("idle");
  expect(db.state().orders).toHaveLength(1);
  expect(db.state().stock_balance[0].milk).toBe(18);
  expect(db.state().customer_summaries[0]).toMatchObject({ totalAmount: 100, orderDueAmount: 100 });
  expect(db.state().orders[0]).toMatchObject({ subscriptionId: db.subscriptionId, date: "2026-10-23", paymentStatus: "Not Paid" });
});
test("stock failure rolls back claim, order, balance and cursor; retry then succeeds", async () => {
  const db = database(1);
  await expect(generateSubscriptionDate(db, db.subscriptionId, "2026-10-23")).rejects.toThrow("Insufficient stock");
  expect(db.state().orders || []).toHaveLength(0);
  expect(db.state().subscription_runs || []).toHaveLength(0);
  expect(db.state().customer_subscriptions[0].nextDate).toBe("2026-10-23");
  db.state().stock_balance[0].milk = 10;
  expect((await generateSubscriptionDate(db, db.subscriptionId, "2026-10-23")).outcome).toBe("created");
});
test("a processed delivery is never recreated after its order is removed", async () => {
  const db = database(); await generateSubscriptionDate(db, db.subscriptionId, "2026-10-23");
  db.state().orders = []; db.state().customer_subscriptions[0].nextDate = "2026-10-23";
  expect((await generateSubscriptionDate(db, db.subscriptionId, "2026-10-23")).outcome).toBe("existing");
  expect(db.state().orders).toHaveLength(0);
  expect(db.state().stock_balance[0].milk).toBe(18);
});
test.each(["paused", "cancelled", "completed"])("%s subscriptions do not generate orders", async status => {
  const db = database(); db.state().customer_subscriptions[0].status = status;
  expect((await generateSubscriptionDate(db, db.subscriptionId, "2026-10-23")).outcome).toBe("idle");
  expect(db.state().orders || []).toHaveLength(0);
});
test("skipped delivery advances cursor and end date completes the subscription", async () => {
  const db = database(); Object.assign(db.state().customer_subscriptions[0], { skipDates: ["2026-10-23"], endDate: "2026-10-23" });
  expect((await generateSubscriptionDate(db, db.subscriptionId, "2026-10-23")).outcome).toBe("skipped");
  expect(db.state().customer_subscriptions[0].status).toBe("completed");
  expect(db.state().orders || []).toHaveLength(0);
});
test("catch-up processes due dates only and preserves unpaid orders", async () => {
  const db = database();
  expect(await generateDueSubscriptions(db, "2026-10-25")).toMatchObject({ created: 3, errors: [], remaining: 0 });
  expect(db.state().orders.map(order => order.date)).toEqual(["2026-10-23", "2026-10-24", "2026-10-25"]);
  expect(db.state().total_orders.find(row => row._id === "global").totalAmount).toBe(300);
});
