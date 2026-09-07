import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { ObjectId } from "mongodb";

const METHOD_NAMES = {
  GET: "GET /api/employee",
  POST: "POST /api/employee",
  PUT: "PUT /api/employee",
  DELETE: "DELETE /api/employee",
};

export async function GET(request) {
  const METHOD = METHOD_NAMES.GET;

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const empID = searchParams.get("empID"); // For checking empID availability
    const search = searchParams.get("search");

    const db = await getDatabase();

    // Handle empID availability check (for real-time validation)
    if (empID) {
      const existingEmployee = await db
        .collection("employee")
        .findOne({ empID: empID });

      return NextResponse.json({
        available: !existingEmployee,
        empID: empID,
      });
    }

    // Handle single employee fetch by _id
    if (employeeId) {
      if (!ObjectId.isValid(employeeId)) {
        return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
      }

      const employee = await db
        .collection("employee")
        .findOne({ _id: new ObjectId(employeeId) });

      if (!employee) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json(employee);
    }

    // Handle search and list all employees
    const query = {};
    if (search && search.trim()) {
      const searchTerm = search.trim();
      query.$or = [
        { name: { $regex: searchTerm, $options: "i" } },
        { empID: { $regex: searchTerm, $options: "i" } },
        { mobile: { $regex: searchTerm, $options: "i" } },
        { gender: { $regex: searchTerm, $options: "i" } },
      ];
    }

    const employees = await db
      .collection("employee")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(employees);
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}

// CREATE a new employee
export async function POST(request) {
  const METHOD = METHOD_NAMES.POST;

  try {
    const db = await getDatabase();
    const data = await request.json();

    // Validate empID format (4 digits)
    if (!data.empID || !/^\d{4}$/.test(data.empID)) {
      return NextResponse.json(
        { error: "Employee ID must be exactly 4 digits" },
        { status: 400 }
      );
    }

    // Check empID uniqueness
    const existingEmployee = await db
      .collection("employees")
      .findOne({ empID: data.empID });

    if (existingEmployee) {
      return NextResponse.json(
        { error: "Employee ID already exists" },
        { status: 409 }
      );
    }

    // Check mobile number uniqueness (if provided)
    if (data.mobile && data.mobile.trim()) {
      const existingMobile = await db
        .collection("employee")
        .findOne({ mobile: data.mobile.trim() });

      if (existingMobile) {
        return NextResponse.json(
          { error: "Mobile number already exists" },
          { status: 409 }
        );
      }
    }

    // Validate required fields
    if (!data.name || !data.name.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (!data.salary || isNaN(parseFloat(data.salary)) || parseFloat(data.salary) <= 0) {
      return NextResponse.json(
        { error: "Valid salary is required" },
        { status: 400 }
      );
    }

    if (!data.gender || !data.gender.trim()) {
      return NextResponse.json(
        { error: "Gender is required" },
        { status: 400 }
      );
    }

    // Insert employee data
    const employeeData = {
      name: data.name.trim(),
      empID: data.empID,
      salary: parseFloat(data.salary),
      mobile: data.mobile?.trim() || "",
      gender: data.gender.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("employee").insertOne(employeeData);

    return NextResponse.json(
      {
        _id: result.insertedId,
        ...employeeData,
        message: "Employee created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json(
      { error: "Failed to create employee", details: error.message },
      { status: 500 }
    );
  }
}

// UPDATE an existing employee
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

    // Validate empID format if provided (4 digits)
    if (data.empID && !/^\d{4}$/.test(data.empID)) {
      return NextResponse.json(
        { error: "Employee ID must be exactly 4 digits" },
        { status: 400 }
      );
    }

    // Check empID uniqueness (exclude current employee)
    if (data.empID) {
      const duplicateEmpID = await db.collection("employee").findOne({
        empID: data.empID,
        _id: { $ne: new ObjectId(id) },
      });

      if (duplicateEmpID) {
        return NextResponse.json(
          { error: "Another employee with this ID already exists" },
          { status: 409 }
        );
      }
    }

    // Check mobile number uniqueness (exclude current employee)
    if (data.mobile && data.mobile.trim()) {
      const duplicateMobile = await db.collection("employee").findOne({
        mobile: data.mobile.trim(),
        _id: { $ne: new ObjectId(id) },
      });

      if (duplicateMobile) {
        return NextResponse.json(
          { error: "Another employee with this mobile number already exists" },
          { status: 409 }
        );
      }
    }

    // Prepare update data
    const updateData = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.empID !== undefined) updateData.empID = data.empID;
    if (data.salary !== undefined) updateData.salary = parseFloat(data.salary);
    if (data.mobile !== undefined) updateData.mobile = data.mobile.trim();
    if (data.gender !== undefined) updateData.gender = data.gender.trim();

    const result = await db
      .collection("employee")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Employee updated successfully" });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

// DELETE an employee
export async function DELETE(request) {
  const METHOD = METHOD_NAMES.DELETE;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Valid ID required" }, { status: 400 });
    }

    const db = await getDatabase();

    // Delete employee
    const result = await db
      .collection("employee")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: "Employee deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
