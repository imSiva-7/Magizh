import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db('production');
    
    // Test the connection
    await db.command({ ping: 1 });
    
    // Test if we can create collections (optional)
    const collections = await db.listCollections().toArray();
    
    return NextResponse.json({ 
      success: true, 
      message: 'Successfully connected to MongoDB!',
      collections: collections.map(col => col.name)
    });
  } catch (error) {
    console.error('MongoDB connection error:', error);
    return NextResponse.json(
      { error: 'Failed to connect to MongoDB: ' + error.message },
      { status: 500 }
    );
  }
}