import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// Helper for standardizing console logs
const log = (method, message, data = null) => {
  const timestamp = new Date().toISOString();
  const dataString = data ? ` | Data: ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [${method}] ${message}${dataString}`);
};

const parseQuantity = (val) => {
  const num = Number(val);
  return !isNaN(num) && num >= 0 ? num : null;
};

// --- GET: Fetch Data ---
export async function GET(request) {
  const METHOD = 'GET /api/production';
  try {
    const { searchParams } = new URL(request.url);
    const product = searchParams.get('product');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    log(METHOD, 'Fetching started', { product, startDate, endDate });

    const client = await clientPromise;
    const db = client.db('production');

    let query = {};

    // Dynamic Filter
    if (product && !product.includes('$')) {
       query[`${product}_quantity`] = { $exists: true, $ne: null, $gt: 0 };
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    const entries = await db
      .collection('entries')
      .find(query)
      .sort({ date: -1, createdAt: -1 })
      .limit(100)
      .toArray();

    log(METHOD, `Success. Found ${entries.length} entries.`);
    
    return NextResponse.json(entries);

  } catch (error) {
    console.error(`[${METHOD}] CRITICAL ERROR:`, error);
    return NextResponse.json(
      { error: 'Server error: Could not fetch production records.' }, 
      { status: 500 }
    );
  }
}

// --- POST: Create Data ---
export async function POST(request) {
  const METHOD = 'POST /api/production';
  try {
    const data = await request.json();
    log(METHOD, 'Request received', data);

    // 1. Validation
    if (!data.date || !data.batch) {
      log(METHOD, 'Validation Failed: Missing required fields');
      return NextResponse.json(
        { error: 'Validation Error: Date and Batch are required.' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('production');

    // 2. Duplicate / Batch Logic
    let finalBatchName = data.batch;
    const existingBatch = await db.collection('entries').findOne({ batch: finalBatchName });

    if (existingBatch) {
       log(METHOD, `Batch name "${finalBatchName}" exists. Checking for duplicates...`);
       const count = await db.collection('entries').countDocuments({ date: data.date });
       finalBatchName = `${data.batch} (${count + 1})`; // Start at (1) not (0)
       log(METHOD, `Renamed batch to: ${finalBatchName}`);
    }

    // 3. Construct Payload
    const productionData = {
      date: data.date,
      batch: finalBatchName,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Dynamic quantity loop
    Object.keys(data).forEach(key => {
      if (key.endsWith('_quantity')) {
        productionData[key] = parseQuantity(data[key]);
      }
    });

    // 4. Insert
    const result = await db.collection('entries').insertOne(productionData);
    
    if (!result.acknowledged) {
        throw new Error("Database refused insertion");
    }

    log(METHOD, 'Insertion successful', { id: result.insertedId });

    return NextResponse.json({
      success: true,
      id: result.insertedId,
      message: `Batch ${finalBatchName} saved successfully!` // Ready for Toast
    }, { status: 201 });

  } catch (error) {
    console.error(`[${METHOD}] CRITICAL ERROR:`, error);
    return NextResponse.json(
      { error: 'Server Error: Failed to save entry. Please try again.' },
      { status: 500 }
    );
  }
}

// --- DELETE: Remove Data ---
export async function DELETE(request) {
  const METHOD = 'DELETE /api/production';
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    log(METHOD, 'Request received', { id });

    if (!id) {
      log(METHOD, 'Validation Failed: No ID provided');
      return NextResponse.json({ error: 'Error: Cannot delete without a valid ID.' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('production');

    const result = await db
      .collection('entries')
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      log(METHOD, 'Warning: ID not found in database', { id });
      return NextResponse.json({ error: 'Error: Entry not found or already deleted.' }, { status: 404 });
    }

    log(METHOD, 'Deletion successful', { id });
    return NextResponse.json({
      success: true,
      message: 'Entry deleted successfully.' // Ready for Toast
    });

  } catch (error) {
    console.error(`[${METHOD}] CRITICAL ERROR:`, error);
    return NextResponse.json(
      { error: 'Server Error: Could not delete entry.' },
      { status: 500 }
    );
  }
}