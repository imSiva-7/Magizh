import { requireSummaryAdmin } from "@/lib/summary-auth";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import getDatabase from "@/database/connectToMongoDB";
import { customerAccountDue } from "@/lib/customer-account-due.mjs";
import {
  paymentPeriodPipelines,
  combinePaymentPeriod,
} from "@/lib/customer-payment-period.mjs";

export async function GET(request) {
  const denied = await requireSummaryAdmin();
  if (denied) return denied;
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["admin", "dev", "employee"].includes(session.user?.role))
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const params = new URL(request.url).searchParams;
    const pipelines = paymentPeriodPipelines(
      params.get("startDate"),
      params.get("endDate"),
    );
    const db = await getDatabase();
    const [orders, receipts] = await Promise.all([
      db.collection("orders").aggregate(pipelines.orders).toArray(),
      db
        .collection("totalOrdersLedger")
        .aggregate(pipelines.receipts)
        .toArray(),
    ]);
    const period = combinePaymentPeriod(orders, receipts);
    const accounts = await db.collection("total_orders").find(
      { _id: { $ne: "global" } },
      { projection: { totalAmount: 1, paidAmount: 1 } },
    ).toArray();
    const accountById = new Map(accounts.map(account => [String(account._id), account]));
    period.customers = period.customers.map(customer => ({
      ...customer,
      currentDue: customerAccountDue(accountById.get(customer.customerId)),
    }));
    return NextResponse.json(period, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error.status)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error("Payment period summary failed", error);
    return NextResponse.json(
      { error: "Could not load payment-period totals" },
      { status: 500 },
    );
  }
}
