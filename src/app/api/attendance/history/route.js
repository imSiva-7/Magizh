import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";

/**
 * GET /api/attendance/history
 *   ?month=YYYY-MM         (required)
 *   &startDate=YYYY-MM-DD  (optional — clips within the month)
 *   &endDate=YYYY-MM-DD    (optional)
 *   &search=ravi           (optional — matches name or empID, case-insensitive)
 *   &status=complete|incomplete  (optional)
 *
 * Returns a flattened list of every (employee, day) pair for the month,
 * plus a summary of the whole result set.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");
    const statusFilter = searchParams.get("status");

    if (!month) {
      return NextResponse.json(
        { error: "month is required (format: YYYY-MM)" },
        { status: 400 },
      );
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "Invalid month format. Use YYYY-MM" },
        { status: 400 },
      );
    }

    const db = await getDatabase();

    const stages = [
      // Only employees who have attendance for this month
      { $match: { [`attendance.${month}.days`]: { $exists: true } } },
      {
        $project: {
          empID: 1,
          name: 1,
          daysArray: {
            $objectToArray: { $ifNull: [`$attendance.${month}.days`, {}] },
          },
        },
      },
      { $unwind: "$daysArray" },
      {
        $project: {
          _id: 0,
          empID: 1,
          name: 1,
          date: "$daysArray.v.date",
          checkIn: "$daysArray.v.checkIn",
          checkOut: "$daysArray.v.checkOut",
          hoursWorked: { $ifNull: ["$daysArray.v.hoursWorked", 0] },
          regularHours: { $ifNull: ["$daysArray.v.regularHours", 0] },
          overtimeHours: { $ifNull: ["$daysArray.v.overtimeHours", 0] },
          punchCount: { $size: { $ifNull: ["$daysArray.v.punches", []] } },
        },
      },
    ];

    // --- Post-unwind filters ---
    const andConditions = [];

    if (startDate || endDate) {
      const dateMatch = {};
      if (startDate) dateMatch.$gte = startDate;
      if (endDate) dateMatch.$lte = endDate;
      andConditions.push({ date: dateMatch });
    }

    if (search && search.trim()) {
      const term = search.trim();
      andConditions.push({
        $or: [
          { name: { $regex: term, $options: "i" } },
          { empID: { $regex: term, $options: "i" } },
        ],
      });
    }

    if (statusFilter === "incomplete") {
      andConditions.push({
        $or: [
          { checkOut: null },
          { checkOut: "" },
          { checkOut: { $exists: false } },
        ],
      });
      andConditions.push({ punchCount: { $gt: 0 } });
    } else if (statusFilter === "complete") {
      andConditions.push({ checkOut: { $nin: [null, ""] } });
    }

    if (andConditions.length) {
      stages.push({ $match: { $and: andConditions } });
    }

    stages.push({ $sort: { date: -1, empID: 1 } });

    const records = await db.collection("employee").aggregate(stages).toArray();

    // --- Summary ---
    const uniqueEmployees = new Set();
    let totalHours = 0;
    let incompleteCount = 0;

    for (const r of records) {
      uniqueEmployees.add(r.empID);
      totalHours += Number(r.hoursWorked) || 0;
      if (!r.checkOut) incompleteCount++;
    }

    return NextResponse.json({
      month,
      records,
      summary: {
        totalRecords: records.length,
        uniqueEmployees: uniqueEmployees.size,
        totalHours: parseFloat(totalHours.toFixed(2)),
        incompleteCount,
      },
    });
  } catch (error) {
    console.error("GET /api/attendance/history error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch attendance history",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}