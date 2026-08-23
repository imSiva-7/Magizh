import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("❌ MONGODB_URI is not defined in environment variables");
}

const options = {
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 60000, // Close idle connections after 60 seconds
  serverSelectionTimeoutMS: process.env.NODE_ENV === "development" ? 10000 : 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  ...(process.env.NODE_ENV === "development" && {
    monitorCommands: false, // Disabled to reduce memory overhead
  }),
};

let client;
let clientPromise;

if (process.env.NODE_ENV === "development") {
  // In development mode, use a global variable to preserve the connection
  // across hot module reloads (HMR)
  if (!global._mongoClientPromise) {
    console.log("🔧 Creating new MongoDB connection pool...");
    
    client = new MongoClient(uri, options);

    // Connection pool monitoring
    client.on("connectionPoolCreated", () => {
      console.log("📊 MongoDB connection pool created");
    });

    client.on("connectionPoolClosed", () => {
      console.log("📊 MongoDB connection pool closed");
    });

    // Optional: Monitor connection pool stats
    if (process.env.MONGO_DEBUG === "true") {
      client.on("commandStarted", (event) => {
        if (event.commandName !== "ping" && event.commandName !== "isMaster") {
          console.log(`🔍 MongoDB ${event.commandName} started`);
        }
      });

      client.on("commandSucceeded", (event) => {
        if (event.commandName !== "ping" && event.commandName !== "isMaster") {
          console.log(`✅ MongoDB ${event.commandName} succeeded`);
        }
      });

      client.on("commandFailed", (event) => {
        console.error(`❌ MongoDB ${event.commandName} failed:`, event.failure);
      });
    }

    global._mongoClientPromise = client
      .connect()
      .then(() => {
        console.log("🎉 MongoDB connected successfully!");
        return client;
      })
      .catch((err) => {
        console.error("💥 MongoDB connection failed:", err.message);
        delete global._mongoClientPromise; // Clear failed promise so it can be retried
        throw err;
      });
  } else {
    console.log("♻️  Reusing existing MongoDB connection");
  }
  
  clientPromise = global._mongoClientPromise;
} else {
  // In production, create a single client promise
  if (!clientPromise) {
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }
}

// Graceful shutdown handler
if (typeof process !== "undefined") {
  const cleanup = async () => {
    if (client) {
      console.log("🔌 Closing MongoDB connection...");
      await client.close();
      console.log("✅ MongoDB connection closed");
    }
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("beforeExit", cleanup);
}

export default clientPromise;
