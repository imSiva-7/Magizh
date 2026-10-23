import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { getTodayDate } from "@/lib/india-date.mjs";
import { generateDueSubscriptions } from "@/lib/customer-subscriptions";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Subscription scheduler is not configured" }, { status: 503 });
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await generateDueSubscriptions(await getDatabase(), getTodayDate());
    return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
  } catch { return NextResponse.json({ error: "Subscription generation failed" }, { status: 500 }); }
}
