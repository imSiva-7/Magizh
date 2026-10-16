import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import {
  paymentPeriodPipelines,
  combinePaymentPeriod,
  paymentCardTrends,
} from "./customer-payment-period.mjs";

test(
  "Mongo payment-period reports use order dates and India receipt-day boundaries, never opening balances",
  { skip: process.env.RUN_MONGO_INTEGRATION !== "true", timeout: 45000 },
  async () => {
    dotenv.config({ path: ".env.local", quiet: true });
    const client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
    });
    const name = `codex_period_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const db = client.db(name),
      a = new ObjectId(),
      b = new ObjectId();
    let connected = false;
    try {
      await client.connect();
      connected = true;
      await db.collection("orders").insertMany([
        {
          customerId: a,
          date: "2026-09-30",
          totalAmount: 90000,
          paymentStatus: "Not Paid",
        },
        {
          customerId: a,
          date: "2026-10-15",
          totalAmount: "1000.00",
          paymentStatus: "Paid",
        },
        {
          customerId: a,
          date: "2026-10-16",
          totalAmount: 2000,
          paymentStatus: "Not Paid",
        },
      ]);
      await db.collection("totalOrdersLedger").insertMany([
        {
          _id: a,
          payments: [
            { date: new Date("2026-10-15T00:00:00+05:30"), amount: 200 },
            { date: "2026-10-15T12:00:00+05:30", amount: "100.00" },
            {
              date: new Date("2026-10-15T20:00:00+05:30"),
              amount: -50,
              kind: "correction",
            },
            { date: new Date("2026-10-14T23:59:59+05:30"), amount: 500 },
            { date: new Date("2026-10-16T00:00:00+05:30"), amount: 300 },
            { date: "unknown legacy date", amount: 999 },
          ],
        },
        {
          _id: b,
          payments: [
            { date: new Date("2026-10-15T09:00:00+05:30"), amount: 400 },
          ],
        },
      ]);
      const pipelines = paymentPeriodPipelines("2026-10-15", "2026-10-15");
      const [orders, receipts] = await Promise.all([
        db.collection("orders").aggregate(pipelines.orders).toArray(),
        db
          .collection("totalOrdersLedger")
          .aggregate(pipelines.receipts)
          .toArray(),
      ]);
      const result = combinePaymentPeriod(orders, receipts);
      assert.deepEqual(result.overall, {
        totalOrders: 1,
        totalAmount: 1000,
        receiptCount: 4,
        receivedAmount: 650,
        netChange: 350,
      });
      assert.equal(
        result.customers.find((row) => row.customerId === String(a))
          .receivedAmount,
        250,
      );
      const receiptOnly = result.customers.find(
        (row) => row.customerId === String(b),
      );
      assert.equal(receiptOnly.totalOrders, 0);
      assert.equal(receiptOnly.netChange, -400);
      assert.deepEqual(paymentCardTrends(result.customers), {
        totalOrders: [{ date: "2026-10-15", value: 1 }],
        totalAmount: [{ date: "2026-10-15", value: 1000 }],
        receivedAmount: [{ date: "2026-10-15", value: 650 }],
        netChange: [{ date: "2026-10-15", value: 350 }],
      });
      assert.equal(
        result.customers.some(
          (row) => "dueAmount" in row || "creditAmount" in row,
        ),
        false,
      );
    } finally {
      try {
        assert.match(name, /^codex_period_[a-f0-9]{16}$/);
        if (connected)
          for (const collection of await db
            .listCollections({}, { nameOnly: true })
            .toArray())
            await db.collection(collection.name).drop();
      } finally {
        await client.close();
      }
    }
  },
);
