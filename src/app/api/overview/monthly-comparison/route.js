import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { getTodayDate } from "@/lib/india-date.mjs";
import { requireSummaryAdmin } from "@/lib/summary-auth";
import { getProcurementStore } from "@/lib/supplier-procurements.mjs";

const headers = { "Cache-Control": "no-store" };

async function dailyAmounts(store, startDate, endDate) {
  return store.aggregate([
    { $match: { date: { $gte: startDate, $lte: endDate } } },
    { $group: { _id: "$date", amount: { $sum: { $convert: { input: "$totalAmount", to: "decimal", onError: 0, onNull: 0 } } } } },
    { $project: { _id: 0, date: "$_id", paise: { $toDouble: { $round: [{ $multiply: ["$amount", 100] }, 0] } } } },
  ]).toArray();
}

function runningTotals(daily, currentEnd, previousEnd) {
  if (!daily.length) return [];

  const byDate = new Map(daily.map(({ date, paise }) => [date, paise]));
  const currentMonth = currentEnd.slice(0, 7);
  const previousMonth = previousEnd.slice(0, 7);
  const currentDay = Number(currentEnd.slice(8));
  const previousDay = Number(previousEnd.slice(8));
  let current = 0;
  let previous = 0;

  return Array.from({ length: Math.max(currentDay, previousDay) }, (_, index) => {
    const day = index + 1;
    const suffix = String(day).padStart(2, "0");
    current += byDate.get(`${currentMonth}-${suffix}`) ?? 0;
    previous += byDate.get(`${previousMonth}-${suffix}`) ?? 0;
    return {
      day,
      current: day <= currentDay ? current / 100 : null,
      previous: day <= previousDay ? previous / 100 : null,
    };
  });
}

export async function GET() {
  const denied = await requireSummaryAdmin();
  if (denied) return denied;

  try {
    const currentEnd = getTodayDate();
    const firstOfMonth = new Date(`${currentEnd.slice(0, 7)}-01T00:00:00Z`);
    firstOfMonth.setUTCDate(0);
    const previousEnd = firstOfMonth.toISOString().slice(0, 10);
    const startDate = `${previousEnd.slice(0, 7)}-01`;

    const db = await getDatabase();
    const [sales, procurement] = await Promise.all([
      dailyAmounts(db.collection("orders"), startDate, currentEnd),
      dailyAmounts(getProcurementStore(db), startDate, currentEnd),
    ]);

    return NextResponse.json({
      currentEnd,
      previousEnd,
      sales: runningTotals(sales, currentEnd, previousEnd),
      procurement: runningTotals(procurement, currentEnd, previousEnd),
    }, { headers });
  } catch (error) {
    console.error("Monthly comparison load failed", error);
    return NextResponse.json({ error: "Could not load the monthly comparison." }, { status: 500, headers });
  }
}
