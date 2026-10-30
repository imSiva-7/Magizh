import { NextResponse } from "next/server";
import { requireSummaryAdmin } from "@/lib/summary-auth";
import getDatabase from "@/database/connectToMongoDB";
import { getTodayDate } from "@/lib/india-date.mjs";
import { buildPayroll, validMonth } from "@/lib/payroll";
import { exportAttendanceToPDF } from "../../../../../utils/exportAttendance";
import { attendanceFilename } from "@/utils/attendanceFilename";

export const runtime = "nodejs";

export async function GET(request) {
  const denied = await requireSummaryAdmin();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const empID = searchParams.get("empID"),
      month = searchParams.get("month");
    if (!empID || !validMonth(month))
      return NextResponse.json(
        { error: "Invalid employee or month" },
        { status: 400 },
      );
    const employee = await (await getDatabase())
      .collection("employee")
      .findOne({ empID });
    if (!employee)
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 },
      );
    const report = buildPayroll(employee, month, getTodayDate());
    const bytes = exportAttendanceToPDF(report, month, null, true);
    const filename = encodeURIComponent(
      attendanceFilename(employee.name, month),
    ).replace(/'/g, "%27");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="salary-${month}.pdf"; filename*=UTF-8''${filename}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Payroll PDF failed", error);
    return NextResponse.json(
      { error: "Could not generate salary PDF" },
      { status: 500 },
    );
  }
}
