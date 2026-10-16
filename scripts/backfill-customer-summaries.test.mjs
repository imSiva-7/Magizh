import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { backfillCustomerSummaries } from "./backfill-customer-summaries.mjs";

test("backfill defaults to read-only, then applies, verifies and detects a changed counter", async () => {
  const id = new ObjectId();
  const collections = { orders: [{ customerId: id, totalAmount: 200, items: [{ product: "Milk", quantity: 4 }] }], customer_summaries: [] };
  let writes = 0;
  const db = { client: { startSession: () => ({ withTransaction: action => action(), endSession: async () => {} }) }, collection(name) {
    return {
      find: () => ({ toArray: async () => collections[name] }),
      replaceOne: async (_, summary) => { collections[name] = [summary]; writes++; },
      createIndex: async () => { writes++; },
    };
  } };
  assert.equal((await backfillCustomerSummaries(db)).differingSummaries, 1);
  assert.equal(writes, 0);
  await assert.rejects(backfillCustomerSummaries(db, { verify: true }), /differ/);
  await backfillCustomerSummaries(db, { apply: true });
  assert.equal(writes, 4);
  assert.equal((await backfillCustomerSummaries(db, { verify: true })).mode, "Verification passed");
  collections.customer_summaries[0].quantities.milk = 99;
  await assert.rejects(backfillCustomerSummaries(db, { verify: true }), /differ/);
  assert.equal(collections.orders[0].totalAmount, 200);
});
