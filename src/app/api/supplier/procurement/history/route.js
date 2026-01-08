import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";

// Cache the connection promise for better performance
const clientPromise = MongoClient.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

export async function GET(request) {
  try {
    // Get query parameters for filtering
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Connect to database
    const client = await clientPromise;
    const db = client.db("production");
    const collection = db.collection("procurements");

    // Build query
    const query = {};

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    // Fetch procurements with optimized query
    const procurements = await collection
      .find(query)
      .sort({ date: -1, time: -1 }) // Sort by date then time for consistent ordering
      .limit(5000) // Limit to prevent memory issues
      .project({
        _id: 1,
        date: 1,
        time: 1,
        milkQuantity: 1,
        fatPercentage: 1,
        snfPercentage: 1,
        rate: 1,
        totalAmount: 1,
        supplierId: 1,
        supplierName: 1,
        supplierType: 1,
        supplierTSRate: 1,
        createdAt: 1,
      })
      .toArray();

    // Convert ObjectId to string for JSON serialization
    const serializedProcurements = procurements.map((procurement) => ({
      ...procurement,
      _id: procurement._id.toString(),
      supplierId: procurement.supplierId?.toString() || null,
    }));

    // Set cache headers
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    };

    return NextResponse.json(serializedProcurements, { status: 200, headers });
  } catch (error) {
    console.error("Error fetching procurements:", error);

    // Return appropriate error response
    return NextResponse.json(
      {
        error: "Failed to fetch procurement data",
        message: error.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Optional: Add OPTIONS method for CORS
export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
