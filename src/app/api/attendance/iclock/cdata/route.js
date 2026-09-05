import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";

/**
 * 1. GET HANDSHAKE
 * Device queries server parameters upon boot or heartbeat.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sn = searchParams.get("SN") || searchParams.get("sn");

    console.log(`[ZKTeco Handshake] Device SN: ${sn}`);

    // ZKTeco Push SDK requires exact plain-text "OK" with text/plain header
    return new Response("OK", {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[ZKTeco Handshake Error]:", error);
    return new Response("ERROR", { status: 500 });
  }
}

/**
 * 2. POST PUNCH LOGS & OPERATIONS
 * Handles incoming raw tab-separated ADMS data streams.
 */
export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("SN") || searchParams.get("sn") || "MB400";
    const table = searchParams.get("table"); // e.g., 'ATTLOG' or 'OPLOG'

    const rawText = await request.text();
    console.log(`[ZKTeco Raw Data Received - Table: ${table}]:\n`, rawText);

    if (!rawText || rawText.trim() === "") {
      return new Response("OK", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const lines = rawText.split("\n");
    const recordsToInsert = [];

    const verifyTypeMap = {
      0: "password",
      1: "fingerprint",
      2: "card",
      15: "face",
    };

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // Tab-separated string parsing
      const fields = line.split("\t");

      /**
       * STANDARD ATTLOG FORMAT:
       * fields[0] = User ID / Employee ID (e.g. "56321")
       * fields[1] = Timestamp (e.g. "2026-09-05 02:44:16")
       * fields[2] = Attendance State / Punch Type (0 = Check In, 1 = Check Out)
       * fields[3] = Verify Type (1 = Finger, 15 = Face, 2 = Card, etc.)
       * fields[4] = Work Code (Optional)
       */
      
      // Filter lines containing valid dates
      if (fields.length >= 2 && fields[1]?.includes("-") && fields[1]?.includes(":")) {
        const employeeId = fields[0].replace(/^OPLOG\s+/, "").trim(); // strip header prefix if present
        const timestampStr = fields[1].trim();
        const attendanceState = parseInt(fields[2] || "0", 10);
        const verifyType = parseInt(fields[3] || "1", 10);

        const parsedTimestamp = new Date(timestampStr);

        // Validate timestamp validity
        if (!isNaN(parsedTimestamp.getTime())) {
          const type = attendanceState === 0 ? "check-in" : "check-out";
          const method = verifyTypeMap[verifyType] || "unknown";
          const date = timestampStr.split(" ")[0];

          recordsToInsert.push({
            employeeId,
            employeeName: "",
            department: "",
            timestamp: parsedTimestamp,
            date,
            type,
            method,
            deviceId,
            status: "on-time",
            rawLine: line,
            createdAt: new Date(),
          });
        }
      }
    }

    // Insert records into MongoDB
    if (recordsToInsert.length > 0) {
      const db = await getDatabase();
      const result = await db.collection("attendance").insertMany(recordsToInsert);
      console.log(`[ZKTeco MongoDB] Inserted ${result.insertedCount} attendance records.`);
    }

    // Returning exact raw "OK" tells the hardware the data was safely processed
    return new Response("OK", {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[ZKTeco Processing Error]:", error);
    // Return 500 plain text so the device holds records in local cache to retry later
    return new Response("ERROR", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}