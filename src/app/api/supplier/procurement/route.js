// src/app/api/supplier/procurement/route.js
import { NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

const clientPromise = MongoClient.connect(process.env.MONGODB_URI);

// Validation helper functions
const validateObjectId = (id) => {
  if (!id || !ObjectId.isValid(id)) {
    return { valid: false, error: "Invalid ID format" };
  }
  return { valid: true };
};

const validateProcurementData = (data) => {
  const requiredFields = [
    "date",
    "time",
    "milkQuantity",
    "fatPercentage",
    "snfPercentage",
    "rate",
    "totalAmount",
  ];

  const missingFields = requiredFields.filter((field) => !data[field]);

  if (missingFields.length > 0) {
    return {
      valid: false,
      error: `Missing required fields: ${missingFields.join(", ")}`,
    };
  }

  // Numeric validation
  const numericFields = [
    "milkQuantity",
    "fatPercentage",
    "snfPercentage",
    "rate",
    "totalAmount",
  ];
  for (const field of numericFields) {
    const value = parseFloat(data[field]);
    if (isNaN(value) || value <= 0) {
      return {
        valid: false,
        error: `Invalid ${field}: must be a positive number`,
      };
    }
  }

  // Time validation
  if (!["AM", "PM"].includes(data.time)) {
    return {
      valid: false,
      error: "Time must be either 'AM' or 'PM'",
    };
  }

  return { valid: true };
};

// Check for duplicate entry
const checkDuplicateEntry = async (
  db,
  supplierId,
  date,
  time,
  milkQuantity,
  fatPercentage,
  snfPercentage,
) => {
  try {
    const existing = await db.collection("procurements").findOne({
      supplierId: new ObjectId(supplierId),
      date: date,
      time: time,
      milkQuantity: milkQuantity,
      fatPercentage: fatPercentage,
      snfPercentage: snfPercentage,
    });

    return existing;
  } catch (error) {
    console.error("Error checking duplicate:", error);
    return null;
  }
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get("supplierId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const id = searchParams.get("id");

    // Single record fetch
    if (id) {
      const validation = validateObjectId(id);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      const client = await clientPromise;
      const db = client.db("production");

      const procurement = await db
        .collection("procurements")
        .findOne({ _id: new ObjectId(id) });

      if (!procurement) {
        return NextResponse.json(
          { error: "Record not found" },
          { status: 404 },
        );
      }

      return NextResponse.json(procurement);
    }

    // Multiple records fetch with filtering
    if (!supplierId) {
      return NextResponse.json(
        { error: "Supplier ID is required" },
        { status: 400 },
      );
    }

    const validation = validateObjectId(supplierId);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("production");

    // Build query with date filtering
    const query = { supplierId: new ObjectId(supplierId) };

    // Add date range filtering if provided
    if (startDate || endDate) {
      query.date = {};

      if (startDate) {
        // Validate startDate format
        const startDateObj = new Date(startDate);
        if (isNaN(startDateObj.getTime())) {
          return NextResponse.json(
            { error: "Invalid start date format. Use YYYY-MM-DD" },
            { status: 400 },
          );
        }
        query.date.$gte = startDate;
      }

      if (endDate) {
        // Validate endDate format
        const endDateObj = new Date(endDate);
        if (isNaN(endDateObj.getTime())) {
          return NextResponse.json(
            { error: "Invalid end date format. Use YYYY-MM-DD" },
            { status: 400 },
          );
        }
        query.date.$lte = endDate;
      }

      // Ensure startDate <= endDate if both provided
      if (startDate && endDate && startDate > endDate) {
        return NextResponse.json(
          { error: "Start date cannot be after end date" },
          { status: 400 },
        );
      }
    }

    // Fetch with proper sorting
    const procurements = await db
      .collection("procurements")
      .find(query)
      .sort({ date: -1, time: -1 }) // Sort by date descending, then time
      .toArray();

    return NextResponse.json(procurements);
  } catch (error) {
    console.error("API Error - GET procurement:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch data",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      supplierId,
      supplierName,
      supplierType,
      supplierTSRate,
      date,
      time,
      milkQuantity,
      fatPercentage,
      snfPercentage,
      rate,
      totalAmount,
    } = body;

    if (new Date() - new Date(date) > 3 * 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        {
          error:
            "Procurement date can't be more than 3 days back, Contact Admin",
        },
        { status: 400 },
      );
    }

    // Validate supplier ID
    const supplierValidation = validateObjectId(supplierId);
    if (!supplierValidation.valid) {
      return NextResponse.json(
        { error: supplierValidation.error },
        { status: 400 },
      );
    }

    // Validate procurement data
    const dataValidation = validateProcurementData({
      date,
      time,
      milkQuantity,
      fatPercentage,
      snfPercentage,
      rate,
      totalAmount,
    });

    if (!dataValidation.valid) {
      return NextResponse.json(
        { error: dataValidation.error },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db("production");

    // Check for duplicate entry (same supplier, same date, same time)
    const duplicate = await checkDuplicateEntry(
      db,
      supplierId,
      date,
      time,
      milkQuantity,
      fatPercentage,
      snfPercentage,
    );
    if (duplicate) {
      return NextResponse.json(
        {
          error:
            "procurement record already exists for this Quantity, fat and snf",
          duplicateId: duplicate._id,
        },
        { status: 409 },
      );
    }

    // Validate total solids rate
    if (!supplierTSRate || supplierTSRate <= 0) {
      return NextResponse.json(
        { error: "Invalid supplier total solids rate" },
        { status: 400 },
      );
    }

    // Create new procurement record
    const newProcurement = {
      supplierId: new ObjectId(supplierId),
      supplierName,
      supplierType,
      supplierTSRate: parseFloat(supplierTSRate),
      date,
      time,
      milkQuantity: parseFloat(milkQuantity),
      fatPercentage: parseFloat(fatPercentage),
      snfPercentage: parseFloat(snfPercentage),
      rate: parseFloat(rate),
      totalAmount: parseFloat(totalAmount),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db
      .collection("procurements")
      .insertOne(newProcurement);

    return NextResponse.json(
      {
        success: true,
        id: result.insertedId,
        message: "Procurement record created successfully",
        data: {
          ...newProcurement,
          _id: result.insertedId,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("API Error - POST procurement:", error);
    return NextResponse.json(
      {
        error: "Failed to create record",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const body = await request.json();

    // Validate record ID
    const idValidation = validateObjectId(id);
    if (!idValidation.valid) {
      return NextResponse.json({ error: idValidation.error }, { status: 400 });
    }

    // Validate update data
    const dataValidation = validateProcurementData({
      date: body.date,
      time: body.time,
      milkQuantity: body.milkQuantity,
      fatPercentage: body.fatPercentage,
      snfPercentage: body.snfPercentage,
      rate: body.rate,
      totalAmount: body.totalAmount,
    });

    if (!dataValidation.valid) {
      return NextResponse.json(
        { error: dataValidation.error },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db("production");

    // Check if record exists
    const existingRecord = await db
      .collection("procurements")
      .findOne({ _id: new ObjectId(id) });

    if (!existingRecord) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // Check for duplicate (excluding current record)
    const duplicate = await db.collection("procurements").findOne({
      supplierId: existingRecord.supplierId,
      date: body.date,
      time: body.time,
      milkQuantity: body.milkQuantity,
      _id: { $ne: new ObjectId(id) },
    });

    if (duplicate) {
      return NextResponse.json(
        {
          error:
            "procurement already exists on the same Milk Qunatity, date and time period",
          duplicateId: duplicate._id,
        },
        { status: 409 },
      );
    }

    // Prepare update data
    const updateData = {
      date: body.date,
      time: body.time,
      milkQuantity: parseFloat(body.milkQuantity),
      fatPercentage: parseFloat(body.fatPercentage),
      snfPercentage: parseFloat(body.snfPercentage),
      rate: parseFloat(body.rate),
      totalAmount: parseFloat(body.totalAmount),
      updatedAt: new Date(),
    };

    // Perform update
    const result = await db
      .collection("procurements")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Procurement record updated successfully",
      data: {
        ...existingRecord,
        ...updateData,
      },
    });
  } catch (error) {
    console.error("API Error - PUT procurement:", error);
    return NextResponse.json(
      {
        error: "Failed to update record",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    // Validate ID
    const validation = validateObjectId(id);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("production");

    // Check if record exists first
    const existingRecord = await db
      .collection("procurements")
      .findOne({ _id: new ObjectId(id) });

    if (!existingRecord) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // Delete the record
    const result = await db
      .collection("procurements")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Record not found or already deleted" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Procurement record deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error("API Error - DELETE procurement:", error);
    return NextResponse.json(
      {
        error: "Failed to delete record",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}
