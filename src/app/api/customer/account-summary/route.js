import { NextResponse } from "next/server";
import { requireSummaryAdmin } from "@/lib/summary-auth";
import getDatabase from "@/database/connectToMongoDB";
import { summarizeCustomerAccounts } from "@/lib/customer-account-due.mjs";

// Current account balances are independent of order/payment date filters.
export async function GET() {
  const denied = await requireSummaryAdmin();
  if (denied) return denied;
  try {
    const db = await getDatabase();
    const [accounts, customers] = await Promise.all([
      db.collection("total_orders").find(
        { _id: { $ne: "global" } },
        { projection: { customerName: 1, totalAmount: 1, paidAmount: 1 } },
      ).toArray(),
      db.collection("customers").find({}, { projection: { customerName: 1 } }).toArray(),
    ]);
    return NextResponse.json(summarizeCustomerAccounts(accounts, customers), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Customer account summary failed:", error);
    return NextResponse.json({ error: "Could not load overall customer balances" }, { status: 500 });
  }
}
