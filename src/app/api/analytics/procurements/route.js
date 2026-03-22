import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const client = await clientPromise;
    const db = client.db("production");

    // Build date filter
    const matchStage = {};
    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = startDate;
      if (endDate) matchStage.date.$lte = endDate;
    }

    // Aggregation pipeline
    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: "$date",
          totalMilk: { $sum: "$milkQuantity" },
          totalAmount: { $sum: "$totalAmount" },
          avgFat: { $avg: "$fatPercentage" },
          avgSnf: { $avg: "$snfPercentage" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const dailyStats = await db
      .collection("procurements")
      .aggregate(pipeline)
      .toArray();

    // Get overall summary
    const overall = await db
      .collection("procurements")
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalMilk: { $sum: "$milkQuantity" },
            totalAmount: { $sum: "$totalAmount" },
            totalRecords: { $sum: 1 }
          }
        }
      ])
      .toArray();

    return NextResponse.json({
      daily: dailyStats.map(d => ({
        date: d._id,
        milk: d.totalMilk,
        amount: d.totalAmount,
        avgFat: d.avgFat.toFixed(1),
        avgSnf: d.avgSnf.toFixed(1)
      })),
      overall: overall[0] || { totalMilk: 0, totalAmount: 0, totalRecords: 0 }
    });
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}