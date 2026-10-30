import { createCustomerOrder, applyOrderToTotals, applyStockChanges, productToStockField, normalizeOrderItems, orderAffectedStock } from "@/lib/customer-order-write";
import { roundStockQuantity } from "@/lib/stock-movements.mjs";
import { requireAdmin, requireStaff } from "@/lib/mutation-auth";
import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { ObjectId } from "mongodb";
import { withCustomerTransaction } from "@/lib/customer-transaction.mjs";
import { updateCustomerSummaries } from "@/lib/customer-summaries.mjs";


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
      return NextResponse.json({ ...order, affectStockValue: await orderAffectedStock(db, order) });
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

    return NextResponse.json(await Promise.all(orders.map(async order => ({ ...order, affectStockValue: await orderAffectedStock(db, order) }))));
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}

// -------------------------------------------------------------------
// POST – create order, optionally deduct from stock
// -------------------------------------------------------------------
export async function POST(request) {
  const denied = await requireStaff();
  if (denied) return denied;
  const METHOD = METHOD_NAMES.POST;

  try {
    const data = await request.json();
    const database = await getDatabase();
    return await withCustomerTransaction(database, async (db) => {

      return createCustomerOrder(db, data);
    });
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
  const denied = await requireAdmin();
  if (denied) return denied;
  const METHOD = METHOD_NAMES.PUT;

  try {
    const data = await request.json();
    const database = await getDatabase();
    return await withCustomerTransaction(database, async (db) => {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get("id");

      if (!id || !ObjectId.isValid(id)) {
        return NextResponse.json(
          { error: "Valid order ID required" },
          { status: 400 }
        );
      }


      // Get the existing order for stock reversal and totals reversal
      const oldOrder = await db.collection("orders").findOne({ _id: new ObjectId(id) });
      if (!oldOrder) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      // --- build update fields ---
      const updateData = { updatedAt: new Date() };
      if (data.gstType !== undefined) {
        if (!["inclusive", "exclusive"].includes(data.gstType)) return NextResponse.json({ error: "Invalid GST option" }, { status: 400 });
        updateData.gstType = data.gstType;
        updateData.gstRate = 5;
      }

      if (data.date !== undefined) updateData.date = data.date;
      if (data.paymentStatus !== undefined) updateData.paymentStatus = data.paymentStatus;
      if (data.comment !== undefined) updateData.comment = data.comment?.trim() || "";
      if (data.actionDoneBy !== undefined) updateData.actionDoneBy = data.actionDoneBy?.trim() || "";

      // New affectStockValue flag
      if (data.affectStockValue !== undefined && typeof data.affectStockValue !== "boolean") {
        return NextResponse.json({ error: "Affect stock must be true or false" }, { status: 400 });
      }
      const oldAffected = await orderAffectedStock(db, oldOrder);
      const newAffectStock = data.affectStockValue !== undefined ? data.affectStockValue === true : oldAffected;
      updateData.affectStockValue = newAffectStock;

      let newItems = null;
      if (data.items !== undefined) {
        try { newItems = normalizeOrderItems(data.items); }
        catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
        updateData.items = newItems;
        updateData.totalAmount = newItems.reduce((sum, item) => sum + item.totalAmount, 0);
      }

      // --- perform update on orders collection ---
      await db.collection("orders").updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      // --- stock adjustment logic (unchanged) ---
      if (oldAffected && (newItems || newAffectStock === false)) {
        const reversalEntries = [];
        const reversalInc = {};

        for (const item of (oldOrder.items || [])) {
          const stockField = Object.hasOwn(productToStockField, item.product) ? productToStockField[item.product] : null;
          if (!stockField) continue;

          const qty = parseFloat(item.quantity);
          if (!Number.isFinite(qty) || qty <= 0) continue;

          reversalEntries.push({
            type: "reversal",
            product: stockField,
            quantity: qty,
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

      if (newAffectStock && (newItems || !oldAffected)) {
        const deductionEntries = [];
        const deductionInc = {};

        for (const item of (newItems || oldOrder.items || [])) {
          const stockField = Object.hasOwn(productToStockField, item.product) ? productToStockField[item.product] : null;
          if (!stockField) continue;

          const qty = parseFloat(item.quantity);
          if (!Number.isFinite(qty) || qty <= 0) continue;

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
          const currentBalance = await db.collection("stock_balance").findOne({ _id: "current" });
          for (const [field, delta] of Object.entries(deductionInc)) {
            const current = currentBalance?.[field] || 0;
            if (roundStockQuantity(Number(current) + delta) < 0) {
              return NextResponse.json(
                { error: `Insufficient stock for ${field} after update. Available: ${current}` },
                { status: 400 }
              );
            }
          }

          await applyStockChanges(db, deductionEntries, deductionInc);
        }
      }

      // --- update total_orders: reverse old order and add new order ---
      await applyOrderToTotals(db, oldOrder, "remove");

      // Construct new order object for totals (we can use the updated data, but need the original customerId and other fields)
      const updatedOrderData = {
        ...oldOrder,
        ...updateData,
        customerId: oldOrder.customerId, // ensure we use the old customerId (if it hasn't changed)
        items: newItems || oldOrder.items,
        totalAmount: updateData.totalAmount !== undefined ? updateData.totalAmount : oldOrder.totalAmount,
      };

      await applyOrderToTotals(db, updatedOrderData, "add");
      await updateCustomerSummaries(db, [oldOrder], [updatedOrderData]);

      return NextResponse.json({ message: "Order updated successfully" });
    });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

// -------------------------------------------------------------------
// DELETE – remove order, restore stock if it was deducted
// -------------------------------------------------------------------
export async function DELETE(request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const METHOD = METHOD_NAMES.DELETE;

  try {
    const database = await getDatabase();
    return await withCustomerTransaction(database, async (db) => {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get("id");

      if (!id || !ObjectId.isValid(id)) {
        return NextResponse.json(
          { error: "Valid order ID required" },
          { status: 400 }
        );
      }

      const order = await db.collection("orders").findOne({ _id: new ObjectId(id) });

      if (!order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      // Delete the order
      const deletion = await db.collection("orders").deleteOne({ _id: new ObjectId(id) });
      if (!deletion.deletedCount) return NextResponse.json({ error: "Order not found" }, { status: 404 });

      // Restore stock only if the order affected stock
      const affectedStock = await orderAffectedStock(db, order);
      if (affectedStock) {
        const reversalEntries = [];
        const incFields = {};

        if (order.items && Array.isArray(order.items)) {
          for (const item of order.items) {
            const stockField = Object.hasOwn(productToStockField, item.product) ? productToStockField[item.product] : null;
            if (!stockField) continue;

            const quantity = parseFloat(item.quantity);
            if (!Number.isFinite(quantity) || quantity <= 0) continue;

            reversalEntries.push({
              type: "reversal",
              product: stockField,
              quantity: quantity,
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

      // Update total_orders collection: remove this order's contribution
      await applyOrderToTotals(db, order, "remove");
      await updateCustomerSummaries(db, [order], []);

      return NextResponse.json({
        message: "Order deleted successfully",
        deletedId: id,
        stockRestored: affectedStock,
      });
    });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}

// -------------------------------------------------------------------
// PATCH – bulk update (status/comment) – no stock impact, no totals impact
// -------------------------------------------------------------------
export async function PATCH(request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const METHOD = METHOD_NAMES.PATCH;

  try {
    const { orderIds, status, comment, actionDoneBy } = await request.json();
    const database = await getDatabase();
    return await withCustomerTransaction(database, async (db) => {

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

      const previousOrders = await db.collection("orders").find({ _id: { $in: validObjectIds } }).toArray();
      const result = await db
        .collection("orders")
        .updateMany({ _id: { $in: validObjectIds } }, { $set: updateFields });
      await updateCustomerSummaries(db, previousOrders, previousOrders.map(order => ({ ...order, ...updateFields })));

      // No longer update total_orders here because it has its own paidAmount field.
      // The paymentStatus on orders does not affect total_orders anymore.

      return NextResponse.json({
        message: `Updated ${result.modifiedCount} orders`,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      });
    });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Bulk update failed" }, { status: 500 });
  }
}
