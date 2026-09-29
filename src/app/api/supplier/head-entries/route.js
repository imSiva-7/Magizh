import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { ObjectId } from "mongodb";

const HEAD_ENTRIES = "head_supplier_entries";

// GET /api/supplier/head-entries?headSupplierId=X
//     &startDate=...&endDate=...&status=Unpaid
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const headSupplierId = searchParams.get("headSupplierId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const status = searchParams.get("status");

    if (!headSupplierId || !ObjectId.isValid(headSupplierId)) {
      return NextResponse.json({ error: "Invalid head ID" }, { status: 400 });
    }

    const db = await getDatabase();
    const doc = await db.collection(HEAD_ENTRIES).findOne({
      _id: new ObjectId(headSupplierId),
    });

    if (!doc) {
      return NextResponse.json({
        headSupplierName: null,
        entries: [],
        totals: { entries: 0, milk: 0, earned: 0, paid: 0, due: 0 },
      });
    }

    // Flatten nested structure into an array for the UI
    const flat = [];
    for (const [date, byTime] of Object.entries(doc.entries || {})) {
      if (startDate && date < startDate) continue;
      if (endDate && date > endDate) continue;

      for (const [time, entry] of Object.entries(byTime)) {
        if (status === "Unpaid" && entry.paymentStatus === "Paid") continue;
        if (status === "Paid" && entry.paymentStatus !== "Paid") continue;

        flat.push({ ...entry, date, time });
      }
    }

    // Sort newest first
    flat.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.time === "PM" ? -1 : 1;
    });

    return NextResponse.json({
      headSupplierName: doc.headSupplierName,
      entries: flat,
      totals: doc.totals || { entries: 0, milk: 0, earned: 0, paid: 0, due: 0 },
    });
  } catch (error) {
    console.error("Head entries GET error:", error);
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}