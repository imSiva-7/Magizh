import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const METHOD_NAMES = {
  GET: "GET /api/supplier",
  POST: "POST /api/supplier",
  PUT: "PUT /api/supplier",
  DELETE: "DELETE /api/supplier",
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

// GET all suppliers OR single supplier by ID
export async function GET(request) {
  const METHOD = METHOD_NAMES.GET;

  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get("supplierId");
    const search = searchParams.get("search");

    const db = await getDatabase();

    // CASE 1: Get single supplier by ID
    if (supplierId) {
      if (!ObjectId.isValid(supplierId)) {
        return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
      }

      const supplier = await db
        .collection("suppliers")
        .findOne({ _id: new ObjectId(supplierId) });

      if (!supplier) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json(supplier);
    }

    // CASE 2: Get all suppliers (with optional search)
    const query = {};
    if (search && search.trim()) {
      const searchTerm = search.trim();
      query.$or = [
        { supplierName: { $regex: searchTerm, $options: "i" } },
        { supplierType: { $regex: searchTerm, $options: "i" } },
        { supplierNumber: { $regex: searchTerm, $options: "i" } },
      ];
    }

    const suppliers = await db
      .collection("suppliers")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(suppliers);
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}

// CREATE a new supplier
export async function POST(request) {
  const METHOD = METHOD_NAMES.POST;

  try {
    const db = await getDatabase();
    const data = await request.json();

    // 1. DUPLICATE PHONE CHECK (Restored)
    // Even if frontend validates format, backend must ensure uniqueness
    if (data.supplierNumber) {
      const existingSupplier = await db
        .collection("suppliers")
        .findOne({ supplierNumber: data.supplierNumber.trim() });

      if (existingSupplier) {
        return NextResponse.json(
          { error: "Supplier with this phone number already exists" },
          { status: 409 }
        );
      }
    }

    // 2. Insert Data (No basic validation, assuming frontend did it)
    const supplierData = {
      supplierName: data.supplierName.trim(),
      supplierType: data.supplierType?.trim() || "",
      supplierTSRate: data.supplierTSRate,
      supplierNumber: data.supplierNumber?.trim() || "",
      supplierAddress: data.supplierAddress?.trim() || "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("suppliers").insertOne(supplierData);

    return NextResponse.json(
      {
        _id: result.insertedId,
        ...supplierData,
        message: "Supplier created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json(
      { error: "Failed to create supplier", details: error.message },
      { status: 500 }
    );
  }
}

// UPDATE an existing supplier
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

    // 1. DUPLICATE PHONE CHECK (Restored)
    // Only check if number exists AND belongs to a DIFFERENT supplier
    if (data.supplierNumber) {
      const duplicateSupplier = await db.collection("suppliers").findOne({
        supplierNumber: data.supplierNumber.trim(),
        _id: { $ne: new ObjectId(id) }, // Exclude current supplier
      });

      if (duplicateSupplier) {
        return NextResponse.json(
          { error: "Another supplier with this phone number already exists" },
          { status: 409 }
        );
      }
    }

    // 2. Prepare update data
    const updateData = { updatedAt: new Date() };
    if (data.supplierName !== undefined) updateData.supplierName = data.supplierName.trim();
    if (data.supplierType !== undefined) updateData.supplierType = data.supplierType.trim();
    if (data.supplierTSRate !== undefined) updateData.supplierTSRate = data.supplierTSRate;
    if (data.supplierNumber !== undefined) updateData.supplierNumber = data.supplierNumber.trim();
    if (data.supplierAddress !== undefined) updateData.supplierAddress = data.supplierAddress.trim();

    const result = await db
      .collection("suppliers")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Supplier updated successfully" });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

// DELETE a supplier
export async function DELETE(request) {
  const METHOD = METHOD_NAMES.DELETE;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Valid ID required" }, { status: 400 });
    }

    const db = await getDatabase();

    // 1. PROCUREMENT DEPENDENCY CHECK (Restored)
    // Prevent deletion if the supplier has related data
    const procurementCount = await db
      .collection("procurements")
      .countDocuments({ supplierId: new ObjectId(id) });

    if (procurementCount > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete supplier with existing procurements",
          details: `Supplier has ${procurementCount} associated procurement(s)`,
        },
        { status: 409 }
      );
    }

    // 2. Delete Supplier
    const result = await db
      .collection("suppliers")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: "Supplier deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}