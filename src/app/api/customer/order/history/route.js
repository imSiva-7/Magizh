import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";

const clientPromise = MongoClient.connect(process.env.MONGODB_URI);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const client = await clientPromise;
    const db = client.db("production");
    const collection = db.collection("orders");

    // 1. Build Match Query
    const matchStage = {};
    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = startDate;
      if (endDate) matchStage.date.$lte = endDate;
    }

    // 2. Execute Aggregation for both Data and Totals
    const [results] = await collection.aggregate([
      { $match: matchStage },
      { $sort: { date: -1, createdAt: -1 } },
      {
        $facet: {
          orders: [
            { $project: { _id: { $toString: "$_id" }, customerId: { $toString: "$customerId" }, customerName: 1, date: 1, totalAmount: 1, paymentStatus: 1, items: 1, comment: 1 } }
          ],
          summary: [
            {
              $group: {
                _id: null,
                totalAmount: { $sum: "$totalAmount" },
                orderCount: { $sum: 1 },
                paidAmount: {
                  $sum: { $cond: [{ $eq: ["$paymentStatus", "Paid"] }, "$totalAmount", 0] }
                },
                dueAmount: {
                  $sum: { $cond: [{ $eq: ["$paymentStatus", "Not Paid"] }, "$totalAmount", 0] }
                }
              }
            }
          ]
        }
      }
    ]).toArray();

    const responseData = {
      orders: results.orders || [],
      summary: results.summary[0] || {
        totalAmount: 0,
        orderCount: 0,
        paidAmount: 0,
        dueAmount: 0
      }
    };

    return NextResponse.json(responseData, {
      status: 200,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("Order History Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}