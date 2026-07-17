import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit")) || 30;

  try {
    const db = await getDatabase();
    const ledger = await db
      .collection("stock_ledger")
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json(ledger);
  } catch (error) {
    console.error("Failed to fetch stock ledger:", error);
    return NextResponse.json(
      { error: "Failed to fetch ledger" },
      { status: 500 }
    );
  }
}