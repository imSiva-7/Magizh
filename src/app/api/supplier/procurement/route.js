// src/app/api/supplier/procurement/route.js
import { NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

const clientPromise = MongoClient.connect(process.env.MONGODB_URI);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get("supplierId");
    const milkQuantity = searchParams.get("milkQuantity"); 
    // const startDate = searchParams.get("startDate");
    // const endDate = searchParams.get("endDate");
    const id = searchParams.get("id");

    // For single record
    if (id) {
      if (!ObjectId.isValid(id)) {
        return NextResponse.json(
          { error: "Invalid Record ID" },
          { status: 400 }
        );
      }

      const client = await clientPromise;
      const db = client.db("production");
      const procurement = await db
        .collection("procurements")
        .findOne({ _id: new ObjectId(id) });

      return NextResponse.json(procurement || {});
    }

    // For multiple records with supplier filter
    if (!supplierId) {
      return NextResponse.json(
        { error: "Supplier ID is required" },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(supplierId)) {
      return NextResponse.json(
        { error: "Invalid Supplier ID" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("production");

    // Build the query
    const query = { supplierId: new ObjectId(supplierId) };

    // Add Date Filtering
    // if (startDate || endDate) {
    //   query.date = {};
    //   if (startDate) {
    //     query.date.$gte = startDate;
    //   }
    //   if (endDate) {
    //     query.date.$lte = endDate;
    //   }
    // }
    const procurements = await db
      .collection("procurements")
      .find(query)
      .sort({ date: -1, time: 1 })
      .toArray();

    return NextResponse.json(procurements);
  } catch (error) {
    console.error("API Error - GET procurement:", error);
    return NextResponse.json(
      { error: "Failed to fetch data", details: error.message },
      { status: 500 }
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

    // Validation
    if (!supplierId || !ObjectId.isValid(supplierId)) {
      return NextResponse.json(
        { error: "Invalid Supplier ID" },
        { status: 400 }
      );
    }

    if (
      !date ||
      !time ||
      !milkQuantity ||
      !fatPercentage ||
      !snfPercentage ||
      !rate ||
      !totalAmount
    ) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("production");

    const newProcurement = {
      supplierId: new ObjectId(supplierId),
      supplierName: supplierName,
      supplierType: supplierType,
      supplierTSRate: supplierTSRate,
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
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("API Error - POST procurement:", error);
    return NextResponse.json(
      { error: "Failed to create record", details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const body = await request.json();

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid Record ID" }, { status: 400 });
    }

    const {
      date,
      time,
      milkQuantity,
      fatPercentage,
      snfPercentage,
      rate,
      totalAmount,
    } = body;

    if (
      !date ||
      !time ||
      !milkQuantity ||
      !fatPercentage ||
      !snfPercentage ||
      !rate ||
      !totalAmount
    ) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("production");

    const updateData = {
      date,
      time,
      milkQuantity: parseFloat(milkQuantity),
      fatPercentage: parseFloat(fatPercentage),
      snfPercentage: parseFloat(snfPercentage),
      rate: parseFloat(rate),
      totalAmount: parseFloat(totalAmount),
      updatedAt: new Date(),
    };

    const result = await db
      .collection("procurements")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Procurement record updated successfully",
    });
  } catch (error) {
    console.error("API Error - PUT procurement:", error);
    return NextResponse.json(
      { error: "Failed to update record", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid Record ID" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("production");

    const result = await db
      .collection("procurements")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Procurement record deleted successfully",
    });
  } catch (error) {
    console.error("API Error - DELETE procurement:", error);
    return NextResponse.json(
      { error: "Failed to delete record", details: error.message },
      { status: 500 }
    );
  }
}
