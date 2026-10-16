import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import getDatabase from "@/database/connectToMongoDB";
import { moneyCents, paymentBalance } from "@/lib/customer-payments.mjs";
import { withCustomerTransaction } from "@/lib/customer-transaction.mjs";

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

        // const customerTotalsLedger = await db.collection(totalOrdersLedger).find();
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

// PUT: record an amount received or a correction, never an order status.
export async function PUT(request) {
  try {
    const customerId = new URL(request.url).searchParams.get("customerId");
    if (!customerId || !ObjectId.isValid(customerId)) return NextResponse.json({ error: "Valid customerId required" }, { status: 400 });
    const data = await request.json();
    let cents;
    try { cents = moneyCents(data.paidAmount); }
    catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
    if (cents === 0) return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    const kind = data.kind || (cents < 0 ? "correction" : "payment");
    if (!["payment", "correction"].includes(kind) || (kind === "payment" && cents < 0)) return NextResponse.json({ error: "Use a correction to reduce a previous payment" }, { status: 400 });
    const note = typeof data.note === "string" ? data.note.trim() : "";
    if (kind === "correction" && !note) return NextResponse.json({ error: "A reason is required for corrections" }, { status: 400 });
    const method = data.method || "Cash";
    if (!["Cash", "UPI", "Bank transfer", "Cheque", "Other"].includes(method)) return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    const reference = typeof data.reference === "string" ? data.reference.trim() : "";
    if (note.length > 500 || reference.length > 100) return NextResponse.json({ error: "Payment details are too long" }, { status: 400 });
    const paymentId = data.paymentId || new ObjectId().toHexString();
    if (typeof paymentId !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(paymentId)) return NextResponse.json({ error: "Invalid payment ID" }, { status: 400 });
    const amount = cents / 100;
    const database = await getDatabase();
    return await withCustomerTransaction(database, async (db) => {
      const targetId = new ObjectId(customerId);
      const previous = await db.collection("totalOrdersLedger").findOne(
        { _id: targetId, "payments.paymentId": paymentId },
        { projection: { payments: { $elemMatch: { paymentId } } } }
      );
      const receipt = previous?.payments?.[0];
      if (receipt) {
        if (receipt.amount !== amount || receipt.kind !== kind || receipt.method !== method || receipt.reference !== reference || receipt.note !== note) return NextResponse.json({ error: "Payment ID was already used for different details" }, { status: 409 });
        const current = await db.collection("total_orders").findOne({ _id: targetId });
        return NextResponse.json({ message: "Payment already recorded", paymentId, paidAmount: current?.paidAmount, dueAmount: current?.dueAmount });
      }
      const doc = await db.collection("total_orders").findOne({ _id: targetId });
      if (!doc) return NextResponse.json({ error: "Customer totals not found" }, { status: 404 });
      let balances;
      try { balances = paymentBalance(doc.totalAmount, doc.paidAmount, amount); }
      catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
      const ledgerEntry = { paymentId, date: new Date(), amount, kind, method, reference, note,
        previousBalance: Number(doc.paidAmount || 0), newBalance: balances.paidAmount,
        previousDue: Math.round((Number(doc.totalAmount || 0) - Number(doc.paidAmount || 0)) * 100) / 100, newDue: balances.dueAmount };
      await db.collection("total_orders").updateOne({ _id: targetId }, { $set: { ...balances, updatedAt: new Date() } });
      await db.collection("totalOrdersLedger").updateOne({ _id: targetId }, { $push: { payments: ledgerEntry } }, { upsert: true });
      await db.collection("total_orders").updateOne({ _id: "global" }, { $inc: { paidAmount: amount, dueAmount: -amount }, $set: { updatedAt: new Date() } });
      return NextResponse.json({ message: kind === "correction" ? "Correction recorded" : "Payment recorded", paymentId, ...balances });
    });
  } catch (error) {
    console.error("PUT total-orders error:", error);
    return NextResponse.json({ error: "Payment could not be recorded" }, { status: 500 });
  }
}
