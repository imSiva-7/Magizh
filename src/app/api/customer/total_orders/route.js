import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import getDatabase from "@/database/connectToMongoDB";

// GET: fetch a specific customer's totals or all customer totals
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const global = searchParams.get("global") === "true";

    const db = await getDatabase();

    if (customerId) {
      if (!ObjectId.isValid(customerId)) {
        return NextResponse.json({ error: "Invalid customerId" }, { status: 400 });
      }
      const customerTotals = await db
        .collection("total_orders")
        .findOne({ _id: new ObjectId(customerId) });
      return NextResponse.json(customerTotals || null);
    }

    if (global) {
      const globalTotals = await db
        .collection("total_orders")
        .findOne({ _id: "global" });
      return NextResponse.json(globalTotals || null);
    }

    // Return all customer totals (excluding global)
    const all = await db
      .collection("total_orders")
      .find({ _id: { $ne: "global" } })
      .toArray();
    return NextResponse.json(all);
  } catch (error) {
    console.error("GET total-orders error:", error);
    return NextResponse.json({ error: "Failed to fetch totals" }, { status: 500 });
  }
}

// PUT: update paidAmount for a customer (or global)
export async function PUT(request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const data = await request.json();
    const { paidAmount } = data;

    if (paidAmount === undefined || isNaN(parseFloat(paidAmount)) ) {
      return NextResponse.json({ error: "Valid paidAmount required" }, { status: 400 });
    }

    const db = await getDatabase();
    const targetId = customerId ? new ObjectId(customerId) : "global";

    const doc = await db.collection("total_orders").findOne({ _id: targetId });
    if (!doc) {
      return NextResponse.json({ error: "Totals not found" }, { status: 404 });
    }

    const newPaid = parseFloat(paidAmount);
    const newDue = doc.totalAmount - (doc.paidAmount + newPaid);

    if (newDue < 0) {
      return NextResponse.json({ error: "Paid amount cannot exceed total amount" }, { status: 400 });
    }

    await db.collection("total_orders").updateOne(
      { _id: targetId },
      { $set: { paidAmount: doc.paidAmount + newPaid, dueAmount: newDue, updatedAt: new Date() } }
    );

    return NextResponse.json({ message: "Balance updated" });
  } catch (error) {
    console.error("PUT total-orders error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}