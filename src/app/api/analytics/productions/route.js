import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

const VALID_PRODUCTS = [
  "milk",
  "fat",
  "snf",
  "curd",
  "premium_paneer",
  "soft_paneer",
  "butter",
  "cream",
  "ghee",
];

const PERCENTAGE_FIELDS = ["fat", "snf"];

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

    // Daily aggregation pipeline
    const dailyPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: "$date",
          batchCount: { $sum: 1 },
          // Milk quantity
          milk: { $sum: "$milk_quantity" },
          // Fat & SNF percentages (averages)
          fat: { $avg: "$fat_percentage" },
          snf: { $avg: "$snf_percentage" },
          // Other products
          curd: { $sum: "$curd_quantity" },
          premium_paneer: { $sum: "$premium_paneer_quantity" },
          soft_paneer: { $sum: "$soft_paneer_quantity" },
          butter: { $sum: "$butter_quantity" },
          cream: { $sum: "$cream_quantity" },
          ghee: { $sum: "$ghee_quantity" },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const dailyStats = await db
      .collection("entries")
      .aggregate(dailyPipeline)
      .toArray();

    // Overall totals (all products)
    const overallPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalBatches: { $sum: 1 },
          milk: { $sum: "$milk_quantity" },
          curd: { $sum: "$curd_quantity" },
          premium_paneer: { $sum: "$premium_paneer_quantity" },
          soft_paneer: { $sum: "$soft_paneer_quantity" },
          butter: { $sum: "$butter_quantity" },
          cream: { $sum: "$cream_quantity" },
          ghee: { $sum: "$ghee_quantity" },
          avgFat: { $avg: "$fat_percentage" },
          avgSnf: { $avg: "$snf_percentage" },
        },
      },
    ];

    const overallResult = await db
      .collection("entries")
      .aggregate(overallPipeline)
      .toArray();

    const overall = overallResult[0] || {
      totalBatches: 0,
      milk: 0,
      curd: 0,
      premium_paneer: 0,
      soft_paneer: 0,
      butter: 0,
      cream: 0,
      ghee: 0,
      avgFat: 0,
      avgSnf: 0,
    };

    // Product breakdown for pie chart
    const productBreakdown = [
    //   { name: "Milk", quantity: overall.milk },
      { name: "Curd", quantity: overall.curd },
      { name: "Premium Paneer", quantity: overall.premium_paneer },
      { name: "Soft Paneer", quantity: overall.soft_paneer },
      { name: "Butter", quantity: overall.butter },
      { name: "Cream", quantity: overall.cream },
      { name: "Ghee", quantity: overall.ghee },
    ].filter(p => p.quantity > 0);

    // Format daily data for frontend
    const daily = dailyStats.map(d => ({
      date: d._id,
      batches: d.batchCount,
      milk: d.milk || 0,
      fat: d.fat ? d.fat.toFixed(1) : 0,
      snf: d.snf ? d.snf.toFixed(1) : 0,
      curd: d.curd || 0,
      premium_paneer: d.premium_paneer || 0,
      soft_paneer: d.soft_paneer || 0,
      butter: d.butter || 0,
      cream: d.cream || 0,
      ghee: d.ghee || 0,
    }));

    return NextResponse.json({
      daily,
      totals: {
        totalBatches: overall.totalBatches,
        milk: overall.milk,
        curd: overall.curd,
        premium_paneer: overall.premium_paneer,
        soft_paneer: overall.soft_paneer,
        butter: overall.butter,
        cream: overall.cream,
        ghee: overall.ghee,
        avgFat: overall.avgFat ? overall.avgFat.toFixed(1) : 0,
        avgSnf: overall.avgSnf ? overall.avgSnf.toFixed(1) : 0,
      },
      products: productBreakdown,
    });
  } catch (error) {
    console.error("Production analytics API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch production analytics" },
      { status: 500 }
    );
  }
}