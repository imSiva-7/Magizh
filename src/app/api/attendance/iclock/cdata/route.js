// import { NextResponse } from "next/server";
// import getDatabase from "@/database/connectToMongoDB";

// export async function POST(request) {
//   try {
//     // Token check disabled for now – you can enable later
//     const data = await request.json();

//     const {
//       deviceId,
//       employeeId,
//       timestamp,
//       verifyType,
//       attendanceState,
//       temperature,
//       maskStatus,
//       employeeName,   // if the device sends a name, use it
//       department,     // if available
//     } = data;

//     // Basic validation (optional, but recommended)
//     if (!employeeId || !timestamp) {
//       return NextResponse.json(
//         { success: false, message: "Missing employeeId or timestamp" },
//         { status: 400 }
//       );
//     }

//     const db = await getDatabase();

//     const methodMap = {
//       1: "fingerprint",
//       2: "face",
//       3: "card",
//       4: "password",
//       15: "face",
//     };
//     const method = methodMap[verifyType] || "unknown";

//     const type = attendanceState === 0 ? "check-in" : "check-out";
//     const date = new Date(timestamp).toISOString().split("T")[0];

//     // Build attendance document without employee lookup
//     const attendanceDoc = {
//       employeeId,
//       employeeName: employeeName || "",   // if not provided, empty string
//       department: department || "",
//       timestamp: new Date(timestamp),
//       date,
//       type,
//       method,
//       deviceId: deviceId || "MB400",
//       status: "on-time",                  // you can add logic later
//       temperature: temperature || null,
//       maskStatus: maskStatus || null,
//       createdAt: new Date(),
//     };

//     const result = await db.collection("attendance").insertOne(attendanceDoc);

//     return NextResponse.json({
//       success: true,
//       id: result.insertedId,
//       message: "Attendance recorded successfully",
//     });
//   } catch (error) {
//     console.error("Attendance push error:", error);
//     return NextResponse.json(
//       { success: false, message: error.message },
//       { status: 500 }
//     );
//   }
// }

import { NextResponse } from 'next/server';

/**
 * 1. HANDLE INITIALIZATION HANDSHAKE (GET)
 * When the machine boots or connects, it checks if your server speaks the ZK protocol.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sn = searchParams.get('SN'); // Device Serial Number

    console.log(`[ZKTeco] Device Connection Handshake. Serial Number: ${sn}`);

    // ZK protocol strictly requires a plain text "OK" body response to clear the yellow triangle
    return new NextResponse('OK', {
      headers: { 
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      },
    });
  } catch (error) {
    console.error('[ZKTeco Handshake Error]:', error);
    return new NextResponse('ERROR', { status: 500 });
  }
}

/**
 * 2. HANDLE REAL-TIME PUNCHE LOGS (POST)
 * When an employee uses their face/finger/card, the device pushes raw text data.
 */
export async function POST(request) {
  try {
    const rawText = await request.text();
    console.log('[ZKTeco] Raw Data Received:\n', rawText);

    if (!rawText || rawText.trim() === '') {
      return new NextResponse('OK', { headers: { 'Content-Type': 'text/plain' } });
    }

    // Split payload into individual lines
    const lines = rawText.split('\n');
    const parsedLogs = [];

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // ZK ADMS punch logs usually start with data string definitions or payload identifiers
      // A standard raw punch format looks like: 
      // 9999\t2026-09-05 08:30:22\t0\t0\t0\t0
      // (Fields: UserID, Timestamp, VerifyMode, PunchState, WorkCode, Reserved)
      
      const fields = line.split('\t'); // Split by tabs
      
      if (fields.length >= 2) {
        const userId = fields[0];
        const timestamp = fields[1];
        const punchState = fields[3] || '0'; // 0 = Check In, 1 = Check Out (usually)

        // Validate that it looks like a valid log line (e.g. date check)
        if (timestamp.includes('-') && timestamp.includes(':')) {
          parsedLogs.push({
            userId,
            timestamp: new Date(timestamp),
            punchState
          });
        }
      }
    }

    if (parsedLogs.length > 0) {
      console.log('[ZKTeco] Successfully parsed logs:', parsedLogs);
      
      // TODO: Connect your database here and save the records
      // Example: await db.attendance.createMany({ data: parsedLogs });
    }

    // The device will cache logs and retry indefinitely unless it gets a specific response matching its count
    // Telling it "OK" accepts the data buffer completely.
    return new NextResponse('OK', {
      headers: { 'Content-Type': 'text/plain' },
    });

  } catch (error) {
    console.error('[ZKTeco Data Processing Error]:', error);
    // Don't crash the device pipeline; return an error so it tries again later
    return new NextResponse('ERROR', { status: 500 });
  }
}
