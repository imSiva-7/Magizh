import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";

export async function POST(request) {
  try {
    // Token check disabled for now – you can enable later
    const data = await request.json();

    const {
      deviceId,
      employeeId,
      timestamp,
      verifyType,
      attendanceState,
      temperature,
      maskStatus,
      employeeName,   // if the device sends a name, use it
      department,     // if available
    } = data;

    // Basic validation (optional, but recommended)
    if (!employeeId || !timestamp) {
      return NextResponse.json(
        { success: false, message: "Missing employeeId or timestamp" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    const methodMap = {
      1: "fingerprint",
      2: "face",
      3: "card",
      4: "password",
      15: "face",
    };
    const method = methodMap[verifyType] || "unknown";

    const type = attendanceState === 0 ? "check-in" : "check-out";
    const date = new Date(timestamp).toISOString().split("T")[0];

    // Build attendance document without employee lookup
    const attendanceDoc = {
      employeeId,
      employeeName: employeeName || "",   // if not provided, empty string
      department: department || "",
      timestamp: new Date(timestamp),
      date,
      type,
      method,
      deviceId: deviceId || "MB400",
      status: "on-time",                  // you can add logic later
      temperature: temperature || null,
      maskStatus: maskStatus || null,
      createdAt: new Date(),
    };

    const result = await db.collection("attendance").insertOne(attendanceDoc);

    return NextResponse.json({
      success: true,
      id: result.insertedId,
      message: "Attendance recorded successfully",
    });
  } catch (error) {
    console.error("Attendance push error:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}