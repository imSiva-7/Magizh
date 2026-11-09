import { requireSummaryAdmin } from "@/lib/summary-auth";
import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { getTodayDate } from "@/lib/india-date.mjs";
import { buildPayroll, validMonth } from "@/lib/payroll";

/**
 * GET /api/attendance/history
 *   ?month=YYYY-MM         (required)
 *   &startDate=YYYY-MM-DD  (optional — clips within the month)
 *   &endDate=YYYY-MM-DD    (optional)
 *   &search=ravi           (optional — matches name or empID, case-insensitive)
 *   &status=complete|incomplete  (optional)
 *
 * Returns a flattened list of recorded check-ins for the month,
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
    if (!validMonth(month)) {
      return NextResponse.json(
        { error: "Invalid month format. Use YYYY-MM" },
        { status: 400 },
      );
    }

    const db = await getDatabase();

    const today = getTodayDate();
    const term = search?.trim().toLowerCase();
    const employees = await db.collection("employee").find(
      { empID: { $exists: true, $nin: [null, ""] }, [`attendance.${month}.days`]: { $exists: true } },
      { projection: { empID: 1, name: 1, joiningDate: 1, createdAt: 1, [`attendance.${month}`]: 1 } },
    ).toArray();

    const records = [];
    for (const employee of employees) {
      const { empID, name } = employee;
      if (term && !String(empID).toLowerCase().includes(term) && !name?.toLowerCase().includes(term)) continue;

      const { attendance } = buildPayroll(employee, month, today);
      for (const { punches, ...day } of attendance) {
        if (!day.checkIn) continue;
        if ((startDate && day.date < startDate) || (endDate && day.date > endDate)) continue;
        if (statusFilter === "complete" && !day.checkOut) continue;
        if (statusFilter === "incomplete" && day.checkOut) continue;
        records.push({ ...day, empID, name, punchCount: punches.length });
      }
    }
    records.sort((a, b) => b.date.localeCompare(a.date) || String(a.empID).localeCompare(String(b.empID)));

    // --- Summary ---
    const uniqueEmployees = new Set();
    let totalHours = 0;
    let incompleteCount = 0;

    for (const r of records) {
      uniqueEmployees.add(r.empID);
      totalHours += Number(r.hoursWorked) || 0;
      if (r.checkIn && !r.checkOut) incompleteCount++;
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
