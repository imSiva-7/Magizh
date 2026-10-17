import { requireAdmin, requireStaff } from "@/lib/mutation-auth";
import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { ObjectId } from "mongodb";
import { getTodayDate } from "@/utils/dateUtils";

const METHOD_NAMES = {
  GET: "GET /api/attendance",
  POST: "POST /api/attendance",
  PUT: "PUT /api/attendance",
  DELETE: "DELETE /api/attendance",
};

/**
 * GET: Fetch attendance records for an employee from nested structure
 * Query params:
 * - empID: Employee ID (4-digit)
 * - month: Get data for specific month (YYYY-MM) - REQUIRED
 */
export async function GET(request) {
  const METHOD = METHOD_NAMES.GET;

  try {
    const { searchParams } = new URL(request.url);
    const empID = searchParams.get("empID");
    const month = searchParams.get("month");

    const db = await getDatabase();

    if (!empID) {
      return NextResponse.json(
        { error: "empID is required" },
        { status: 400 }
      );
    }

    if (!month) {
      return NextResponse.json(
        { error: "month is required (format: YYYY-MM)" },
        { status: 400 }
      );
    }

    // Fetch employee with nested attendance data - SINGLE QUERY!
    const employee = await db.collection("employee").findOne({ empID });

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    // Get attendance data for the requested month - INSTANT ACCESS!
    const monthData = employee.attendance?.[month] || { 
      days: {}, 
      totalHours: 0, 
      regularHours: 0, 
      overtimeHours: 0, 
      daysWorked: 0 
    };
    
    // Get advances for the month - INSTANT ACCESS!
    const advances = employee.advances?.[month] || [];

    // Calculate days in the month
    const [year, monthNum] = month.split("-");
    const daysInPeriod = new Date(parseInt(year), parseInt(monthNum), 0).getDate();

    // Create a map of existing attendance records
    const attendanceMap = new Map();
    Object.keys(monthData.days || {}).forEach(dayKey => {
      const day = monthData.days[dayKey];
      attendanceMap.set(day.date, {
        date: day.date,
        checkIn: day.checkIn,
        checkOut: day.checkOut || "",
        hoursWorked: day.hoursWorked || 0,
        regularHours: day.regularHours || 0,
        overtimeHours: day.overtimeHours || 0,
        punches: day.punches || [],
        status: "present"
      });
    });

    // Generate all dates in the month and mark absent days (only up to today)
    const attendanceArray = [];
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 0-indexed
    const currentDay = today.getDate();
    
    // Determine the last day to show (either end of month or today, whichever is earlier)
    let lastDayToShow = daysInPeriod;
    if (parseInt(year) === currentYear && parseInt(monthNum) === currentMonth) {
      lastDayToShow = currentDay; // Only show up to today for current month
    }
    
    for (let day = 1; day <= lastDayToShow; day++) {
      const dateStr = `${year}-${monthNum}-${String(day).padStart(2, '0')}`;
      
      if (attendanceMap.has(dateStr)) {
        // Employee was present
        attendanceArray.push(attendanceMap.get(dateStr));
      } else {
        // Employee was absent
        attendanceArray.push({
          date: dateStr,
          checkIn: "-",
          checkOut: "-",
          hoursWorked: 0,
          regularHours: 0,
          overtimeHours: 0,
          punches: [],
          status: "absent"
        });
      }
    }

    // Calculate totals from daily data (only present days)
    const presentDays = attendanceArray.filter(day => day.status === "present");
    const totalHoursWorked = presentDays.reduce((sum, day) => sum + day.hoursWorked, 0);
    const totalRegularHours = presentDays.reduce((sum, day) => sum + day.regularHours, 0);
    const totalOvertimeHours = presentDays.reduce((sum, day) => sum + day.overtimeHours, 0);

    const daysWorked = presentDays.length;

    // Salary calculations
    const standardHours = daysInPeriod * 10; // 10 hours per day
    const hourlyRate = employee.salary / standardHours;
    const overtimeRate = hourlyRate; // Same rate as regular pay

    const regularPay = totalRegularHours * hourlyRate;
    const overtimePay = totalOvertimeHours * overtimeRate;
    const grossSalary = regularPay + overtimePay;

    // Calculate total advances
    const totalAdvances = advances.reduce((sum, adv) => sum + (adv.amount || 0), 0);
    const netSalary = grossSalary - totalAdvances;

    // Get start and end dates
    const startDate = attendanceArray.length > 0 ? attendanceArray[0].date : `${month}-01`;
    const endDate = attendanceArray.length > 0 ? attendanceArray[attendanceArray.length - 1].date : `${month}-${String(daysInPeriod).padStart(2, '0')}`;

    return NextResponse.json({
      employee: {
        empID: employee.empID,
        name: employee.name,
        salary: employee.salary,
        mobile: employee.mobile,
      },
      period: {
        startDate,
        endDate,
        daysInPeriod,
        daysWorked,
        month,
      },
      attendance: attendanceArray,
      summary: {
        totalHoursWorked: parseFloat(totalHoursWorked.toFixed(2)),
        totalRegularHours: parseFloat(totalRegularHours.toFixed(2)),
        totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
        standardHours,
        hourlyRate: parseFloat(hourlyRate.toFixed(2)),
        overtimeRate: parseFloat(overtimeRate.toFixed(2)),
        regularPay: parseFloat(regularPay.toFixed(2)),
        overtimePay: parseFloat(overtimePay.toFixed(2)),
        grossSalary: parseFloat(grossSalary.toFixed(2)),
        totalAdvances: parseFloat(totalAdvances.toFixed(2)),
        netSalary: parseFloat(netSalary.toFixed(2)),
      },
      advances,
    });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch attendance data", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST: Add an advance payment for an employee (nested in employee.advances)
 */
export async function POST(request) {
  const denied = await requireStaff();
  if (denied) return denied;
  const METHOD = METHOD_NAMES.POST;

  try {
    const db = await getDatabase();
    const data = await request.json();

    // Validate required fields
    if (!data.empID) {
      return NextResponse.json(
        { error: "empID is required" },
        { status: 400 }
      );
    }

    if (!data.amount || isNaN(parseFloat(data.amount)) || parseFloat(data.amount) <= 0) {
      return NextResponse.json(
        { error: "Valid amount is required" },
        { status: 400 }
      );
    }

    // Check if employee exists
    const employee = await db.collection("employee").findOne({ empID: data.empID });
    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    const month = data.month || new Date().toISOString().slice(0, 7); // YYYY-MM
    const advanceData = {
      _id: new ObjectId().toString(),
      amount: parseFloat(data.amount),
      date: data.date || new Date().toISOString().split("T")[0],
      reason: data.reason?.trim() || "",
      createdAt: new Date(),
    };

    // Initialize advances object if it doesn't exist
    if (!employee.advances) {
      await db.collection("employee").updateOne(
        { empID: data.empID },
        { $set: { advances: {} } }
      );
    }

    // Add advance to the month's array
    await db.collection("employee").updateOne(
      { empID: data.empID },
      { 
        $push: { [`advances.${month}`]: advanceData },
        $set: { updatedAt: new Date() }
      }
    );

    return NextResponse.json(
      {
        ...advanceData,
        message: "Advance payment recorded successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json(
      { error: "Failed to record advance payment", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT: Update an advance payment (nested in employee.advances)
 */
export async function PUT(request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const METHOD = METHOD_NAMES.PUT;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const empID = searchParams.get("empID");
    const month = searchParams.get("month");

    if (!id || !empID || !month) {
      return NextResponse.json(
        { error: "id, empID, and month are required" },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const data = await request.json();

    // Find the employee and update the specific advance
    const employee = await db.collection("employee").findOne({ empID });
    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const advances = employee.advances?.[month] || [];
    const advanceIndex = advances.findIndex(adv => adv._id === id);

    if (advanceIndex === -1) {
      return NextResponse.json({ error: "Advance not found" }, { status: 404 });
    }

    // Update the advance
    if (data.amount !== undefined) advances[advanceIndex].amount = parseFloat(data.amount);
    if (data.date !== undefined) advances[advanceIndex].date = data.date;
    if (data.reason !== undefined) advances[advanceIndex].reason = data.reason.trim();

    await db.collection("employee").updateOne(
      { empID },
      { 
        $set: { 
          [`advances.${month}`]: advances,
          updatedAt: new Date()
        } 
      }
    );

    return NextResponse.json({ message: "Advance payment updated successfully" });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

/**
 * DELETE: Delete an advance payment (nested in employee.advances)
 */
export async function DELETE(request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const METHOD = METHOD_NAMES.DELETE;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const empID = searchParams.get("empID");
    const month = searchParams.get("month");

    if (!id || !empID || !month) {
      return NextResponse.json(
        { error: "id, empID, and month are required" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    // Remove the advance from the month's array
    const result = await db.collection("employee").updateOne(
      { empID },
      { 
        $pull: { [`advances.${month}`]: { _id: id } },
        $set: { updatedAt: new Date() }
      }
    );

    if (result.modifiedCount === 0) {
      return NextResponse.json(
        { error: "Advance not found or already deleted" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Advance payment deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
