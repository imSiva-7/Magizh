import { MongoClient, ObjectId } from 'mongodb';

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
const dbName = 'production';

async function connectToDatabase() {
  if (!client.topology || !client.topology.isConnected()) {
    await client.connect();
  }
  return client.db(dbName);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');
    const product = searchParams.get('product');

    const db = await connectToDatabase();
    const collection = db.collection('entries');

    // Build query based on filters
    let query = {};

    // Date range filter
    if (fromDate && toDate) {
      query.date = {
        $gte: fromDate,
        $lte: toDate
      };
    }

    // Product filter
    if (product) {
      query[product] = { $exists: true, $ne: "" };
    }

    const entries = await collection.find(query)
      .sort({ date: -1, createdAt: -1 })
      .toArray();

    return Response.json(entries);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}