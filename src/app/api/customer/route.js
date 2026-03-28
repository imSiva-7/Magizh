import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";


const METHOD_NAMES = {
  GET: "GET /api/customer",
  POST: "POST /api/customer",
  PUT: "PUT /api/customer",
  DELETE: "DELETE /api/customer",
};

const getDatabase = async () => {
  try {
    const client = await clientPromise;
    return client.db("production");
  } catch (error) {
    console.error("Database connection error:", error);
    throw new Error("Database error");
  }
};

// Helper: parse price field to number or null
const parsePrice = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
};

// GET all customers OR single customer by ID
export async function GET(request) {
  const METHOD = METHOD_NAMES.GET;

  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const search = searchParams.get("search");

    const db = await getDatabase();

    // CASE 1: Get single customer by ID
    if (customerId) {
      if (!ObjectId.isValid(customerId)) {
        return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
      }

      const customer = await db
        .collection("customers")
        .findOne({ _id: new ObjectId(customerId) });

      if (!customer) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json(customer);
    }

    // CASE 2: Get all customers (with optional search)
    const query = {};
    if (search && search.trim()) {
      const searchTerm = search.trim();
      query.$or = [
        { customerName: { $regex: searchTerm, $options: "i" } },
        { customerType: { $regex: searchTerm, $options: "i" } },
        { customerNumber: { $regex: searchTerm, $options: "i" } },
      ];
    }

    const customers = await db
      .collection("customers")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(customers);
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}

// CREATE a new customer
export async function POST(request) {

  const METHOD = METHOD_NAMES.POST;

  try {
    const db = await getDatabase();
    const data = await request.json();

    // 1. DUPLICATE PHONE CHECK
    if (data.customerNumber) {
      const existingCustomer = await db
        .collection("customers")
        .findOne({ customerNumber: data.customerNumber.trim() });

      if (existingCustomer) {
        return NextResponse.json(
          { error: "Customer with this phone number already exists" },
          { status: 409 },
        );
      }
    }

    // 2. Insert Data (including price fields)
    const customerData = {
      customerName: data.customerName.trim(),
      customerType: data.customerType?.trim() || "",
      customerNumber: data.customerNumber?.trim() || "",
      customerGST: data.customerGST?.trim() || "",
      customerAddress: data.customerAddress?.trim() || "",
      // Price fields
      milkPrice: parsePrice(data.milkPrice),
      butterPrice: parsePrice(data.butterPrice),
      freshCreamPrice: parsePrice(data.freshCreamPrice),
      curdPrice: parsePrice(data.curdPrice),
      gheePrice: parsePrice(data.gheePrice),
      softPaneerPrice: parsePrice(data.softPaneerPrice),
      premiumPaneerPrice: parsePrice(data.premiumPaneerPrice),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("customers").insertOne(customerData);

    return NextResponse.json(
      {
        _id: result.insertedId,
        ...customerData,
        message: "Customer created successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json(
      { error: "Failed to create customer", details: error.message },
      { status: 500 },
    );
  }
}

// UPDATE an existing customer
export async function PUT(request) {

   const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const METHOD = METHOD_NAMES.PUT;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Valid ID required" }, { status: 400 });
    }

    const db = await getDatabase();
    const data = await request.json();

    // 1. DUPLICATE PHONE CHECK
    if (data.customerNumber) {
      const duplicateCustomer = await db.collection("customers").findOne({
        customerNumber: data.customerNumber.trim(),
        _id: { $ne: new ObjectId(id) },
      });

      if (duplicateCustomer) {
        return NextResponse.json(
          { error: "Another customer with this phone number already exists" },
          { status: 409 },
        );
      }
    }

    // 2. Prepare update data (including price fields)
    const updateData = { updatedAt: new Date() };
    if (data.customerName !== undefined)
      updateData.customerName = data.customerName.trim();
    if (data.customerType !== undefined)
      updateData.customerType = data.customerType.trim();
    if (data.customerNumber !== undefined)
      updateData.customerNumber = data.customerNumber.trim();
    if (data.customerGST !== undefined)
      updateData.customerGST = data.customerGST.trim();
    if (data.customerAddress !== undefined)
      updateData.customerAddress = data.customerAddress.trim();
    // Price fields
    if (data.milkPrice !== undefined)
      updateData.milkPrice = parsePrice(data.milkPrice);
    if (data.butterPrice !== undefined)
      updateData.butterPrice = parsePrice(data.butterPrice);
    if (data.freshCreamPrice !== undefined)
      updateData.freshCreamPrice = parsePrice(data.freshCreamPrice);
    if (data.curdPrice !== undefined)
      updateData.curdPrice = parsePrice(data.curdPrice);
    if (data.gheePrice !== undefined)
      updateData.gheePrice = parsePrice(data.gheePrice);
    if (data.softPaneerPrice !== undefined)
      updateData.softPaneerPrice = parsePrice(data.softPaneerPrice);
    if (data.premiumPaneerPrice !== undefined)
      updateData.premiumPaneerPrice = parsePrice(data.premiumPaneerPrice);

    const result = await db
      .collection("customers")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: "Customer updated successfully" });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(request) {
  const METHOD = METHOD_NAMES.DELETE;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Valid ID required" }, { status: 400 });
    }

    const db = await getDatabase();

    // 1. ORDERS DEPENDENCY CHECK
    const orderCount = await db
      .collection("orders")
      .countDocuments({ customerId: new ObjectId(id) });

    if (orderCount > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete customer with existing orders",
          details: `Customer has ${orderCount} associated order(s)`,
        },
        { status: 409 },
      );
    }

    // 2. Delete Customer
    const result = await db
      .collection("customers")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      message: "Customer deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}