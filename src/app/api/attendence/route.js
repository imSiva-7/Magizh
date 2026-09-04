import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";

// -------------------------------------------------------------------
// POST – receive attendance data from ZKTeco MB400
// -------------------------------------------------------------------
export async function POST(request) {
  try {
    // 1. Verify device token (must match environment variable)
    // const deviceToken = request.headers.get("x-device-token");
    // if (deviceToken !== process.env.DEVICE_TOKEN) {
    //   return NextResponse.json(
    //     { success: false, message: "Unauthorized device" },
    //     { status: 401 }
    //   );
    // }

    // 2. Parse the JSON body sent by MB400
    const data = await request.json();

    // 3. Extract fields (adjust names if your device sends different keys)
    const {
      deviceId,
      employeeId,       // The ID you assigned to the employee (e.g., "EMP001")
      timestamp,
      verifyType,       // 1=fingerprint, 2=face, 3=card, 15=face (with mask)
      attendanceState,  // 0=check-in, 1=check-out
      temperature,      // optional
      maskStatus,       // optional
    } = data;

    if (!employeeId || !timestamp) {
      return NextResponse.json(
        { success: false, message: "Missing required fields: employeeId, timestamp" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    // 4. Verify employee exists (in your "employees" collection)
    const employee = await db.collection("employees").findOne({
      employeeId: employeeId,
      active: true,           // if you have an active flag
    });

    // if (!employee) {
    //   return NextResponse.json(
    //     { success: false, message: "Employee not found or inactive" },
    //     { status: 404 }
    //   );
    // }

    // 5. Map verifyType to a readable method
    const methodMap = {
      1: "fingerprint",
      2: "face",
      3: "card",
      4: "password",
      15: "face",
    };
    const method = methodMap[verifyType] || "unknown";

    // 6. Determine check-in / check-out
    const type = attendanceState === 0 ? "check-in" : "check-out";
    const date = new Date(timestamp).toISOString().split("T")[0];

    // 7. Prepare attendance document
    const attendanceDoc = {
      employeeId,
      employeeName: employee.name,           // from employees collection
      department: employee.department || "", // if you store it
      timestamp: new Date(timestamp),
      date,
      type,
      method,
      deviceId: deviceId || "MB400",
      status: "on-time",                     // you can compute late/early later
      temperature: temperature || null,
      maskStatus: maskStatus || null,
      createdAt: new Date(),
    };

    // 8. Insert into "attendance" collection
    const result = await db.collection("attendance").insertOne(attendanceDoc);

    return NextResponse.json({
      success: true,
      id: result.insertedId,
      message: `Attendance recorded for ${employee.name}`,
    });
  } catch (error) {
    console.error("Attendance push error:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}