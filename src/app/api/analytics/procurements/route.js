import { requireSummaryAdmin } from "@/lib/summary-auth";
import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { getProcurementStore } from "@/lib/supplier-procurements.mjs";
import { getAllTimeProcurementTotals } from "@/lib/flat-procurements.mjs";

export async function GET(request) {
  const denied = await requireSummaryAdmin();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if ((startDate && !validDate(startDate)) || (endDate && !validDate(endDate)) || (startDate && endDate && startDate > endDate)) return NextResponse.json({ error: "Invalid date range" }, { status: 400 });

    const db = await getDatabase();

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
      { $set: Object.fromEntries([["__milk", "$milkQuantity"], ["__amount", "$totalAmount"], ["__fat", "$fatPercentage"], ["__snf", "$snfPercentage"]].map(([name, input]) => [name, { $convert: { input, to: "double", onError: 0, onNull: 0 } }])) },
      {
        $group: {
          _id: "$date",
          totalMilk: { $sum: "$__milk" },
          totalAmount: { $sum: "$__amount" },
          fatMilk: { $sum: { $multiply: ["$__milk", "$__fat"] } },
          snfMilk: { $sum: { $multiply: ["$__milk", "$__snf"] } },
          paidAmount: { $sum: { $cond: [{ $eq: ["$paymentStatus", "Paid"] }, "$__amount", 0] } },
          dueAmount: { $sum: { $cond: [{ $eq: ["$paymentStatus", "Paid"] }, 0, "$__amount"] } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const dailyStats = await getProcurementStore(db)
      .aggregate(pipeline)
      .toArray();

    // Get overall summary
    const periodTotals = dailyStats.reduce((totals, day) => ({ totalMilk: totals.totalMilk + day.totalMilk, totalAmount: totals.totalAmount + day.totalAmount, totalRecords: totals.totalRecords + day.count, paidAmount: totals.paidAmount + day.paidAmount, dueAmount: totals.dueAmount + day.dueAmount }), { totalMilk: 0, totalAmount: 0, totalRecords: 0, paidAmount: 0, dueAmount: 0 });
    for (const key of ["totalAmount", "paidAmount", "dueAmount"]) periodTotals[key] = Number(periodTotals[key].toFixed(2));
    periodTotals.totalMilk = Number(periodTotals.totalMilk.toFixed(4));
    const overall = process.env.PROCUREMENTS_STORAGE === "flat" && !startDate && !endDate ? await getAllTimeProcurementTotals(db) : periodTotals;

    return NextResponse.json({
      daily: dailyStats.map(d => ({
        date: d._id,
        milk: d.totalMilk,
        amount: d.totalAmount,
        avgFat: d.totalMilk > 0 ? d.fatMilk / d.totalMilk : null,
        avgSnf: d.totalMilk > 0 ? d.snfMilk / d.totalMilk : null,
        fatMilk: d.fatMilk,
        snfMilk: d.snfMilk,
        paid: d.paidAmount,
        due: d.dueAmount,
      })),
      overall
    });
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
