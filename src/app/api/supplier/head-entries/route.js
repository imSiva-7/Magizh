import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { ObjectId } from "mongodb";

const HEAD_ENTRIES = "head_supplier_entries";

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

    const db = await getDatabase();
    const doc = await db.collection(HEAD_ENTRIES).findOne({
      _id: new ObjectId(headSupplierId),
    });

    if (!doc) {
      // Head supplier exists but has no cuts yet
      return NextResponse.json({
        headSupplierName: null,
        entries: [],
        totals: { entries: 0, milk: 0, earned: 0, paid: 0, due: 0 },
      });
    }

    // Flatten { entries: { "date": { "AM": {...}, "PM": {...} } } }
    // into a sorted array of { ...entry, date, time }
    const flat = [];
    for (const [date, byTime] of Object.entries(doc.entries || {})) {
      if (startDate && date < startDate) continue;
      if (endDate && date > endDate) continue;

      for (const [time, entry] of Object.entries(byTime || {})) {
        if (status === "Paid" && entry.paymentStatus !== "Paid") continue;
        if (status === "Not Paid" && entry.paymentStatus === "Paid") continue;

        flat.push({ ...entry, date, time });
      }
    }

    // Newest first; PM before AM within the same day
    flat.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.time === "PM" ? -1 : 1;
    });

    return NextResponse.json({
      headSupplierName: doc.headSupplierName || null,
      entries: flat,
      totals: doc.totals || { entries: 0, milk: 0, earned: 0, paid: 0, due: 0 },
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