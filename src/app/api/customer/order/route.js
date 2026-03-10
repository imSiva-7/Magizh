import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const METHOD_NAMES = {
  GET: "GET /api/order",
  POST: "POST /api/order",
  PUT: "PUT /api/order",
  DELETE: "DELETE /api/order",
  PATCH: "PATCH /api/order/bulk",
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

// GET orders – either by customerId (list) or by id (single order)
export async function GET(request) {
  const METHOD = METHOD_NAMES.GET;

  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("id");
     const customerId = searchParams.get("customerId");

    const db = await getDatabase();

    // Single order by ID
    if (orderId) {
      if (!ObjectId.isValid(orderId)) {
        return NextResponse.json(
          { error: "Invalid order ID" },
          { status: 400 },
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

    // Orders for a specific customer
    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 },
      );
    }
    if (!ObjectId.isValid(customerId)) {
      return NextResponse.json(
        { error: "Invalid customer ID" },
        { status: 400 },
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

// CREATE a new order
export async function POST(request) {
  const METHOD = METHOD_NAMES.POST;

  try {
    const db = await getDatabase();
    const data = await request.json();

    // Basic validation
    if (!data.customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 },
      );
    }
    if (!ObjectId.isValid(data.customerId)) {
      return NextResponse.json(
        { error: "Invalid customerId" },
        { status: 400 },
      );
    }

    const {
      items,
      totalAmount,
      date,
      time,
      paymentStatus,
      customerName,
      customerType,
    } = data;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "At least one order item is required" },
        { status: 400 },
      );
    }

    // Validate each item
    for (const item of items) {
      if (!item.product || !item.quantity || !item.ratePerUnit) {
        return NextResponse.json(
          { error: "Each item must have product, quantity, and ratePerUnit" },
          { status: 400 },
        );
      }
    }

    const orderData = {
      customerId: new ObjectId(data.customerId),
      customerName: customerName?.trim() || "",
      customerType: customerType?.trim() || "",
      date: date || new Date().toISOString().split("T")[0],
      time: time || "AM",
      items: items.map((item) => ({
        product: item.product.trim(),
        quantity: parseFloat(item.quantity) || 0,
        ratePerUnit: parseFloat(item.ratePerUnit) || 0,
        totalAmount: parseFloat(item.totalAmount) || 0,
      })),
      totalAmount: parseFloat(totalAmount) || 0,
      paymentStatus: paymentStatus || "Not Paid",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("orders").insertOne(orderData);

    return NextResponse.json(
      {
        _id: result.insertedId,
        ...orderData,
        message: "Order created successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json(
      { error: "Failed to create order", details: error.message },
      { status: 500 },
    );
  }
}

// UPDATE an existing order
export async function PUT(request) {
  const METHOD = METHOD_NAMES.PUT;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Valid order ID required" },
        { status: 400 },
      );
    }

    const db = await getDatabase();
    const data = await request.json();

    const updateData = { updatedAt: new Date() };

    if (data.date !== undefined) updateData.date = data.date;
    if (data.time !== undefined) updateData.time = data.time;
    if (data.paymentStatus !== undefined)
      updateData.paymentStatus = data.paymentStatus;
    if (data.items !== undefined) {
      if (!Array.isArray(data.items) || data.items.length === 0) {
        return NextResponse.json(
          { error: "Items array cannot be empty" },
          { status: 400 },
        );
      }
      updateData.items = data.items.map((item) => ({
        product: item.product.trim(),
        quantity: parseFloat(item.quantity) || 0,
        ratePerUnit: parseFloat(item.ratePerUnit) || 0,
        totalAmount: parseFloat(item.totalAmount) || 0,
      }));
      // Recalculate total amount if needed, or trust frontend
      updateData.totalAmount = updateData.items.reduce(
        (sum, item) => sum + item.totalAmount,
        0,
      );
    }

    const result = await db
      .collection("orders")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Order updated successfully" });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

// DELETE an order
export async function DELETE(request) {
  const METHOD = METHOD_NAMES.DELETE;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Valid order ID required" },
        { status: 400 },
      );
    }

    const db = await getDatabase();

    // Optional: check for dependencies (e.g., payments) – skip for now
    const result = await db
      .collection("orders")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: "Order deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}

// BULK UPDATE – e.g., mark multiple orders as paid
export async function PATCH(request) {
  const METHOD = METHOD_NAMES.PATCH;

  try {
    const db = await getDatabase();
    const { orderIds, status } = await request.json();

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { error: "orderIds array is required" },
        { status: 400 },
      );
    }
    if (!status || !["Paid", "Not Paid"].includes(status)) {
      return NextResponse.json(
        { error: "Valid status (Paid/Not Paid) is required" },
        { status: 400 },
      );
    }

    // Convert string IDs to ObjectId, filter invalid ones
    const validObjectIds = orderIds
      .map((id) => (ObjectId.isValid(id) ? new ObjectId(id) : null))
      .filter((id) => id !== null);

    if (validObjectIds.length === 0) {
      return NextResponse.json(
        { error: "No valid order IDs provided" },
        { status: 400 },
      );
    }

    const result = await db
      .collection("orders")
      .updateMany(
        { _id: { $in: validObjectIds } },
        { $set: { paymentStatus: status, updatedAt: new Date() } },
      );

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
