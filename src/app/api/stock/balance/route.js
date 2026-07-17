import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";

export async function GET() {
  const db = await getDatabase();
  const balance = await db.collection("stock_balance").findOne({ _id: "current" });
  return NextResponse.json(balance || {});
}