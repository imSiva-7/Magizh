import getDatabase from "@/database/connectToMongoDB";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    // History uses from/to; the dashboard shares start/end with other histories.
    const fromDate = searchParams.get("fromDate") || searchParams.get("startDate");
    const toDate = searchParams.get("toDate") || searchParams.get("endDate");

    const db = await getDatabase();
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
