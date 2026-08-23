// scripts/populateTotalOrders.js
const { MongoClient } = require("mongodb");
require("dotenv").config({path: ".env.local"});


console.log("Starting migration...");

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "production";

const productToTotalField = {
  "Milk": "milkTotalQuantity",
  "Butter": "butterTotalQuantity",
  "Fresh Cream": "freshCreamTotalQuantity",
  "Curd": "curdTotalQuantity",
  "Ghee": "gheeTotalQuantity",
  "Soft Paneer": "softPaneerTotalQuantity",
  "Premium Paneer": "premiumPaneerTotalQuantity",
};

async function migrate() {
  if (!MONGODB_URI) {
    console.error("Missing MONGODB_URI. Check .env.local file.");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log("Fetching orders...");
  const orders = await db.collection("orders").find({}).toArray();

  const customerMap = new Map();
  const globalAgg = {
    totalAmount: 0,
    paidAmount: 0,
    dueAmount: 0,
    totalOrders: 0,
    milkTotalQuantity: 0,
    butterTotalQuantity: 0,
    freshCreamTotalQuantity: 0,
    curdTotalQuantity: 0,
    gheeTotalQuantity: 0,
    softPaneerTotalQuantity: 0,
    premiumPaneerTotalQuantity: 0,
  };

  for (const order of orders) {
    const customerId = order.customerId.toString();
    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, {
        _id: order.customerId,
        customerName: order.customerName || "",
        customerType: order.customerType || "",
        totalAmount: 0,
        paidAmount: 0,
        dueAmount: 0,
        totalOrders: 0,
        milkTotalQuantity: 0,
        butterTotalQuantity: 0,
        freshCreamTotalQuantity: 0,
        curdTotalQuantity: 0,
        gheeTotalQuantity: 0,
        softPaneerTotalQuantity: 0,
        premiumPaneerTotalQuantity: 0,
      });
    }

    const cust = customerMap.get(customerId);
    const total = order.totalAmount || 0;
    cust.totalAmount += total;
    cust.totalOrders += 1;

    if (order.paymentStatus === "Paid") {
      cust.paidAmount += total;
    }

    for (const item of order.items || []) {
      const field = productToTotalField[item.product];
      if (field) {
        const qty = parseFloat(item.quantity) || 0;
        cust[field] += qty;
        globalAgg[field] += qty;
      }
    }

    globalAgg.totalAmount += total;
    globalAgg.totalOrders += 1;
    if (order.paymentStatus === "Paid") {
      globalAgg.paidAmount += total;
    }
  }

  for (const [_, cust] of customerMap) {
    cust.dueAmount = cust.totalAmount - cust.paidAmount;
    cust.updatedAt = new Date();
  }
  globalAgg.dueAmount = globalAgg.totalAmount - globalAgg.paidAmount;
  globalAgg.updatedAt = new Date();

  const bulkOps = [];
  for (const [_, cust] of customerMap) {
    bulkOps.push({
      updateOne: {
        filter: { _id: cust._id },
        update: { $set: cust },
        upsert: true,
      },
    });
  }
  bulkOps.push({
    updateOne: {
      filter: { _id: "global" },
      update: { $set: globalAgg },
      upsert: true,
    },
  });

  await db.collection("total_orders").bulkWrite(bulkOps);
  console.log(`Migration complete: ${customerMap.size} customers + global document created/updated.`);
  await client.close();
  process.exit(0);
}

migrate().catch((error) => {
  console.error("Migration failed:", error.stack || error);
  process.exit(1);
});