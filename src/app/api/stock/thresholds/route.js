import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";

// GET
export async function GET() {
  const db = await getDatabase();
  const doc = await db.collection("settings").findOne({ _id: "stock_alerts" });
  return NextResponse.json(doc || { thresholds: {} });
}

// PUT
export async function PUT(request) {
  const db = await getDatabase();
  const { thresholds } = await request.json();
  await db.collection("settings").updateOne(
    { _id: "stock_alerts" },
    { $set: { thresholds } },
    { upsert: true }
  );
  return NextResponse.json({ success: true });
}