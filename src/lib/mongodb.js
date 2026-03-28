import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("❌ MONGODB_URI is not defined in environment variables");
}

// Different options for development vs production
const options = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS:
    process.env.NODE_ENV === "development" ? 10000 : 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  // Development-specific options
  ...(process.env.NODE_ENV === "development" && {
    monitorCommands: true,
  }),
};

let client;
let clientPromise;

if (process.env.NODE_ENV === "development") {
  console.log("🔧 Development mode - MongoDB config:", {
    uri: uri.substring(0, 50) + "...",
    hasAtlas: uri.includes("mongodb+srv"),
    isLocalhost: uri.includes("localhost"),
  });

  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);

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

    global._mongoClientPromise = client
      .connect()
      .then(() => {
        console.log("🎉 MongoDB connected successfully on localhost!");
        return client;
      })
      .catch(async (err) => {
        console.error("💥 MongoDB connection failed:", err.message);
        if (uri.includes("mongodb+srv://")) {
          console.log("🔄 Trying standard connection string...");
          const standardUri = uri.replace("mongodb+srv://", "mongodb://");
          const fallbackClient = new MongoClient(standardUri, options);

          try {
            await fallbackClient.connect();
            console.log("✅ Standard connection successful!");
            return fallbackClient;
          } catch (fallbackErr) {
            console.error(
              "❌ Standard connection also failed:",
              fallbackErr.message,
            );
          }
        }

        throw err;
      });
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;
