import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import getDatabase from "@/database/connectToMongoDB";
import { buildCustomerSummary, CUSTOMER_SUMMARIES } from "@/lib/customer-summaries.mjs";

export async function GET(request) {
  if (!await getServerSession(authOptions)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("customerId");
  if (!id || !ObjectId.isValid(id)) return NextResponse.json({ error: "Valid customerId required" }, { status: 400 });
  try {
    const db = await getDatabase(), customerId = new ObjectId(id);
    const customer = await db.collection("customers").findOne({ _id: customerId });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    const stored = await db.collection(CUSTOMER_SUMMARIES).findOne({ _id: customerId });
    const summary = stored || buildCustomerSummary(customerId, await db.collection("orders").find({ customerId }).toArray());
    const account = await db.collection("total_orders").findOne({ _id: customerId });
    const { _metrics, ...publicSummary } = summary;
    return NextResponse.json({ ...publicSummary, accountPaidAmount: account?.paidAmount || 0, accountDueAmount: summary.totalAmount - (account?.paidAmount || 0) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Customer summary failed:", error);
    return NextResponse.json({ error: "Failed to fetch customer summary" }, { status: 500 });
  }
}
