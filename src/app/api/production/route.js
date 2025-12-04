import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";


const VALID_PRODUCTS = [
  "milk",
  "fat",
  "snf",
  "curd",
  "premium_paneer",
  "soft_paneer",
  "butter",
  "cream",
  "ghee",
];

const PERCENTAGE_FIELDS = ["fat", "snf"];

const METHOD_NAMES = {
  GET: "GET /api/production",
  POST: "POST /api/production",
  DELETE: "DELETE /api/production",
};

const logger = (method, message, data = null) => {
  const timestamp = new Date().toISOString();
  const dataString = data ? ` | Data: ${JSON.stringify(data)}` : "";
  console.log(`[${timestamp}] [${method}] ${message}${dataString}`);
};

const parseQuantity = (val, isPercentage = false) => {
  if (val === "" || val === null || val === undefined) return null;

  const num = parseFloat(val);

  if (isNaN(num) || num < 0) return null;

  if (isPercentage) {
    return num <= 100 ? parseFloat(num.toFixed(1)) : null;
  } else {
    return parseFloat(num.toFixed(2));
  }

};

const validateRequiredFields = (data, fields) => {
  const missing = fields.filter((field) => !data[field]);
  return missing.length === 0
    ? null
    : `Missing required fields: ${missing.join(", ")}`;
};

const validateAtLeastOneProduct = (data) => {
  const hasProduct = VALID_PRODUCTS.some((product) => {
    const suffix = PERCENTAGE_FIELDS.includes(product)
      ? "_percentage"
      : "_quantity";
    const key = `${product}${suffix}`;
    const value = data[key];
    return value !== null && value !== undefined && value !== "" && value > 0;
  });
  return hasProduct ? null : "At least one product quantity is required";
};

const validatePercentageFields = (data) => {
  const errors = [];
  
  // Validate fat percentage (typical range 3.0 - 7.0)
  if (data.fat_percentage) {
    const fat = parseFloat(data.fat_percentage);
    if (isNaN(fat) || fat > 7.0) {
      errors.push("Fat percentage should be below 7.0");
    }
  }
  
  // Validate SNF percentage (typical range 8.0 - 9.5)
  if (data.snf_percentage) {
    const snf = parseFloat(data.snf_percentage);
    if (isNaN(snf) || snf > 9.5) {
      errors.push("SNF percentage should be below 9.5");
    }
  }
  
  return errors.length > 0 ? errors.join(", ") : null;
};

const getDatabase = async () => {
  try {
    const client = await clientPromise;
    return client.db("production");
  } catch (error) {
    console.error("Database connection failed:", error.message);
    throw new Error("Database connection failed");
  }
};

const generateUniqueBatchName = async (db, batch, date) => {
  // Escape special regex characters in batch name
  // const escapedBatch = batch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const existingEntries = await db
    .collection("entries")
    .find({
      date: date,
      // batch: { $regex: `^${escapedBatch}` },
    })
    .sort({ createdAt: 1 })
    .toArray();

  if (existingEntries.length === 0) return batch;

  // Extract the highest number from existing batches
  let maxNumber = 0;
  existingEntries.forEach((entry) => {
    const match = entry.batch.match(/\((\d+)\)$/);
    if (match) {
      const num = parseInt(match[1]);
      if (num > maxNumber) maxNumber = num;
    }
  });

  return maxNumber > 0 ? `${batch} (${maxNumber + 1})` : `${batch} (1)`;
};

// ========== API HANDLERS ==========
export async function GET(request) {
  const METHOD = METHOD_NAMES.GET;

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    logger(METHOD, "Fetching started", { startDate, endDate });

    const query = {};

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    const db = await getDatabase();
    const entries = await db
      .collection("entries")
      .find(query)
      .sort({ date: -1, createdAt: -1 })
      .limit(100)
      .toArray();

    logger(METHOD, `Success. Found ${entries.length} entries`);

    return NextResponse.json(entries);
  } catch (error) {
    logger(METHOD, "CRITICAL ERROR", error.message);
    return NextResponse.json(
      { 
        error: "Failed to fetch production records",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }, 
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const METHOD = METHOD_NAMES.POST;

  try {
    const data = await request.json();
    logger(METHOD, "Request received", data);

    // Validation
    const requiredError = validateRequiredFields(data, ["date", "batch"]);
    if (requiredError) {
      logger(METHOD, "Validation failed", requiredError);
      return NextResponse.json({ error: requiredError }, { status: 400 });
    }

    const productError = validateAtLeastOneProduct(data);
    if (productError) {
      logger(METHOD, "Validation failed", productError);
      return NextResponse.json({ error: productError }, { status: 400 });
    }

    const percentageError = validatePercentageFields(data);
    if (percentageError) {
      logger(METHOD, "Validation failed", percentageError);
      return NextResponse.json({ error: percentageError }, { status: 400 });
    }

    const db = await getDatabase();

    // Generate unique batch name
    const finalBatchName = await generateUniqueBatchName(db, data.batch, data.date);
    if (finalBatchName !== data.batch) {
      logger(METHOD, `Batch renamed to: ${finalBatchName}`);
    }

    // Prepare production data
    const productionData = {
      date: data.date,
      batch: finalBatchName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Add product quantities and percentages
    VALID_PRODUCTS.forEach((product) => {
      const isPercentage = PERCENTAGE_FIELDS.includes(product);
      const suffix = isPercentage ? "_percentage" : "_quantity";
      const key = `${product}${suffix}`;
      productionData[key] = parseQuantity(data[key], isPercentage);
    });

    // Insert into database
    const result = await db.collection("entries").insertOne(productionData);

    if (!result.acknowledged) {
      throw new Error("Database insertion failed");
    }

    logger(METHOD, "Insertion successful", { id: result.insertedId });

    return NextResponse.json(
      {
        success: true,
        id: result.insertedId,
        batch: finalBatchName,
        message: `Batch ${finalBatchName} saved successfully!`,
      },
      { status: 201 }
    );
  } catch (error) {
    logger(METHOD, "CRITICAL ERROR", error.message);
    return NextResponse.json(
      { error: "Failed to save production entry" },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  const METHOD = METHOD_NAMES.DELETE;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    logger(METHOD, "Request received", { id });

    if (!id) {
      return NextResponse.json(
        { error: "Entry ID is required" },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const result = await db.collection("entries").deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      logger(METHOD, "Entry not found", { id });
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    logger(METHOD, "Deletion successful", { id });

    return NextResponse.json({
      success: true,
      message: "Entry deleted successfully",
    });
  } catch (error) {
    logger(METHOD, "CRITICAL ERROR", error.message);
    return NextResponse.json(
      { error: "Failed to delete entry" },
      { status: 500 }
    );
  }
}