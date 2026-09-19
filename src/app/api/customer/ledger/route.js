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
    
    // Use aggregation to sort the payments array in MongoDB itself
    const result = await db
      .collection("totalOrdersLedger")
      .aggregate([
        { $match: { _id: new ObjectId(customerId) } },
        {
          $project: {
            _id: 1,
            payments: {
              $sortArray: {
                input: "$payments",
                sortBy: { date: -1 }  // -1 for descending (newest first)
              }
            }
          }
        }
      ])
      .toArray();

    if (!result || result.length === 0) {
      return NextResponse.json({ 
        customerId,
        payments: [] 
      });
    }

    return NextResponse.json({
      customerId: result[0]._id,
      payments: result[0].payments || []
    });
  } catch (error) {
    console.error("GET customer ledger error:", error);
    return NextResponse.json({ error: "Failed to fetch ledger" }, { status: 500 });
  }
}
