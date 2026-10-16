import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import { buildCustomerSummary, CUSTOMER_SUMMARIES } from "../src/lib/customer-summaries.mjs";
import { withCustomerTransaction } from "../src/lib/customer-transaction.mjs";

export async function backfillCustomerSummaries(db, { apply = false, verify = false } = {}) {
  const run = async (database) => {
    const orders = await database.collection("orders").find({}).toArray();
    const stored = await database.collection(CUSTOMER_SUMMARIES).find({}).toArray();
    const storedById = new Map(stored.map(summary => [String(summary._id), summary]));
    const groups = new Map(stored.map(summary => [String(summary._id), { id: summary._id, orders: [] }]));
    for (const order of orders) {
      if (!order.customerId?.toHexString) throw new Error("Order has invalid customerId; correct source data before backfill");
      const id = String(order.customerId);
      if (!groups.has(id)) groups.set(id, { id: order.customerId, orders: [] });
      groups.get(id).orders.push(order);
    }
    const expected = [...groups.values()].map(group => buildCustomerSummary(group.id, group.orders));
    const differs = expected.filter(summary => {
      const actual = storedById.get(String(summary._id));
      return !actual || Object.entries(summary).some(([key, value]) => key !== "_id" && key !== "customerId" && JSON.stringify(actual[key]) !== JSON.stringify(value));
    });
    if (verify && differs.length) throw new Error(`${differs.length} customer summaries differ from current orders`);
    if (apply) for (const summary of expected) await database.collection(CUSTOMER_SUMMARIES).replaceOne({ _id: summary._id }, { ...summary, updatedAt: new Date() }, { upsert: true });
    return { orders: orders.length, customers: expected.length, differingSummaries: differs.length, mode: verify ? "Verification passed" : apply ? "Applied" : "Dry run; no changes" };
  };
  const result = await withCustomerTransaction(db, run);
  if (apply) {
    await db.collection("orders").createIndex({ customerId: 1, date: -1, createdAt: -1 });
    await db.collection("orders").createIndex({ date: -1, createdAt: -1 });
    await db.collection("orders").createIndex({ customerId: 1, paymentStatus: 1, date: -1 });
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const flags = process.argv.slice(2);
  if (flags.some(flag => !["--dry-run", "--apply", "--verify"].includes(flag)) || flags.length > 1) throw new Error("Choose --dry-run, --apply or --verify");
  dotenv.config({ path: ".env.local", quiet: true });
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    console.log(await backfillCustomerSummaries(client.db(process.env.MONGODB_DB || "production"), { apply: flags.includes("--apply"), verify: flags.includes("--verify") }));
  } finally { await client.close(); }
}
