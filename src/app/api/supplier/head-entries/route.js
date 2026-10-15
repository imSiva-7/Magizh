import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { ObjectId } from "mongodb";
import { HEAD_ENTRIES, flattenHeadEntries, summarizeHeadEntries } from "@/lib/head-supplier-entries.mjs";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const headSupplierId = searchParams.get("headSupplierId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const status = searchParams.get("status"); // "Paid" | "Not Paid" | null

    if (!headSupplierId || !ObjectId.isValid(headSupplierId)) {
      return NextResponse.json({ error: "Invalid head ID" }, { status: 400 });
    }
    if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) || (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) || (startDate && endDate && startDate > endDate) || (status && !["Paid", "Not Paid"].includes(status))) {
      return NextResponse.json({ error: "Invalid date range or payment status" }, { status: 400 });
    }

    const db = await getDatabase();
    const doc = await db.collection(HEAD_ENTRIES).findOne({
      _id: new ObjectId(headSupplierId),
    });

    if (!doc) {
      // Head supplier exists but has no cuts yet
      return NextResponse.json({
        headSupplierName: null,
        entries: [],
        reviewCount: 0,
        totals: { entries: 0, milk: 0, earned: 0, paid: 0, due: 0 },
      });
    }

    const flat = flattenHeadEntries(doc).filter((entry) => (!startDate || entry.date >= startDate) && (!endDate || entry.date <= endDate) && (!status || (status === "Paid" ? entry.paymentStatus === "Paid" : entry.paymentStatus !== "Paid")));

    // Newest first; PM before AM within the same day
    flat.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.time === b.time ? String(b.procurementId).localeCompare(String(a.procurementId)) : a.time === "PM" ? -1 : 1;
    });

    return NextResponse.json({
      headSupplierName: doc.headSupplierName || null,
      entries: flat,
      totals: summarizeHeadEntries(flat),
      reviewCount: flat.filter((entry) => entry.paymentReviewRequired).length,
    });
  } catch (error) {
    console.error("Head entries GET error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch head entries",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}
