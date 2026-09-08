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
 * GET: Fetch attendance records for an employee with salary calculations
 * Query params:
 * - empID: Employee ID (4-digit)
 * - startDate: Start date filter (YYYY-MM-DD)
 * - endDate: End date filter (YYYY-MM-DD)
 * - month: Get data for specific month (YYYY-MM)
 */
export async function GET(request) {
  const METHOD = METHOD_NAMES.GET;

  try {
    const { searchParams } = new URL(request.url);
    const empID = searchParams.get("empID");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const month = searchParams.get("month");

    const db = await getDatabase();

    if (!empID) {
      return NextResponse.json(
        { error: "empID is required" },
        { status: 400 }
      );
    }

    // Fetch employee details
    const employee = await db.collection("employee").findOne({ empID });

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    // Build date filter - use employeeId (from device) to match with empID (from employees)
    let dateFilter = { employeeId: empID };

    if (month) {
      // If month provided (YYYY-MM), get records for that month
      const [year, monthNum] = month.split("-");
      const startOfMonth = `${year}-${monthNum}-01`;
      const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
      const endOfMonth = `${year}-${monthNum}-${String(lastDay).padStart(2, "0")}`;
      
      dateFilter.date = {
        $gte: startOfMonth,
        $lte: endOfMonth,
      };
    } else if (startDate && endDate) {
      dateFilter.date = {
        $gte: startDate,
        $lte: endDate,
      };
    } else if (startDate) {
      dateFilter.date = { $gte: startDate };
    } else if (endDate) {
      dateFilter.date = { $lte: endDate };
    }

    // Fetch attendance records
    const attendanceRecords = await db
      .collection("attendance")
      .find(dateFilter)
      .sort({ date: 1, time: 1 })
      .toArray();

    // Calculate work hours per day
    // Since there's only one machine, first punch = check-in, last punch = check-out
    const dailyRecords = {};

    attendanceRecords.forEach((record) => {
      const date = record.date;
      if (!dailyRecords[date]) {
        dailyRecords[date] = {
          date,
          checkIn: null,
          checkOut: null,
          records: [],
        };
      }
      dailyRecords[date].records.push(record);
    });

    // Process each day to determine first and last punch
    Object.keys(dailyRecords).forEach((date) => {
      const dayRecords = dailyRecords[date].records;
      
      if (dayRecords.length > 0) {
        // Sort records by time to get first and last
        dayRecords.sort((a, b) => {
          const timeA = a.time || "00:00:00";
          const timeB = b.time || "00:00:00";
          return timeA.localeCompare(timeB);
        });

        // First punch = check-in
        dailyRecords[date].checkIn = dayRecords[0].time;
        
        // Last punch = check-out (if there's more than one punch)
        if (dayRecords.length > 1) {
          dailyRecords[date].checkOut = dayRecords[dayRecords.length - 1].time;
        }
      }
    });

    // Calculate hours worked per day
    const processedDays = Object.values(dailyRecords).map((day) => {
      let hoursWorked = 0;
      let regularHours = 0;
      let overtimeHours = 0;

      if (day.checkIn && day.checkOut) {
        const checkInTime = new Date(`${day.date}T${day.checkIn}`);
        const checkOutTime = new Date(`${day.date}T${day.checkOut}`);
        
        const diffMs = checkOutTime - checkInTime;
        hoursWorked = Math.max(0, diffMs / (1000 * 60 * 60)); // Convert to hours

        // Standard is 10 hours per day
        regularHours = Math.min(hoursWorked, 10);
        overtimeHours = Math.max(0, hoursWorked - 10);
      }

      return {
        ...day,
        hoursWorked: parseFloat(hoursWorked.toFixed(2)),
        regularHours: parseFloat(regularHours.toFixed(2)),
        overtimeHours: parseFloat(overtimeHours.toFixed(2)),
      };
    });

    // Calculate totals
    const totalRegularHours = processedDays.reduce((sum, day) => sum + day.regularHours, 0);
    const totalOvertimeHours = processedDays.reduce((sum, day) => sum + day.overtimeHours, 0);
    const totalHoursWorked = processedDays.reduce((sum, day) => sum + day.hoursWorked, 0);

    // Calculate days in the period
    let daysInPeriod = 0;
    if (month) {
      const [year, monthNum] = month.split("-");
      daysInPeriod = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
    } else if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      daysInPeriod = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    } else {
      daysInPeriod = processedDays.length;
    }

    // Salary calculations
    const standardHours = daysInPeriod * 10; // 10 hours per day
    const hourlyRate = employee.salary / standardHours;
    const overtimeRate = hourlyRate; // Same rate as regular pay

    const regularPay = totalRegularHours * hourlyRate;
    const overtimePay = totalOvertimeHours * overtimeRate;
    const grossSalary = regularPay + overtimePay;

    // Fetch advances for this period
    const advanceFilter = { empID };
    if (month) {
      advanceFilter.month = month;
    } else if (startDate && endDate) {
      advanceFilter.date = {
        $gte: startDate,
        $lte: endDate,
      };
    }

    const advances = await db
      .collection("advances")
      .find(advanceFilter)
      .sort({ date: -1 })
      .toArray();

    const totalAdvances = advances.reduce((sum, adv) => sum + adv.amount, 0);
    const netSalary = grossSalary - totalAdvances;

    return NextResponse.json({
      employee: {
        empID: employee.empID,
        name: employee.name,
        salary: employee.salary,
        mobile: employee.mobile,
      },
      period: {
        startDate: startDate || processedDays[0]?.date,
        endDate: endDate || processedDays[processedDays.length - 1]?.date,
        daysInPeriod,
        daysWorked: processedDays.length,
        month,
      },
      attendance: processedDays,
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
 * POST: Add an advance payment for an employee
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

    const advanceData = {
      empID: data.empID,
      amount: parseFloat(data.amount),
      date: data.date || new Date().toISOString().split("T")[0],
      month: data.month || new Date().toISOString().slice(0, 7), // YYYY-MM
      reason: data.reason?.trim() || "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("advances").insertOne(advanceData);

    return NextResponse.json(
      {
        _id: result.insertedId,
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
 * PUT: Update an advance payment
 */
export async function PUT(request) {
  const METHOD = METHOD_NAMES.PUT;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Valid ID required" }, { status: 400 });
    }

    const db = await getDatabase();
    const data = await request.json();

    const updateData = { updatedAt: new Date() };
    if (data.amount !== undefined) updateData.amount = parseFloat(data.amount);
    if (data.date !== undefined) updateData.date = data.date;
    if (data.month !== undefined) updateData.month = data.month;
    if (data.reason !== undefined) updateData.reason = data.reason.trim();

    const result = await db
      .collection("advances")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Advance payment not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Advance payment updated successfully" });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

/**
 * DELETE: Delete an advance payment
 */
export async function DELETE(request) {
  const METHOD = METHOD_NAMES.DELETE;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Valid ID required" }, { status: 400 });
    }

    const db = await getDatabase();

    const result = await db
      .collection("advances")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Advance payment not found" }, { status: 404 });
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
