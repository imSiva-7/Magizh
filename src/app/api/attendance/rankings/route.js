import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import getDatabase from "@/database/connectToMongoDB";
import { getEmployeeRankings } from "@/lib/employee-rankings";
import { month as currentMonth } from "@/lib/india-date.mjs";

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!["admin", "dev"].includes(session.user.role)) return NextResponse.json({ error: "Employee access required" }, { status: 403 });
    const month = new URL(request.url).searchParams.get("month") || currentMonth();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > currentMonth()) return NextResponse.json({ error: "Choose a valid current or past month" }, { status: 400 });
    const rankings = await getEmployeeRankings(await getDatabase(), month);
    return NextResponse.json({ month, rankings }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Attendance rankings failed:", error.message);
    return NextResponse.json({ error: "Could not load employee rankings" }, { status: 500 });
  }
}
