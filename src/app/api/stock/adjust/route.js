import { getTodayDate } from "@/lib/india-date.mjs";
import { STOCK_PRODUCTS } from "@/lib/stock";
import { requireStaff } from "@/lib/mutation-auth";

import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";

export async function POST(request) {
  const denied = await requireStaff();
  if (denied) return denied;
  const { product, quantity, comment } = await request.json();

  if (!product || quantity === undefined || quantity === null) {
    return NextResponse.json({ error: "Product and quantity required" }, { status: 400 });
  }

  if (!STOCK_PRODUCTS.some(item => item.field === product)) {
    return NextResponse.json({ error: "Product is not tracked in stock" }, { status: 400 });
  }

  const qty = parseFloat(quantity);
  if (isNaN(qty) || qty === 0) {
    return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
  }

  const db = await getDatabase();

  // Insert ledger entry
  await db.collection("stock_ledger").insertOne({
    type: "adjustment",
    product,
    quantity: qty,
    comment: comment || "",
    date: getTodayDate(),
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
