import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = "production";

let client;
let db;

async function connectToDatabase() {
  if (!db) {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
  }
  return db;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");

    const db = await connectToDatabase();
    const collection = db.collection("entries");

    const query = {};

    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) query.date.$gte = fromDate;
      if (toDate) query.date.$lte = toDate;
    }

    const entries = await collection
      .find(query)
      .sort({ date: -1, createdAt: -1 })
      .toArray();

    return Response.json(entries);
  } catch (error) {
    console.error("GET /entries error:", error);
    return Response.json({ error: "Failed to fetch entries" }, { status: 500 });
  }
}
