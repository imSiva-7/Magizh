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
 * Writes directly to nested employee.attendance structure.
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

      try {
        // Tab-separated string parsing
        const fields = line.split("\t");

        /**
         * STANDARD ATTLOG FORMAT:
         * fields[0] = User ID / Employee ID (e.g. "2201")
         * fields[1] = Timestamp (e.g. "2026-09-05 02:44:16")
         * fields[2] = Attendance State / Punch Type (0 = Check In, 1 = Check Out)
         * fields[3] = Verify Type (1 = Finger, 15 = Face, 2 = Card, etc.)
         * fields[4] = Work Code (Optional)
         */
        
        // Filter lines containing valid dates
        if (fields.length >= 2 && fields[1]?.includes("-") && fields[1]?.includes(":")) {
          const employeeId = fields[0].replace(/^OPLOG\s+/, "").trim();
          const timestampStr = fields[1].trim();
          
          // Parse timestamp - device sends local time
          const parsedTimestamp = new Date(timestampStr.replace(" ", "T"));
          const verifyType = parseInt(fields[3] || "1", 10);

          // Validate timestamp
          if (!isNaN(parsedTimestamp.getTime())) {
            const method = verifyTypeMap[verifyType] || "unknown";
            const date = timestampStr.split(" ")[0];
            const time = timestampStr.split(" ")[1] || "";

            recordsToInsert.push({
              employeeId,
              timestamp: parsedTimestamp,
              date,
              time,
              method,
              deviceId,
              rawLine: line,
            });
          }
        }
      } catch (lineError) {
        console.error(`[ZKTeco Line Parse Error]:`, lineError, `Line: ${line}`);
        continue;
      }
    }

    // Write to nested employee.attendance structure
    if (recordsToInsert.length > 0) {
      const db = await getDatabase();
      
      // Group records by employeeId
      const employeeGroups = {};
      recordsToInsert.forEach(record => {
        if (!employeeGroups[record.employeeId]) {
          employeeGroups[record.employeeId] = [];
        }
        employeeGroups[record.employeeId].push(record);
      });

      // Process each employee's records
      for (const [employeeId, records] of Object.entries(employeeGroups)) {
        // Get employee document
        let employee = await db.collection("employee").findOne({ empID: employeeId });
        
        if (!employee) {
          console.log(`[ZKTeco] Employee ${employeeId} not found, skipping records`);
          continue;
        }

        // Ensure attendance object exists
        if (!employee.attendance) {
          employee.attendance = {};
        }

        // Process each punch record
        for (const record of records) {
          const monthKey = record.date.substring(0, 7); // "2026-09"
          const dayKey = record.date.substring(8, 10); // "07"

          // Initialize month if doesn't exist
          if (!employee.attendance[monthKey]) {
            employee.attendance[monthKey] = {
              days: {},
              totalHours: 0,
              regularHours: 0,
              overtimeHours: 0,
              daysWorked: 0
            };
          }

          // Initialize day if doesn't exist
          if (!employee.attendance[monthKey].days[dayKey]) {
            employee.attendance[monthKey].days[dayKey] = {
              date: record.date,
              punches: [],
              checkIn: null,
              checkOut: null,
              hoursWorked: 0,
              regularHours: 0,
              overtimeHours: 0
            };
          }

          // Add punch to the day
          employee.attendance[monthKey].days[dayKey].punches.push({
            time: record.time,
            timestamp: record.timestamp,
            method: record.method,
            deviceId: record.deviceId
          });

          // Sort punches by time
          employee.attendance[monthKey].days[dayKey].punches.sort((a, b) => 
            (a.time || '').localeCompare(b.time || '')
          );

          // Calculate check-in (first) and check-out (last)
          const dayPunches = employee.attendance[monthKey].days[dayKey].punches;
          employee.attendance[monthKey].days[dayKey].checkIn = dayPunches[0].time;
          
          if (dayPunches.length > 1) {
            const lastPunchTime = dayPunches[dayPunches.length - 1].time;
            
            // Only set checkout if it's different from check-in (multiple punches)
            if (lastPunchTime !== dayPunches[0].time) {
              employee.attendance[monthKey].days[dayKey].checkOut = lastPunchTime;
              
              // Calculate hours worked
              const checkInTime = new Date(`${record.date}T${dayPunches[0].time}`);
              const checkOutTime = new Date(`${record.date}T${lastPunchTime}`);
              const diffMs = checkOutTime - checkInTime;
              const hoursWorked = Math.max(0, diffMs / (1000 * 60 * 60));
              
              employee.attendance[monthKey].days[dayKey].hoursWorked = parseFloat(hoursWorked.toFixed(2));
              employee.attendance[monthKey].days[dayKey].regularHours = parseFloat(Math.min(hoursWorked, 10).toFixed(2));
              employee.attendance[monthKey].days[dayKey].overtimeHours = parseFloat(Math.max(0, hoursWorked - 10).toFixed(2));
            } else {
              // Same time = still working (no checkout yet)
              employee.attendance[monthKey].days[dayKey].checkOut = null;
            }
          } else {
            // Only one punch = still working (no checkout yet)
            employee.attendance[monthKey].days[dayKey].checkOut = null;
          }
        }

        // Update employee document with new attendance data
        await db.collection("employee").updateOne(
          { empID: employeeId },
          { 
            $set: { 
              attendance: employee.attendance,
              updatedAt: new Date()
            } 
          }
        );
      }
      
      console.log(`[ZKTeco MongoDB] Processed ${recordsToInsert.length} attendance records for ${Object.keys(employeeGroups).length} employee(s) - written to nested structure.`);
    }

    // Return OK to device
    return new Response("OK", {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[ZKTeco Processing Error]:", error);
    return new Response("ERROR", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
