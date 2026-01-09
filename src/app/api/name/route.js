import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

const clientPromise = MongoClient.connect(uri);

export async function POST(request) {
  try {
    const body = await request.json();

    const { uname } = body;

    const client = await clientPromise;
    const db = client.db("production");

    const data = { na9me: uname };

    const insert = await db.collection("example").insertOne(data);

    return NextResponse.json({ message: "Success" });
  } catch (error) {
    console.error("API Error - POST procurement:", error);
    return NextResponse.json(
      { error: "Failed to create record", details: error.message },
      { status: 500 }
    );
  }
}
