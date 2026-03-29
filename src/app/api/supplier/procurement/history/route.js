import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";

const clientPromise = MongoClient.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
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
    const procurements = await collection
      .find(query)
      .sort({ date: -1, createdAt: -1 })
      .toArray();

    const serializedProcurements = procurements.map((procurement) => ({
      ...procurement,
      _id: procurement._id.toString(),
      supplierId: procurement.supplierId?.toString() || null,
    }));

  
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    };

    return NextResponse.json(serializedProcurements, { status: 200, headers });
  } catch (error) {
    console.error("Error fetching procurements:", error);

    
    return NextResponse.json(
      {
        error: "Failed to fetch procurement data",
        message: error.message || "Internal server error",
      },
      { status: 500 },
    );
  }
}
export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
