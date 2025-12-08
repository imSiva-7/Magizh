import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

// Helper to validate ObjectId
const isValidObjectId = (id) => {
  return ObjectId.isValid(id) && new ObjectId(id).toString() === id;
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get("supplierId");

    console.log("GET Procurement - Supplier ID:", supplierId);

    if (!supplierId) {
      return NextResponse.json(
        { error: "Supplier ID is required" },
        { status: 400 }
      );
    }

    // Validate ObjectId format
    if (!isValidObjectId(supplierId)) {
      return NextResponse.json(
        { error: "Invalid supplier ID format" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("production");

    console.log("Querying procurements for supplier:", supplierId);
    
    const procurements = await db
      .collection("procurements")
      .find({ supplierId: new ObjectId(supplierId) })
      .sort({ date: -1 })
      .toArray();

    console.log(`Found ${procurements.length} procurements`);
    
    return NextResponse.json(procurements);
  } catch (error) {
    console.error("GET /api/procurement error:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch procurements",
        details: process.env.NODE_ENV === "development" ? error.message : undefined 
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const client = await clientPromise;
    const db = client.db("production");
    const data = await request.json();

    console.log("POST Procurement - Received data:", data);

    // Validate required fields
    const requiredFields = ['supplierId', 'date', 'milkQuantity', 'rate'];
    const missingFields = requiredFields.filter(field => !data[field]);
    
    if (missingFields.length > 0) {
      return NextResponse.json(
        { 
          error: "Missing required fields",
          details: `Required: ${missingFields.join(', ')}`
        },
        { status: 400 }
      );
    }

    // Validate ObjectId format
    if (!isValidObjectId(data.supplierId)) {
      return NextResponse.json(
        { error: "Invalid supplier ID format" },
        { status: 400 }
      );
    }

    // Validate numeric fields
    const milkQty = parseFloat(data.milkQuantity);
    const rate = parseFloat(data.rate);
    
    if (isNaN(milkQty) || milkQty <= 0) {
      return NextResponse.json(
        { error: "Milk quantity must be a positive number" },
        { status: 400 }
      );
    }
    
    if (isNaN(rate) || rate <= 0) {
      return NextResponse.json(
        { error: "Rate must be a positive number" },
        { status: 400 }
      );
    }

    // Validate percentages if provided
    if (data.fatPercentage && (parseFloat(data.fatPercentage) < 0 || parseFloat(data.fatPercentage) > 100)) {
      return NextResponse.json(
        { error: "Fat percentage must be between 0 and 100" },
        { status: 400 }
      );
    }
    
    if (data.snfPercentage && (parseFloat(data.snfPercentage) < 0 || parseFloat(data.snfPercentage) > 100)) {
      return NextResponse.json(
        { error: "SNF percentage must be between 0 and 100" },
        { status: 400 }
      );
    }

    // Calculate total amount
    const totalAmount = parseFloat((milkQty * rate).toFixed(2));

    // Prepare procurement data - CRITICAL FIX: Convert date string to Date object
    const procurementData = {
      supplierId: new ObjectId(data.supplierId),
      date: new Date(data.date), // Convert string to Date object
      milkQuantity: milkQty,
      fatPercentage: data.fatPercentage ? parseFloat(data.fatPercentage) : null,
      snfPercentage: data.snfPercentage ? parseFloat(data.snfPercentage) : null,
      rate: rate,
      totalAmount: totalAmount,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    console.log("Procurement data to insert:", procurementData);
    console.log("Date type:", typeof procurementData.date, "Value:", procurementData.date);

    // Check if supplier exists
    const supplier = await db
      .collection("suppliers")
      .findOne({ _id: new ObjectId(data.supplierId) });
    
    if (!supplier) {
      return NextResponse.json(
        { error: "Supplier not found" },
        { status: 404 }
      );
    }

    // Insert the procurement
    const result = await db.collection("procurements").insertOne(procurementData);
    
    console.log("Insert result:", result);

    // Optional: Update supplier's last procurement date
    await db.collection("suppliers").updateOne(
      { _id: new ObjectId(data.supplierId) },
      { 
        $set: { 
          lastProcurementDate: procurementData.date,
          updatedAt: new Date()
        }
      }
    );

    return NextResponse.json(
      {
        _id: result.insertedId,
        ...procurementData,
        message: "Procurement added successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/procurement error:", error);
    console.error("Error stack:", error.stack);
    return NextResponse.json(
      { 
        error: "Failed to add procurement",
        details: process.env.NODE_ENV === "development" ? error.message : undefined 
      },
      { status: 500 }
    );
  }
}