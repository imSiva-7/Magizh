import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import getDatabase from "@/database/connectToMongoDB";
import { requireStaff } from "@/lib/mutation-auth";
import { getTodayDate } from "@/lib/india-date.mjs";
import { generateDueSubscriptions } from "@/lib/customer-subscriptions";

export async function POST(request) {
  const denied = await requireStaff(); if (denied) return denied;
  const customerId = new URL(request.url).searchParams.get("customerId");
  if (customerId && !ObjectId.isValid(customerId)) return NextResponse.json({ error: "Invalid customer" }, { status: 400 });
  try {
    return NextResponse.json(await generateDueSubscriptions(await getDatabase(), getTodayDate(), customerId));
  } catch { return NextResponse.json({ error: "Could not generate subscription orders" }, { status: 500 }); }
}
