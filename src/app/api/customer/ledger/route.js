import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import getDatabase from "@/database/connectToMongoDB";

// GET: fetch payment ledger for a specific customer
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json({ error: "customerId is required" }, { status: 400 });
    }

    if (!ObjectId.isValid(customerId)) {
      return NextResponse.json({ error: "Invalid customerId" }, { status: 400 });
    }

    const db = await getDatabase();
    
    const ledger = await db
      .collection("totalOrdersLedger")
      .findOne({ _id: new ObjectId(customerId) });

    if (!ledger) {
      return NextResponse.json({ 
        customerId,
        payments: [] 
      });
    }

    return NextResponse.json({
      customerId: ledger._id,
      payments: ledger.payments || []
    });
  } catch (error) {
    console.error("GET customer ledger error:", error);
    return NextResponse.json({ error: "Failed to fetch ledger" }, { status: 500 });
  }
}
