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


// import { MongoClient, ObjectId } from "mongodb";

// const uri = process.env.MONGODB_URI;
// const dbName = "production";

// let client;
// let db;
// let connectionPromise;

// async function connectToDatabase() {
//   if (!connectionPromise) {
//     connectionPromise = (async () => {
//       try {
//         if (!uri) {
//           throw new Error("MONGODB_URI environment variable is not set");
//         }
        
//         client = new MongoClient(uri, {
//           maxPoolSize: 10,
//           minPoolSize: 5,
//           serverSelectionTimeoutMS: 5000,
//         });
        
//         await client.connect();
//         db = client.db(dbName);
        
//         console.log("Successfully connected to MongoDB");
//         return db;
//       } catch (error) {
//         console.error("Failed to connect to MongoDB:", error);
//         connectionPromise = null;
//         throw error;
//       }
//     })();
//   }
  
//   return connectionPromise;
// }

// // Helper function to validate date format
// function isValidDate(dateString) {
//   const regex = /^\d{4}-\d{2}-\d{2}$/;
//   if (!regex.test(dateString)) return false;
  
//   const date = new Date(dateString);
//   return date instanceof Date && !isNaN(date) && date.toISOString().slice(0, 10) === dateString;
// }

// // Helper function to build query with validation
// function buildQuery(fromDate, toDate) {
//   const query = {};
  
//   if (fromDate || toDate) {
//     query.date = {};
    
//     if (fromDate) {
//       if (!isValidDate(fromDate)) {
//         throw new Error("Invalid fromDate format. Use YYYY-MM-DD");
//       }
//       query.date.$gte = fromDate;
//     }
    
//     if (toDate) {
//       if (!isValidDate(toDate)) {
//         throw new Error("Invalid toDate format. Use YYYY-MM-DD");
//       }
//       query.date.$lte = toDate;
//     }
    
//     // Ensure fromDate is not after toDate
//     if (fromDate && toDate && fromDate > toDate) {
//       throw new Error("fromDate cannot be after toDate");
//     }
//   }
  
//   return query;
// }

// export async function GET(request) {
//   let clientSession;
  
//   try {
//     const { searchParams } = new URL(request.url);
//     const fromDate = searchParams.get("fromDate");
//     const toDate = searchParams.get("toDate");
    
//     // Get page and limit for pagination (optional enhancement)
//     const page = parseInt(searchParams.get("page") || "1");
//     const limit = parseInt(searchParams.get("limit") || "100");
//     const skip = (page - 1) * limit;

//     const db = await connectToDatabase();
//     const collection = db.collection("entries");
    
//     // Build query with validation
//     const query = buildQuery(fromDate, toDate);
    
//     // Get total count for pagination metadata
//     const totalCount = await collection.countDocuments(query);
    
//     // Fetch entries with sorting and pagination
//     const entries = await collection
//       .find(query)
//       .sort({ 
//         date: 1,          // Sort by date ascending
//         createdAt: 1,     // Then by createdAt ascending for same dates
//         _id: 1            // Then by _id for deterministic ordering
//       })
//       // .skip(skip)
//       // .limit(limit)
//       .toArray();
    
//     // Transform entries if needed (e.g., convert ObjectId to string)
//     const transformedEntries = entries.map(entry => ({
//       ...entry,
//       _id: entry._id.toString(),
//       // Ensure date is formatted consistently
//       date: entry.date?.toISOString?.().slice(0, 10) || entry.date,
//       createdAt: entry.createdAt?.toISOString?.() || entry.createdAt,
//     }));
    
//     // Return response with metadata
//     return Response.json({
//     entries
//     });
    
//   } catch (error) {
//     console.error("GET /entries error:", error);
    
//     // Return appropriate error responses
//     if (error.message.includes("Invalid") || error.message.includes("cannot be after")) {
//       return Response.json(
//         { 
//           success: false, 
//           error: "Validation Error", 
//           message: error.message 
//         }, 
//         { status: 400 }
//       );
//     }
    
//     if (error.name === 'MongoNetworkError' || error.message.includes('connect')) {
//       return Response.json(
//         { 
//           success: false, 
//           error: "Database Connection Error", 
//           message: "Unable to connect to database" 
//         }, 
//         { status: 503 }
//       );
//     }
    
//     return Response.json(
//       { 
//         success: false, 
//         error: "Internal Server Error", 
//         message: "Failed to fetch entries" 
//       }, 
//       { status: 500 }
//     );
//   } finally {
//     if (clientSession) {
//       await clientSession.endSession();
//     }
//   }
// }

// // Optional: Cleanup function for serverless environments
// if (process.env.NODE_ENV === 'production') {
//   async function cleanup() {
//     if (client) {
//       await client.close();
//       console.log("MongoDB connection closed");
//     }
//   }
  
//   // Handle cleanup on process termination
//   process.on('SIGTERM', cleanup);
//   process.on('SIGINT', cleanup);
// }