import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

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

    // Daily aggregation
    const dailyPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: "$date",
          totalOrders: { $sum: 1 },
          totalItems: { $sum: { $size: "$items" } },
          totalAmount: { $sum: "$totalAmount" },
          paidAmount: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "Paid"] }, "$totalAmount", 0]
            }
          },
          dueAmount: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "Not Paid"] }, "$totalAmount", 0]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const dailyStats = await db
      .collection("orders")
      .aggregate(dailyPipeline)
      .toArray();

    // Product breakdown: flatten items and group by product
    const productPipeline = [
      { $match: matchStage },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          totalQuantity: { $sum: "$items.quantity" },
          totalAmount: { $sum: "$items.totalAmount" }
        }
      },
      { $sort: { totalAmount: -1 } }
    ];

    const productStats = await db
      .collection("orders")
      .aggregate(productPipeline)
      .toArray();

    // Payment status summary
    const paymentPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: "$paymentStatus",
          count: { $sum: 1 },
          total: { $sum: "$totalAmount" }
        }
      }
    ];

    const paymentStats = await db
      .collection("orders")
      .aggregate(paymentPipeline)
      .toArray();

    // Overall summary
    const overallPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalItems: { $sum: { $size: "$items" } },
          totalAmount: { $sum: "$totalAmount" },
          paidAmount: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "Paid"] }, "$totalAmount", 0]
            }
          },
          dueAmount: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "Not Paid"] }, "$totalAmount", 0]
            }
          }
        }
      }
    ];

    const overallResult = await db
      .collection("orders")
      .aggregate(overallPipeline)
      .toArray();

    const overall = overallResult[0] || {
      totalOrders: 0,
      totalItems: 0,
      totalAmount: 0,
      paidAmount: 0,
      dueAmount: 0
    };

    return NextResponse.json({
      daily: dailyStats.map(d => ({
        date: d._id,
        orders: d.totalOrders,
        items: d.totalItems,
        amount: d.totalAmount,
        paid: d.paidAmount,
        due: d.dueAmount
      })),
      products: productStats.map(p => ({
        name: p._id,
        quantity: p.totalQuantity,
        amount: p.totalAmount
      })),
      payment: paymentStats.map(p => ({
        status: p._id,
        count: p.count,
        amount: p.total
      })),
      overall
    });
  } catch (error) {
    console.error("Order analytics API error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}