import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

// -------------------------------------------------------------------
// Constants & mappings
// -------------------------------------------------------------------
const METHOD_NAMES = {
  GET: "GET /api/customer/order",
  POST: "POST /api/customer/order",
  PUT: "PUT /api/customer/order",
  DELETE: "DELETE /api/customer/order",
  PATCH: "PATCH /api/customer/order",
};

const productToStockField = {
  "Milk": "milk",
  "Butter": "butter",
  "Fresh Cream": "cream",
  "Curd": "curd",
  "Ghee": "ghee",
  "Soft Paneer": "soft_paneer",
  "Premium Paneer": "premium_paneer",
};

// -------------------------------------------------------------------
// Helper: insert stock ledger entries and update balance atomically
// -------------------------------------------------------------------
async function applyStockChanges(db, entries, incFields) {
  if (entries.length === 0) return;

  // 1. Insert ledger records (per‑product movements)
  await db.collection("stock_ledger").insertMany(entries);

  // 2. Update the live balance document (upsert = create if missing)
  await db.collection("stock_balance").updateOne(
    { _id: "current" },
    { $inc: incFields, $set: { updatedAt: new Date() } },
    { upsert: true }
  );
}

// -------------------------------------------------------------------
// GET – fetch orders (by id or customerId)
// -------------------------------------------------------------------
export async function GET(request) {
  const METHOD = METHOD_NAMES.GET;

  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("id");
    const customerId = searchParams.get("customerId");

    const db = await getDatabase();

    if (orderId) {
      if (!ObjectId.isValid(orderId)) {
        return NextResponse.json(
          { error: "Invalid order ID" },
          { status: 400 }
        );
      }
      const order = await db
        .collection("orders")
        .findOne({ _id: new ObjectId(orderId) });
      if (!order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      return NextResponse.json(order);
    }

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(customerId)) {
      return NextResponse.json(
        { error: "Invalid customer ID" },
        { status: 400 }
      );
    }

    const orders = await db
      .collection("orders")
      .find({ customerId: new ObjectId(customerId) })
      .sort({ date: -1, createdAt: -1 })
      .toArray();

    return NextResponse.json(orders);
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}

// -------------------------------------------------------------------
// POST – create order, optionally deduct from stock
// -------------------------------------------------------------------
export async function POST(request) {
  const METHOD = METHOD_NAMES.POST;

  try {
    const db = await getDatabase();
    const data = await request.json();

    // --- validation ---
    if (!data.customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }
    if (!ObjectId.isValid(data.customerId)) {
      return NextResponse.json(
        { error: "Invalid customerId" },
        { status: 400 }
      );
    }

    const {
      items,
      totalAmount,
      date,
      paymentStatus,
      customerName,
      customerType,
      comment,
      actionDoneBy,
      affectStockValue,   // 👈 new field from frontend
    } = data;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "At least one order item is required" },
        { status: 400 }
      );
    }

    for (const item of items) {
      if (!item.product || !item.quantity || !item.ratePerUnit) {
        return NextResponse.json(
          { error: "Each item must have product, quantity, and ratePerUnit" },
          { status: 400 }
        );
      }
    }

    // --- build order document (include affectStockValue) ---
    const orderData = {
      customerId: new ObjectId(data.customerId),
      customerName: customerName?.trim() || "",
      customerType: customerType?.trim() || "",
      date: date || new Date().toISOString().split("T")[0],
      items: items.map((item) => ({
        product: item.product.trim(),
        quantity: parseFloat(item.quantity) || 0,
        ratePerUnit: parseFloat(item.ratePerUnit) || 0,
        totalAmount: parseFloat(item.totalAmount) || 0,
      })),
      totalAmount: parseFloat(totalAmount) || 0,
      paymentStatus: paymentStatus || "Not Paid",
      comment: comment?.trim() || "",
      actionDoneBy: actionDoneBy?.trim() || "",
      affectStockValue: affectStockValue !== false,   // default true if not provided
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // --- insert order ---
    const result = await db.collection("orders").insertOne(orderData);

    // --- stock deduction (only if affectStockValue is true) ---
    if (orderData.affectStockValue) {
      const ledgerEntries = [];
      const incFields = {};

      for (const item of orderData.items) {
        const stockField = productToStockField[item.product];
        if (!stockField) continue;

        const quantity = parseFloat(item.quantity);
        if (quantity <= 0) continue;

        // Negative quantity for deduction
        ledgerEntries.push({
          type: "order",
          product: stockField,
          quantity: -quantity,
          date: orderData.date,
          referenceId: result.insertedId,
          actionDoneBy: actionDoneBy?.trim() || "",
          createdAt: new Date(),
        });

        incFields[stockField] = (incFields[stockField] || 0) - quantity;
      }

      if (Object.keys(incFields).length > 0) {
        // Check stock availability
        const currentBalance = await db.collection("stock_balance").findOne({ _id: "current" });
        for (const [field, delta] of Object.entries(incFields)) {
          const current = currentBalance?.[field] || 0;
          if (current + delta < 0) {
            return NextResponse.json(
              { error: `Insufficient stock for ${field}. Available: ${current}` },
              { status: 400 }
            );
          }
        }

        await applyStockChanges(db, ledgerEntries, incFields);

        // Optional low‑stock alert (implement checkLowStockAndNotify separately)
        // await checkLowStockAndNotify();
      }
    }

    return NextResponse.json(
      {
        _id: result.insertedId,
        ...orderData,
        message: "Order created successfully",
        stockDeducted: orderData.affectStockValue,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json(
      { error: "Failed to create order", details: error.message },
      { status: 500 }
    );
  }
}

// -------------------------------------------------------------------
// PUT – update order, adjust stock if items / affectStockValue change
// -------------------------------------------------------------------
export async function PUT(request) {
  const METHOD = METHOD_NAMES.PUT;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Valid order ID required" },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const data = await request.json();

    // Get the existing order for stock reversal
    const oldOrder = await db.collection("orders").findOne({ _id: new ObjectId(id) });
    if (!oldOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // --- build update fields ---
    const updateData = { updatedAt: new Date() };

    if (data.date !== undefined) updateData.date = data.date;
    if (data.paymentStatus !== undefined) updateData.paymentStatus = data.paymentStatus;
    if (data.comment !== undefined) updateData.comment = data.comment?.trim() || "";
    if (data.actionDoneBy !== undefined) updateData.actionDoneBy = data.actionDoneBy?.trim() || "";

    // New affectStockValue flag
    const newAffectStock = data.affectStockValue !== undefined ? data.affectStockValue : oldOrder.affectStockValue;
    updateData.affectStockValue = newAffectStock;

    let newItems = null;
    if (data.items !== undefined) {
      if (!Array.isArray(data.items) || data.items.length === 0) {
        return NextResponse.json(
          { error: "Items array cannot be empty" },
          { status: 400 }
        );
      }
      newItems = data.items.map((item) => ({
        product: item.product.trim(),
        quantity: parseFloat(item.quantity) || 0,
        ratePerUnit: parseFloat(item.ratePerUnit) || 0,
        totalAmount: parseFloat(item.totalAmount) || 0,
      }));
      updateData.items = newItems;
      updateData.totalAmount = newItems.reduce((sum, item) => sum + item.totalAmount, 0);
    }

    // --- perform update ---
    await db.collection("orders").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    // --- stock adjustment logic ---
    // 1. Reverse old stock if old order affected stock
    const oldAffected = oldOrder.affectStockValue !== false;
    if (oldAffected && (newItems || newAffectStock === false)) {
      // Re-add old items
      const reversalEntries = [];
      const reversalInc = {};

      for (const item of (oldOrder.items || [])) {
        const stockField = productToStockField[item.product];
        if (!stockField) continue;

        const qty = parseFloat(item.quantity);
        if (qty <= 0) continue;

        reversalEntries.push({
          type: "reversal",
          product: stockField,
          quantity: qty,               // positive = add back
          date: oldOrder.date,
          referenceId: new ObjectId(id),
          actionDoneBy: data.actionDoneBy?.trim() || "",
          createdAt: new Date(),
        });

        reversalInc[stockField] = (reversalInc[stockField] || 0) + qty;
      }

      if (Object.keys(reversalInc).length > 0) {
        await applyStockChanges(db, reversalEntries, reversalInc);
      }
    }

    // 2. Deduct new stock if new affectStockValue is true and items provided
    if (newAffectStock && newItems) {
      const deductionEntries = [];
      const deductionInc = {};

      for (const item of newItems) {
        const stockField = productToStockField[item.product];
        if (!stockField) continue;

        const qty = parseFloat(item.quantity);
        if (qty <= 0) continue;

        deductionEntries.push({
          type: "order",
          product: stockField,
          quantity: -qty,
          date: updateData.date || oldOrder.date,
          referenceId: new ObjectId(id),
          actionDoneBy: data.actionDoneBy?.trim() || "",
          createdAt: new Date(),
        });

        deductionInc[stockField] = (deductionInc[stockField] || 0) - qty;
      }

      if (Object.keys(deductionInc).length > 0) {
        // Check stock availability
        const currentBalance = await db.collection("stock_balance").findOne({ _id: "current" });
        for (const [field, delta] of Object.entries(deductionInc)) {
          const current = currentBalance?.[field] || 0;
          if (current + delta < 0) {
            // We already reversed old stock, but now the new deduction would go negative
            return NextResponse.json(
              { error: `Insufficient stock for ${field} after update. Available: ${current}` },
              { status: 400 }
            );
          }
        }

        await applyStockChanges(db, deductionEntries, deductionInc);
      }
    }

    return NextResponse.json({ message: "Order updated successfully" });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

// -------------------------------------------------------------------
// DELETE – remove order, restore stock if it was deducted
// -------------------------------------------------------------------
export async function DELETE(request) {
  const METHOD = METHOD_NAMES.DELETE;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Valid order ID required" },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const order = await db.collection("orders").findOne({ _id: new ObjectId(id) });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Delete the order
    await db.collection("orders").deleteOne({ _id: new ObjectId(id) });

    // Restore stock only if the order affected stock
    if (order.affectStockValue !== false) {
      const reversalEntries = [];
      const incFields = {};

      if (order.items && Array.isArray(order.items)) {
        for (const item of order.items) {
          const stockField = productToStockField[item.product];
          if (!stockField) continue;

          const quantity = parseFloat(item.quantity);
          if (quantity <= 0) continue;

          reversalEntries.push({
            type: "reversal",
            product: stockField,
            quantity: quantity,               // add back
            date: order.date,
            referenceId: new ObjectId(id),
            actionDoneBy: order.actionDoneBy || "",
            createdAt: new Date(),
          });

          incFields[stockField] = (incFields[stockField] || 0) + quantity;
        }
      }

      if (Object.keys(incFields).length > 0) {
        await applyStockChanges(db, reversalEntries, incFields);
      }
    }

    return NextResponse.json({
      message: "Order deleted successfully",
      deletedId: id,
      stockRestored: order.affectStockValue !== false,
    });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}

// -------------------------------------------------------------------
// PATCH – bulk update (status/comment) – no stock impact
// -------------------------------------------------------------------
export async function PATCH(request) {
  const METHOD = METHOD_NAMES.PATCH;

  try {
    const db = await getDatabase();
    const { orderIds, status, comment, actionDoneBy } = await request.json();

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { error: "orderIds array is required" },
        { status: 400 }
      );
    }

    if (!status && comment === undefined) {
      return NextResponse.json(
        { error: "Either status or comment must be provided" },
        { status: 400 }
      );
    }

    if (status && !["Paid", "Not Paid"].includes(status)) {
      return NextResponse.json(
        { error: "Valid status (Paid/Not Paid) is required" },
        { status: 400 }
      );
    }

    const validObjectIds = orderIds
      .map((id) => (ObjectId.isValid(id) ? new ObjectId(id) : null))
      .filter((id) => id !== null);

    if (validObjectIds.length === 0) {
      return NextResponse.json(
        { error: "No valid order IDs provided" },
        { status: 400 }
      );
    }

    const updateFields = {
      updatedAt: new Date(),
      updatedBy: actionDoneBy?.trim() || "",
    };

    if (status) {
      updateFields.paymentStatus = status;
      updateFields.paymentUpdatedAt = new Date();
      updateFields.paymentRecordDoneBy = actionDoneBy?.trim() || "";
    }

    if (comment !== undefined) {
      updateFields.comment = comment?.trim() || "";
    }

    const result = await db
      .collection("orders")
      .updateMany({ _id: { $in: validObjectIds } }, { $set: updateFields });

    return NextResponse.json({
      message: `Updated ${result.modifiedCount} orders`,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Bulk update failed" }, { status: 500 });
  }
}