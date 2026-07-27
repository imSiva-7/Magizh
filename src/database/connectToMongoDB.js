import clientPromise from "@/lib/mongodb";

const getDatabase = async () => {
  try {
    
    const client = await clientPromise;
    return client.db("production");
  } catch (error) {
    console.error("Database connection failed:", error.message);
    throw new Error("Database connection failed");
  }
};

export default getDatabase;