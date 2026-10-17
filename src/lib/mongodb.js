import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is not defined in environment variables");
}

const options = {
  maxPoolSize: 20,
  minPoolSize: 0,
  maxIdleTimeMS: 60000,
  serverSelectionTimeoutMS: process.env.NODE_ENV === "development" ? 15000 : 30000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
};

// Next.js can load this module through multiple route bundles and hot reloads.
// Share the pending connection as well as the connected client in every mode.
const cacheKey = Symbol.for("magizhdairyproductions.mongodb");
const cache = (globalThis[cacheKey] ??= { promise: null });

export function getMongoClient() {
  if (!cache.promise) {
    const promise = Promise.resolve()
      .then(async () => {
        const client = new MongoClient(uri, options);
        try {
          await client.connect();
          if (process.env.MONGO_DEBUG === "true") {
            console.info("MongoDB client connected");
          }
          return client;
        } catch (error) {
          // Release any sockets created by an unsuccessful connection attempt.
          await client.close().catch(() => {});
          throw error;
        }
      })
      .catch((error) => {
        if (cache.promise === promise) cache.promise = null;
        throw error;
      });

    cache.promise = promise;
  }

  return cache.promise;
}

// Preserve existing `await clientPromise` callers and the auth adapter, while
// connecting only when needed. A later await can retry a failed initial attempt.
const clientPromise = {
  then(onFulfilled, onRejected) {
    return getMongoClient().then(onFulfilled, onRejected);
  },
  catch(onRejected) {
    return getMongoClient().catch(onRejected);
  },
  finally(onFinally) {
    return getMongoClient().finally(onFinally);
  },
};

// Next.js owns process shutdown; adding signal listeners here leaks them on HMR.
// Driver pool events are per replica-set server, not new application clients.
export default clientPromise;
