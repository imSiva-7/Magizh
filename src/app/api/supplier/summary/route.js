import { requireSummaryAdmin } from "@/lib/summary-auth";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import getDatabase from "@/database/connectToMongoDB";
import { SUMMARY_COLLECTION, getAllTimeProcurementTotals } from "@/lib/flat-procurements.mjs";

export async function GET(request) {
  const denied = await requireSummaryAdmin();
  if (denied) return denied;
  try {
    if (!await getServerSession(authOptions)) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const id = new URL(request.url).searchParams.get("supplierId");
    if (id && !ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid supplier ID" }, { status: 400 });
    const db = await getDatabase();
    const data = id ? await db.collection(SUMMARY_COLLECTION).findOne({ _id: new ObjectId(id) }, { projection: { _metrics: 0 } }) : await getAllTimeProcurementTotals(db);
    if (!data) return NextResponse.json({ error: "Supplier summary not found" }, { status: 404 });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Supplier summary read failed", error);
    return NextResponse.json({ error: "Failed to fetch supplier summary" }, { status: 500 });
  }
}
