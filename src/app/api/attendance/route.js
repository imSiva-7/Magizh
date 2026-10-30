import { requireSummaryAdmin } from "@/lib/summary-auth";
import { buildPayroll, validMonth } from "@/lib/payroll";
import { month as indiaMonth } from "@/lib/india-date.mjs";
import { requireAdmin, requireStaff } from "@/lib/mutation-auth";
import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { ObjectId } from "mongodb";
import { getTodayDate } from "@/utils/dateUtils";
import { moneyCents } from "@/lib/customer-payments.mjs";

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
  const denied = await requireSummaryAdmin();
  if (denied) return denied;
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

    if (!validMonth(month)) {
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

    return NextResponse.json(buildPayroll(employee, month, getTodayDate()));
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
    if (typeof data.empID !== "string" || !data.empID) {
      return NextResponse.json(
        { error: "empID is required" },
        { status: 400 }
      );
    }

    let amount;
    try { amount = moneyCents(data.amount) / 100; } catch {
      return NextResponse.json({ error: "Enter a valid positive amount with at most two decimal places" }, { status: 400 });
    }
    if (amount <= 0) {
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

    const month = data.month || indiaMonth(); // YYYY-MM
    if (!validMonth(month)) return NextResponse.json({ error: "Invalid month" }, { status: 400 });
    const advanceData = {
      _id: new ObjectId().toString(),
      amount,
      date: data.date || getTodayDate(),
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
        $set: { [`payroll.${month}`]: null, updatedAt: new Date() }
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

    if (!id || !empID || !validMonth(month)) {
      return NextResponse.json(
        { error: "id, empID, and month are required" },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const data = await request.json();

    let amount;
    if (data.amount !== undefined) {
      try { amount = moneyCents(data.amount) / 100; } catch {
        return NextResponse.json({ error: "Enter a valid positive amount with at most two decimal places" }, { status: 400 });
      }
      if (amount <= 0) return NextResponse.json({ error: "Advance amount must be greater than zero" }, { status: 400 });
    }

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
    if (amount !== undefined) advances[advanceIndex].amount = amount;
    if (data.date !== undefined) advances[advanceIndex].date = data.date;
    if (data.reason !== undefined) advances[advanceIndex].reason = data.reason.trim();

    await db.collection("employee").updateOne(
      { empID },
      { 
        $set: { 
          [`advances.${month}`]: advances,
          [`payroll.${month}`]: null,
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

    if (!id || !empID || !validMonth(month)) {
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
        $set: { [`payroll.${month}`]: null, updatedAt: new Date() }
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
