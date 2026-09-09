import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { ObjectId } from "mongodb";

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

    // Convert days object to array for frontend
    const attendanceArray = Object.keys(monthData.days || {})
      .sort()
      .map(dayKey => ({
        date: monthData.days[dayKey].date,
        checkIn: monthData.days[dayKey].checkIn,
        checkOut: monthData.days[dayKey].checkOut,
        hoursWorked: monthData.days[dayKey].hoursWorked || 0,
        regularHours: monthData.days[dayKey].regularHours || 0,
        overtimeHours: monthData.days[dayKey].overtimeHours || 0,
        punches: monthData.days[dayKey].punches || []
      }));

    // Calculate totals from daily data
    const totalHoursWorked = attendanceArray.reduce((sum, day) => sum + day.hoursWorked, 0);
    const totalRegularHours = attendanceArray.reduce((sum, day) => sum + day.regularHours, 0);
    const totalOvertimeHours = attendanceArray.reduce((sum, day) => sum + day.overtimeHours, 0);

    // Calculate days in the month
    const [year, monthNum] = month.split("-");
    const daysInPeriod = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
    const daysWorked = attendanceArray.length;

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
