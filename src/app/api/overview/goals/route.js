import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { requireSummaryAdmin } from "@/lib/summary-auth";
import { requireAdmin } from "@/lib/mutation-auth";
import { getProcurementStore } from "@/lib/supplier-procurements.mjs";
import { currentGoalPeriod, validateGoalTargets } from "@/lib/monthly-goals.mjs";

const goalKey = (month) => `monthly_goals:${month}`;
const headers = { "Cache-Control": "no-store" };

async function monthTotal(collection, { startDate, throughDate }) {
  const [result] = await collection.aggregate([
    { $match: { date: { $gte: startDate, $lte: throughDate } } },
    { $group: { _id: null, amount: { $sum: { $convert: { input: "$totalAmount", to: "decimal", onError: 0, onNull: 0 } } } } },
    { $project: { _id: 0, amount: { $convert: { input: { $round: ["$amount", 2] }, to: "double" } } } },
  ]).toArray();
  const amount = result?.amount ?? 0;
  if (!Number.isFinite(amount)) throw new Error("Invalid monthly total");
  return amount;
}

export async function GET() {
  const denied = await requireSummaryAdmin();
  if (denied) return denied;
  try {
    const period = currentGoalPeriod();
    const db = await getDatabase();
    const [settings, sales, procurement] = await Promise.all([
      db.collection("settings").findOne({ _id: goalKey(period.month) }),
      monthTotal(db.collection("orders"), period),
      monthTotal(getProcurementStore(db), period),
    ]);
    return NextResponse.json({
      ...period,
      targets: settings?.targets ?? { sales: null, profit: null },
      actual: { sales, procurement, profit: Number((sales - procurement).toFixed(2)) },
    }, { headers });
  } catch (error) {
    console.error("Monthly goals load failed", error);
    return NextResponse.json({ error: "Could not load monthly goals. Please try again." }, { status: 500, headers });
  }
}

export async function PUT(request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body, targets;
  try {
    body = await request.json();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body?.month || "")) throw new Error("Invalid goal month.");
    targets = validateGoalTargets(body.targets);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Invalid monthly goals." }, { status: 400, headers });
  }

  const { month } = currentGoalPeriod();
  if (body.month !== month) {
    return NextResponse.json({ error: "A new month has started. Reload your goals before saving." }, { status: 409, headers });
  }

  try {
    const db = await getDatabase();
    await db.collection("settings").updateOne(
      { _id: goalKey(month) },
      { $set: { month, targets, updatedAt: new Date() } },
      { upsert: true },
    );
    return NextResponse.json({ month, targets }, { headers });
  } catch (error) {
    console.error("Monthly goals save failed", error);
    return NextResponse.json({ error: "Could not save monthly goals. Please try again." }, { status: 500, headers });
  }
}
