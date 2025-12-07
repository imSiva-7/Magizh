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

// GET all suppliers or filter by name
export async function GET(request) {
  const METHOD = METHOD_NAMES.GET;

  try {
    const query = {};
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const supplierName = searchParams.get("supplierName");
    const supplierType = searchParams.get("supplierType");

    // Search by supplier name if provided
    if (supplierName) {
      query.supplierName = {
        $regex: supplierName,
        $options: "i", // case-insensitive
      };
    }

    // Search by supplier type if provided
    if (supplierType) {
      query.supplierType = {
        $regex: supplierType,
        $options: "i",
      };
    }

    // General search across supplier name, type, and number
    if (search) {
      query.$or = [
        { supplierName: { $regex: search, $options: "i" } },
        { supplierType: { $regex: search, $options: "i" } },
        { supplierNumber: { $regex: search, $options: "i" } },
      ];
    }

    const db = await getDatabase();
    const entries = await db
      .collection("suppliers")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(entries);
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json(
      {
        error: "Failed to fetch supplier records",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

// CREATE a new supplier
export async function POST(request) {
  const METHOD = METHOD_NAMES.POST;

  try {
    const db = await getDatabase();
    const data = await request.json();

    // Validate required fields
    if (!data.supplierName?.trim()) {
      return NextResponse.json(
        {
          error: "Supplier name is required",
          details: "Missing required field",
        },
        { status: 400 }
      );
    }

    // Validate supplier name length
    if (data.supplierName.trim().length < 2) {
      return NextResponse.json(
        {
          error: "Supplier name must be at least 2 characters",
          details: "Invalid supplier name",
        },
        { status: 400 }
      );
    }

    // Validate supplier type if provided
    if (data.supplierType && data.supplierType.trim().length < 2) {
      return NextResponse.json(
        {
          error: "Supplier type must be at least 2 characters if provided",
          details: "Invalid supplier type",
        },
        { status: 400 }
      );
    }

    // Check if phone number is provided and validate format
    if (data.supplierNumber) {
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(data.supplierNumber.trim())) {
        return NextResponse.json(
          {
            error: "Phone number must be a valid 10-digit number",
            details: "Invalid phone number format",
          },
          { status: 400 }
        );
      }

      // Check if supplier with same number already exists only if number is provided
      const existingSupplier = await db
        .collection("suppliers")
        .findOne({ supplierNumber: data.supplierNumber });

      if (existingSupplier) {
        return NextResponse.json(
          {
            error: "Supplier with this phone number already exists",
            details: "Duplicate phone number",
          },
          { status: 409 }
        );
      }
    }

    // Validate address if provided
    if (data.supplierAddress && data.supplierAddress.trim().length < 5) {
      return NextResponse.json(
        {
          error: "Address must be at least 5 characters if provided",
          details: "Invalid address",
        },
        { status: 400 }
      );
    }

    // Add timestamp
    const supplierData = {
      supplierName: data.supplierName.trim(),
      supplierType: data.supplierType?.trim() || "",
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
      {
        error: "Failed to create supplier",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
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

    if (!id) {
      return NextResponse.json(
        { error: "Supplier ID is required" },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const data = await request.json();

    // Remove _id from update data if present
    delete data._id;

    // Check if supplier exists
    const existingSupplier = await db
      .collection("suppliers")
      .findOne({ _id: new ObjectId(id) });

    if (!existingSupplier) {
      return NextResponse.json(
        { error: "Supplier not found" },
        { status: 404 }
      );
    }

    // Validate supplier name if provided
    if (data.supplierName !== undefined) {
      if (!data.supplierName.trim()) {
        return NextResponse.json(
          {
            error: "Supplier name is required",
            details: "Missing required field",
          },
          { status: 400 }
        );
      }

      // Validate supplier name length
      if (data.supplierName.trim().length < 2) {
        return NextResponse.json(
          {
            error: "Supplier name must be at least 2 characters",
            details: "Invalid supplier name",
          },
          { status: 400 }
        );
      }
    }

    // Validate supplier type if provided
    if (data.supplierType !== undefined && data.supplierType.trim()) {
      if (data.supplierType.trim().length < 2) {
        return NextResponse.json(
          {
            error: "Supplier type must be at least 2 characters if provided",
            details: "Invalid supplier type",
          },
          { status: 400 }
        );
      }
    }

    // Validate phone number if provided
    if (data.supplierNumber !== undefined && data.supplierNumber.trim()) {
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(data.supplierNumber.trim())) {
        return NextResponse.json(
          {
            error: "Phone number must be a valid 10-digit number",
            details: "Invalid phone number format",
          },
          { status: 400 }
        );
      }

      // Check for duplicate phone number only if number is being updated and provided
      if (data.supplierNumber !== existingSupplier.supplierNumber) {
        const duplicateSupplier = await db.collection("suppliers").findOne({
          supplierNumber: data.supplierNumber,
          _id: { $ne: new ObjectId(id) },
        });

        if (duplicateSupplier) {
          return NextResponse.json(
            {
              error: "Another supplier with this phone number already exists",
            },
            { status: 409 }
          );
        }
      }
    }

    // Validate address if provided
    if (data.supplierAddress !== undefined && data.supplierAddress.trim()) {
      if (data.supplierAddress.trim().length < 5) {
        return NextResponse.json(
          {
            error: "Address must be at least 5 characters if provided",
            details: "Invalid address",
          },
          { status: 400 }
        );
      }
    }

    // Prepare update data
    const updateData = {
      ...(data.supplierName !== undefined && {
        supplierName: data.supplierName.trim(),
      }),
      ...(data.supplierType !== undefined && {
        supplierType: data.supplierType.trim() || "",
      }),
      ...(data.supplierNumber !== undefined && {
        supplierNumber: data.supplierNumber.trim() || "",
      }),
      ...(data.supplierAddress !== undefined && {
        supplierAddress: data.supplierAddress.trim() || "",
      }),
      updatedAt: new Date(),
    };

    const result = await db
      .collection("suppliers")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Supplier not found" },
        { status: 404 }
      );
    }

    // Fetch updated supplier
    const updatedSupplier = await db
      .collection("suppliers")
      .findOne({ _id: new ObjectId(id) });

    return NextResponse.json({
      ...updatedSupplier,
      message: "Supplier updated successfully",
    });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json(
      {
        error: "Failed to update supplier",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

// DELETE a supplier
export async function DELETE(request) {
  const METHOD = METHOD_NAMES.DELETE;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Supplier ID is required" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    const existingSupplier = await db
      .collection("suppliers")
      .findOne({ _id: new ObjectId(id) });

    if (!existingSupplier) {
      return NextResponse.json(
        { error: "Supplier not found" },
        { status: 404 }
      );
    }

    // Delete the supplier
    const result = await db
      .collection("suppliers")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Failed to delete supplier" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Supplier deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json(
      {
        error: "Failed to delete supplier",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
