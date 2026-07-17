import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
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

// ---------- Product to stock field mapping (must match order route) ----------
const productToStockField = {
  milk: "milk",
  curd: "curd",
  cream: "cream",
  soft_paneer: "soft_paneer",
  premium_paneer: "premium_paneer",
  butter: "butter",
  ghee: "ghee",
};

// ---------- Helpers ----------
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
  if (data.fat_percentage) {
    const fat = parseFloat(data.fat_percentage);
    if (isNaN(fat) || fat > 7.0) {
      errors.push("Fat percentage should be below 7.0");
    }
  }
  if (data.snf_percentage) {
    const snf = parseFloat(data.snf_percentage);
    if (isNaN(snf) || snf > 12) {
      errors.push("SNF percentage should be below 12");
    }
  }
  return errors.length > 0 ? errors.join(", ") : null;
};

const generateUniqueBatchName = async (db, batch, date) => {
  const existingEntries = await db
    .collection("entries")
    .find({ date: date })
    .sort({ createdAt: 1 })
    .toArray();

  if (existingEntries.length === 0) return batch;

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

/**
 * Helper: Insert ledger entries and update stock balance.
 * @param {Object} db - Database instance
 * @param {Array} entries - Array of ledger documents (type, product, quantity, ...)
 * @param {Object} incFields - Fields to $inc on stock_balance (e.g., { milk: 100 })
 */
async function applyStockChanges(db, entries, incFields) {
  if (entries.length === 0) return;

  // 1. Insert one ledger entry per product movement
  await db.collection("stock_ledger").insertMany(entries);

  // 2. Update the live stock balance (create document if not exists)
  await db.collection("stock_balance").updateOne(
    { _id: "current" },
    { $inc: incFields, $set: { updatedAt: new Date() } },
    { upsert: true }
  );
}

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
      .limit(30)
      .toArray();

    logger(METHOD, `Success. Found ${entries.length} entries`);
    return NextResponse.json(entries);
  } catch (error) {
    logger(METHOD, "CRITICAL ERROR", error.message);
    return NextResponse.json(
      {
        error: "Failed to fetch production records",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
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
    const finalBatchName = await generateUniqueBatchName(
      db,
      data.batch,
      data.date
    );
    if (finalBatchName !== data.batch) {
      logger(METHOD, `Batch renamed to: ${finalBatchName}`);
    }

    // Prepare production data
    const productionData = {
      date: data.date,
      batch: finalBatchName,
      affectStockValue: data.affectStockValue,
      actionDoneBy: data.actionDoneBy,
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

    // ============= NEW: Stock Ledger + Balance Update =============
    if (data.affectStockValue === true) {
      // Build ledger entries and increment fields
      const ledgerEntries = [];
      const incFields = {};

      // Only process quantity fields (not percentages)
      const quantityProducts = VALID_PRODUCTS.filter(
        (p) => !PERCENTAGE_FIELDS.includes(p)
      );

      for (const product of quantityProducts) {
        const key = `${product}_quantity`;
        const qty = productionData[key];

        if (qty && qty > 0) {
          const stockField = productToStockField[product]; // e.g., "milk"
          if (stockField) {
            ledgerEntries.push({
              type: "production",
              batch: finalBatchName,
              product: stockField,          // stock field name
              quantity: qty,                // positive = addition
              date: data.date,
              referenceId: result.insertedId,
              actionDoneBy: data.actionDoneBy || "",
              createdAt: new Date(),
            });

            incFields[stockField] = (incFields[stockField] || 0) + qty;
          }
        }
      }

      if (Object.keys(incFields).length > 0) {
        await applyStockChanges(db, ledgerEntries, incFields);

        // Optional low-stock alert (implement checkLowStockAndNotify separately)
        // await checkLowStockAndNotify();
      }

      logger(METHOD, "Stock ledger and balance updated");
    }

    return NextResponse.json(
      {
        success: true,
        id: result.insertedId,
        batch: finalBatchName,
        message: `Batch ${finalBatchName} saved successfully!`,
        stockAffected: data.affectStockValue === true,
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

    // Check if entry exists
    const entry = await db.collection("entries").findOne({
      _id: new ObjectId(id),
    });

    if (!entry) {
      logger(METHOD, "Entry not found", { id });
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    // Delete the production entry
    const result = await db.collection("entries").deleteOne({
      _id: new ObjectId(id),
    });

    // ============= Reverse stock if previously affected =============
    if (entry.affectStockValue === true) {
      const reversalEntries = [];
      const incFields = {};

      // Only quantity fields
      const quantityProducts = VALID_PRODUCTS.filter(
        (p) => !PERCENTAGE_FIELDS.includes(p)
      );

      for (const product of quantityProducts) {
        const key = `${product}_quantity`;
        const qty = entry[key];

        if (qty && qty > 0) {
          const stockField = productToStockField[product];
          if (stockField) {
            reversalEntries.push({
              type: "reversal",
              product: stockField,
              quantity: -qty,             // negative to subtract back
              date: entry.date,
              referenceId: new ObjectId(id),
              actionDoneBy: entry.actionDoneBy || "",
              createdAt: new Date(),
            });

            incFields[stockField] = (incFields[stockField] || 0) - qty;
          }
        }
      }

      if (Object.keys(incFields).length > 0) {
        await applyStockChanges(db, reversalEntries, incFields);
      }
    }

    logger(METHOD, "Deletion successful", { id });

    return NextResponse.json({
      success: true,
      message: "Entry deleted successfully",
      stockReversed: entry.affectStockValue === true,
    });
  } catch (error) {
    logger(METHOD, "CRITICAL ERROR", error.message);
    return NextResponse.json(
      { error: "Failed to delete entry" },
      { status: 500 }
    );
  }
}