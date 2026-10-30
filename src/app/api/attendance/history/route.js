import { requireSummaryAdmin } from "@/lib/summary-auth";
import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { getTodayDate } from "@/lib/india-date.mjs";
import { attendanceDayHours } from "../../../../../utils/attendanceHours";

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
  const denied = await requireSummaryAdmin();
  if (denied) return denied;
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
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
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
          joiningDate: 1,
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
          joiningDate: 1,
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
      // Manual and migrated records can have a check-in without raw punches.
      andConditions.push({ checkIn: { $exists: true, $nin: [null, ""] } });
    } else if (statusFilter === "complete") {
      andConditions.push({ checkOut: { $nin: [null, ""] } });
      andConditions.push({ checkIn: { $exists: true, $nin: [null, ""] } });
    }

    if (andConditions.length) {
      stages.push({ $match: { $and: andConditions } });
    }

    stages.push({ $sort: { date: -1, empID: 1 } });

    const rawRecords = await db.collection("employee").aggregate(stages).toArray();
    const today = getTodayDate();
    const records = rawRecords.filter(record => {
      const date = record.date;
      if (typeof date !== "string" || !date.startsWith(`${month}-`) || date > today) return false;
      const calendar = new Date(`${date}T00:00:00Z`);
      if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== date) return false;
      const joining = record.joiningDate;
      const validJoining = typeof joining === "string" && /^\d{4}-\d{2}-\d{2}$/.test(joining) &&
        Number.isFinite(Date.parse(`${joining}T00:00:00Z`)) && new Date(`${joining}T00:00:00Z`).toISOString().slice(0, 10) === joining;
      return !validJoining || date >= joining;
    }).map(record => {
      const { joiningDate: _joiningDate, ...publicRecord } = record;
      const hours = attendanceDayHours(record);
      return { ...publicRecord, hoursWorked: hours, regularHours: Math.min(hours, 9), overtimeHours: Math.max(hours - 9, 0) };
    });

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
