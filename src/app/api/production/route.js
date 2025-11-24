import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET(request) {
  try {
    console.log('GET /api/production - Connecting to MongoDB...');
    const client = await clientPromise;
    const db = client.db('production');
    
    const { searchParams } = new URL(request.url);
    const product = searchParams.get('product');
    
    let query = {};
    
    if (product) {
      query[`${product}_quantity`] = { $exists: true, $ne: null, $gt: 0 };
    }
    
    const entries = await db
      .collection('entries')
      .find(query)
      .sort({ date: -1, batch: -1 })
      .toArray();
    
    console.log(`GET /api/production - Found ${entries.length} entries`);
    return NextResponse.json(entries);
    
  } catch (error) {
    console.error('GET /api/production - Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch production data: ' + error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    console.log('POST /api/production - Starting...');
    const data = await request.json();
    console.log('POST /api/production - Received data:', data);
    
    if (!data.date || !data.batch) {
      return NextResponse.json(
        { error: 'Date and Batch are required' },
        { status: 400 }
      );
    }
    
    const client = await clientPromise;
    const db = client.db('production');
    
    const existingEntryCount = await db
      .collection('entries')
      .countDocuments({ 
        date: data.date, 
      });

    const productionData = {
      date: data.date,
      batch: existingEntryCount ? data.batch + " " + `(${existingEntryCount})` :data.batch,
      milk_quantity: data.milk_quantity,
      curd_quantity: data.curd_quantity,
      premium_paneer_quantity: data.premium_paneer_quantity,
      soft_paneer_quantity: data.soft_paneer_quantity,
      butter_quantity: data.butter_quantity,
      cream_quantity: data.cream_quantity,
      ghee_quantity: data.ghee_quantity,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log('POST /api/production - Inserting data:', productionData);
    const result = await db
      .collection('entries')
      .insertOne(productionData);

    
    console.log('POST /api/production - Insert successful, ID:', result.insertedId);
    return NextResponse.json({
      success: true,
      id: result.insertedId,
      message: 'Production data added successfully'
    });
    
  } catch (error) {
    console.error('POST /api/production - Error:', error);
    return NextResponse.json(
      { error: 'Failed to add production data: ' + error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }
    
    const client = await clientPromise;
    const db = client.db('production');
    
    const { ObjectId } = await import('mongodb');
    
    const result = await db
      .collection('entries')
      .deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Entry deleted successfully...'
    });
    
  } catch (error) {
    console.error('DELETE /api/production - Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete production data: ' + error.message },
      { status: 500 }
    );
  }
}