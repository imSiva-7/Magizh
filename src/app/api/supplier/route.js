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
      console.log("Fetching single supplier with ID:", supplierId);

      // Validate ObjectId format
      if (!ObjectId.isValid(supplierId)) {
        return NextResponse.json(
          {
            error: "Invalid supplier ID format",
            details: "Supplier ID must be a valid 24-character hex string",
          },
          { status: 400 }
        );
      }

      const supplier = await db
        .collection("suppliers")
        .findOne({ _id: new ObjectId(supplierId) });

      if (!supplier) {
        return NextResponse.json(
          {
            error: "Supplier not found",
            details: `No supplier found with ID: ${supplierId}`,
          },
          { status: 404 }
        );
      }

      console.log("Found supplier:", supplier.supplierName);
      return NextResponse.json(supplier); // Return single object
    }

    // CASE 2: Get all suppliers (with optional search)
    console.log("Fetching all suppliers, search term:", search || "none");

    const query = {};

    // Add search filter if provided
    if (search && search.trim()) {
      const searchTerm = search.trim();
      query.$or = [
        { supplierName: { $regex: searchTerm, $options: "i" } },
        { supplierType: { $regex: searchTerm, $options: "i" } },
        { supplierNumber: { $regex: searchTerm, $options: "i" } },
        { supplierAddress: { $regex: searchTerm, $options: "i" } },
      ];
    }

    const suppliers = await db
      .collection("suppliers")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    console.log(`Found ${suppliers.length} suppliers`);
    return NextResponse.json(suppliers); // Return array
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

    // Validation helper
    const validateField = (field, value, minLength = 0) => {
      if (
        value !== undefined &&
        value !== null &&
        value.toString().trim().length < minLength
      ) {
        return `must be at least ${minLength} characters`;
      }
      return null;
    };

    // Validate required fields
    const errors = [];

    if (!data.supplierName?.trim()) {
      errors.push("Supplier name is required");
    } else {
      const nameError = validateField("supplierName", data.supplierName, 2);
      if (nameError) errors.push(`Supplier name ${nameError}`);
    }

    if (data.supplierType) {
      const typeError = validateField("supplierType", data.supplierType, 2);
      if (typeError) errors.push(`Supplier type ${typeError}`);
    }

    if (data.supplierNumber) {
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(data.supplierNumber.trim())) {
        errors.push("Phone number must be a valid 10-digit number");
      } else {
        // Check for duplicate phone number
        const existingSupplier = await db
          .collection("suppliers")
          .findOne({ supplierNumber: data.supplierNumber.trim() });

        if (existingSupplier) {
          errors.push("Supplier with this phone number already exists");
        }
      }
    }

    if (data.supplierAddress) {
      const addressError = validateField(
        "supplierAddress",
        data.supplierAddress,
        5
      );
      if (addressError) errors.push(`Address ${addressError}`);
    }

    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: errors,
        },
        { status: 400 }
      );
    }

    // Prepare supplier data
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

    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid supplier ID format" },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const data = await request.json();

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

    // Prepare update data with validation
    const updateData = { updatedAt: new Date() };
    const errors = [];

    // Validate and add fields that are being updated
    if (data.supplierName !== undefined) {
      if (!data.supplierName.trim()) {
        errors.push("Supplier name is required");
      } else if (data.supplierName.trim().length < 2) {
        errors.push("Supplier name must be at least 2 characters");
      } else {
        updateData.supplierName = data.supplierName.trim();
      }
    }

    if (data.supplierType !== undefined) {
      if (data.supplierType.trim() && data.supplierType.trim().length < 2) {
        errors.push("Supplier type must be at least 2 characters if provided");
      } else {
        updateData.supplierType = data.supplierType.trim() || "";
      }
    }

    if (data.supplierNumber !== undefined) {
      if (data.supplierNumber.trim()) {
        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(data.supplierNumber.trim())) {
          errors.push("Phone number must be a valid 10-digit number");
        } else if (data.supplierNumber !== existingSupplier.supplierNumber) {
          // Check for duplicate only if number is changing
          const duplicateSupplier = await db.collection("suppliers").findOne({
            supplierNumber: data.supplierNumber.trim(),
            _id: { $ne: new ObjectId(id) },
          });

          if (duplicateSupplier) {
            errors.push(
              "Another supplier with this phone number already exists"
            );
          }
        }
        updateData.supplierNumber = data.supplierNumber.trim();
      } else {
        updateData.supplierNumber = "";
      }
    }

    if (data.supplierAddress !== undefined) {
      if (
        data.supplierAddress.trim() &&
        data.supplierAddress.trim().length < 5
      ) {
        errors.push("Address must be at least 5 characters if provided");
      } else {
        updateData.supplierAddress = data.supplierAddress.trim() || "";
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: errors,
        },
        { status: 400 }
      );
    }

    // Update supplier
    const result = await db
      .collection("suppliers")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Supplier not found" },
        { status: 404 }
      );
    }

    // Fetch and return updated supplier
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

    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid supplier ID format" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

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

    // Check if supplier has associated procurements
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
      deletedName: existingSupplier.supplierName,
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
