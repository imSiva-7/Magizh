import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import getDatabase from "@/database/connectToMongoDB";
import { getTodayDate } from "@/lib/india-date.mjs";

const normalizeTime = value => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)
  ? (value.length === 5 ? `${value}:00` : value) : null;

export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Only an admin can edit attendance" }, { status: 403 });
  let data;
  try { data = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const { empID, date, expectedCheckIn, expectedCheckOut } = data || {};
  const checkIn = normalizeTime(data?.checkIn);
  const checkOut = data?.checkOut === "" ? null : normalizeTime(data?.checkOut);
  const calendar = typeof date === "string" ? new Date(`${date}T00:00:00Z`) : null;
  if (typeof empID !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(empID) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !Number.isFinite(calendar?.getTime()) ||
      calendar.toISOString().slice(0, 10) !== date || date > getTodayDate() ||
      !checkIn || (data.checkOut !== "" && !checkOut) || (checkOut && checkOut <= checkIn) ||
      typeof expectedCheckIn !== "string" || typeof expectedCheckOut !== "string") {
    return NextResponse.json({ error: "Enter a valid date and times. Check out must be later than check in on the same day." }, { status: 400 });
  }
  try {
    const db = await getDatabase();
    const employees = db.collection("employee");
    const employee = await employees.findOne({ empID });
    const previous = employee?.attendance?.[date.slice(0, 7)]?.days?.[date.slice(8)];
    if (!previous) return NextResponse.json({ error: "Attendance record not found" }, { status: 404 });
    if ((previous.checkIn || "") !== expectedCheckIn || (previous.checkOut || "") !== expectedCheckOut) {
      return NextResponse.json({ error: "Attendance changed. Refresh the page before editing again." }, { status: 409 });
    }
    const seconds = time => time.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);
    const hours = checkOut ? (seconds(checkOut) - seconds(checkIn)) / 3600 : 0;
    const now = new Date();
    const next = {
      ...previous, checkIn, checkOut,
      hoursWorked: Number(hours.toFixed(2)),
      regularHours: Number(Math.min(hours, 9).toFixed(2)),
      overtimeHours: Number(Math.max(hours - 9, 0).toFixed(2)),
      manualTimes: { checkIn, checkOut },
      corrections: [...(previous.corrections || []), {
        previousCheckIn: previous.checkIn, previousCheckOut: previous.checkOut || null,
        checkIn, checkOut, editedAt: now,
        editedBy: session.user.id || session.user.email || session.user.name || "admin",
      }],
    };
    const path = `attendance.${date.slice(0, 7)}.days.${date.slice(8)}`;
    const result = await employees.updateOne({ _id: employee._id, [path]: { $eq: previous } }, { $set: { [path]: next, [`payroll.${date.slice(0, 7)}`]: null, updatedAt: now } });
    if (!result.matchedCount) return NextResponse.json({ error: "Attendance changed. Refresh and try again." }, { status: 409 });
    return NextResponse.json({ message: "Attendance times updated", hoursWorked: next.hoursWorked });
  } catch (error) {
    console.error("Update attendance times failed", error);
    return NextResponse.json({ error: "Could not update attendance times" }, { status: 500 });
  }
}
