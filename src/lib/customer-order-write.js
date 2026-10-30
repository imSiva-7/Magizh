import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getTodayDate } from "@/lib/india-date.mjs";
import { updateCustomerSummaries } from "@/lib/customer-summaries.mjs";
import { applyStockMovement, roundStockQuantity } from "@/lib/stock-movements.mjs";

export const productToStockField = {
  "Milk": "milk",
  "Butter": "butter",
  "Fresh Cream": "cream",
  "Curd": "curd",
  "Ghee": "ghee",
  "Soft Paneer": "soft_paneer",
  "Premium Paneer": "premium_paneer",
};

// New mapping for total_orders fields
const productToTotalField = {
  "Milk": "milkTotalQuantity",
  "Butter": "butterTotalQuantity",
  "Fresh Cream": "freshCreamTotalQuantity",
  "Curd": "curdTotalQuantity",
  "Ghee": "gheeTotalQuantity",
  "Soft Paneer": "softPaneerTotalQuantity",
  "Premium Paneer": "premiumPaneerTotalQuantity",
};

// -------------------------------------------------------------------
// Helper: get quantity for a product from items array
// -------------------------------------------------------------------
function getQuantity(items, productName) {
  return (items || []).filter(item => item.product === productName)
    .reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
}

// -------------------------------------------------------------------
// Helper: apply order changes to total_orders (customer + global)
// operation: "add" or "remove"
// -------------------------------------------------------------------
export async function applyOrderToTotals(db, order, operation) {
  const multiplier = operation === "add" ? 1 : -1;
  const customerId = order.customerId;

  // Build increment object for customer document
  const incCustomer = {
    totalAmount: multiplier * (order.totalAmount || 0),
    totalOrders: multiplier * 1,
    milkTotalQuantity: multiplier * getQuantity(order.items, "Milk"),
    butterTotalQuantity: multiplier * getQuantity(order.items, "Butter"),
    freshCreamTotalQuantity: multiplier * getQuantity(order.items, "Fresh Cream"),
    curdTotalQuantity: multiplier * getQuantity(order.items, "Curd"),
    gheeTotalQuantity: multiplier * getQuantity(order.items, "Ghee"),
    softPaneerTotalQuantity: multiplier * getQuantity(order.items, "Soft Paneer"),
    premiumPaneerTotalQuantity: multiplier * getQuantity(order.items, "Premium Paneer"),
  };

  // Upsert customer document
  await db.collection("total_orders").updateOne(
    { _id: customerId },
    {
      $inc: incCustomer,
      $set: { updatedAt: new Date() },
      $setOnInsert: {
        paidAmount: 0,
        dueAmount: 0,
        customerName: order.customerName || "",
        customerType: order.customerType || "",
      },
    },
    { upsert: true }
  );

  // Recalculate customer's due amount (totalAmount - paidAmount)
  const customerDoc = await db.collection("total_orders").findOne({ _id: customerId });
  if (customerDoc) {
    await db.collection("total_orders").updateOne(
      { _id: customerId },
      { $set: { dueAmount: customerDoc.totalAmount - (customerDoc.paidAmount || 0) } }
    );
  }

  // Upsert global document
  const incGlobal = { ...incCustomer };
  await db.collection("total_orders").updateOne(
    { _id: "global" },
    {
      $inc: incGlobal,
      $set: { updatedAt: new Date() },
      $setOnInsert: {
        paidAmount: 0,
        dueAmount: 0,
      },
    },
    { upsert: true }
  );

  // Recalculate global due amount
  const globalDoc = await db.collection("total_orders").findOne({ _id: "global" });
  if (globalDoc) {
    await db.collection("total_orders").updateOne(
      { _id: "global" },
      { $set: { dueAmount: globalDoc.totalAmount - (globalDoc.paidAmount || 0) } }
    );
  }
}

// -------------------------------------------------------------------
// Helper: insert stock ledger entries and update balance atomically
// -------------------------------------------------------------------
export async function applyStockChanges(db, entries, incFields) {
  await applyStockMovement(db, entries, incFields);
}

export function normalizeOrderItems(items) {
  if (!Array.isArray(items) || !items.length) throw new Error("At least one order item is required");
  return items.map(item => {
    if (!item || typeof item.product !== "string" || !Object.hasOwn(productToStockField, item.product.trim())) {
      throw new Error("Select a valid order product");
    }
    const numeric = value => ["number", "string"].includes(typeof value) && String(value).trim() !== "" && Number.isFinite(Number(value));
    if (!numeric(item.quantity) || Number(item.quantity) <= 0 ||
        !numeric(item.ratePerUnit) || Number(item.ratePerUnit) <= 0 ||
        !numeric(item.totalAmount) || Number(item.totalAmount) < 0) {
      throw new Error("Order quantities and rates must be positive; amounts cannot be negative");
    }
    const quantity = roundStockQuantity(item.quantity);
    if (quantity <= 0 || Math.abs(quantity - Number(item.quantity)) > 1e-8) throw new Error("Use at most four decimal places for quantities");
    return { product: item.product.trim(), quantity, ratePerUnit: Number(item.ratePerUnit), totalAmount: Number(item.totalAmount) };
  });
}

export async function orderAffectedStock(db, order) {
  if (typeof order.affectStockValue === "boolean") return order.affectStockValue;
  // Legacy orders without a checkbox flag must have evidence of a deduction.
  return Boolean(await db.collection("stock_ledger").findOne({ referenceId: order._id, type: "order" }));
}


// Caller supplies a transaction-scoped database.
export async function createCustomerOrder(db, data, metadata = {}) {
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
        affectStockValue,
      } = data;

      if (data.gstType !== undefined && !["inclusive", "exclusive"].includes(data.gstType)) {
        return NextResponse.json({ error: "Invalid GST option" }, { status: 400 });
      }

      if (affectStockValue !== undefined && typeof affectStockValue !== "boolean") {
        return NextResponse.json({ error: "Affect stock must be true or false" }, { status: 400 });
      }
      let normalizedItems;
      try { normalizedItems = normalizeOrderItems(items); }
      catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }

      if (!["number", "string"].includes(typeof totalAmount) || String(totalAmount).trim() === "" || !Number.isFinite(Number(totalAmount)) || Number(totalAmount) < 0) {
        return NextResponse.json({ error: "Order amount cannot be negative" }, { status: 400 });
      }

      // --- build order document (include affectStockValue) ---
      const orderData = {
        ...metadata,
        customerId: new ObjectId(data.customerId),
        customerName: customerName?.trim() || "",
        customerType: customerType?.trim() || "",
        date: date || getTodayDate(),
        items: normalizedItems,
        totalAmount: Number(totalAmount),
        gstType: data.gstType || "inclusive",
        gstRate: 5,
        paymentStatus: paymentStatus || "Not Paid",
        comment: comment?.trim() || "",
        actionDoneBy: actionDoneBy?.trim() || "",
        affectStockValue: affectStockValue === true,
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
            if (roundStockQuantity(Number(current) + delta) < 0) {
              return NextResponse.json(
                { error: `Insufficient stock for ${field}. Available: ${current}` },
                { status: 400 }
              );
            }
          }

          await applyStockChanges(db, ledgerEntries, incFields);
        }
      }

      // Update total_orders collection
      await applyOrderToTotals(db, orderData, "add");
      await updateCustomerSummaries(db, [], [{ ...orderData, _id: result.insertedId }]);

      return NextResponse.json(
        {
          _id: result.insertedId,
          ...orderData,
          message: "Order created successfully",
          stockDeducted: orderData.affectStockValue,
        },
        { status: 201 }
      );
}
