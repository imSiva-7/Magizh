import { requireSummaryAdmin } from "@/lib/summary-auth";
import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { productSalesSummary } from "@/lib/customer-products";
import { paymentPeriodRange } from "@/lib/customer-payment-period.mjs";

export async function GET(request) {
  const denied = await requireSummaryAdmin();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const { orderMatch: matchStage } = paymentPeriodRange(startDate, endDate);
    const db = await getDatabase();

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
              $cond: [{ $ne: ["$paymentStatus", "Paid"] }, "$totalAmount", 0]
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
          totalQuantity: { $sum: { $convert: { input: "$items.quantity", to: "decimal", onError: 0, onNull: 0 } } },
          totalAmount: { $sum: { $convert: { input: "$items.totalAmount", to: "decimal", onError: 0, onNull: 0 } } }
        }
      },
      { $sort: { totalAmount: -1 } },
      { $project: { totalQuantity: { $convert: { input: { $round: ["$totalQuantity", 4] }, to: "double" } }, totalAmount: { $convert: { input: { $round: ["$totalAmount", 2] }, to: "double" } } } }
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
              $cond: [{ $ne: ["$paymentStatus", "Paid"] }, "$totalAmount", 0]
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

    const productSales = productSalesSummary(productStats.map(product => ({ name: product._id, quantity: product.totalQuantity, amount: product.totalAmount })));
    return NextResponse.json({
      daily: dailyStats.map(d => ({
        date: d._id,
        orders: d.totalOrders,
        items: d.totalItems,
        amount: d.totalAmount,
        paid: d.paidAmount,
        due: d.dueAmount
      })),
      products: productSales.products,
      payment: paymentStats.map(p => ({
        status: p._id,
        count: p.count,
        amount: p.total
      })),
      overall: { ...overall, litresSold: productSales.litres, kilogramsSold: productSales.kilograms }
    });
  } catch (error) {
    if (error.status === 400) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Order analytics API error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
