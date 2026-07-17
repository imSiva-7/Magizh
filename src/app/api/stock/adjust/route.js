
import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";

export async function POST(request) {
  const db = await getDatabase();
  const { product, quantity, comment } = await request.json();

  if (!product || quantity === undefined || quantity === null) {
    return NextResponse.json({ error: "Product and quantity required" }, { status: 400 });
  }

  const qty = parseFloat(quantity);
  if (isNaN(qty) || qty === 0) {
    return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
  }

  // Insert ledger entry
  await db.collection("stock_ledger").insertOne({
    type: "adjustment",
    product,
    quantity: qty,
    comment: comment || "",
    date: new Date().toISOString().split("T")[0],
    createdAt: new Date(),
  });

  // Update balance
  await db.collection("stock_balance").updateOne(
    { _id: "current" },
    { $inc: { [product]: qty }, $set: { updatedAt: new Date() } },
    { upsert: true }
  );

  return NextResponse.json({ success: true });
}