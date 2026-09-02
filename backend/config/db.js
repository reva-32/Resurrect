import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set in environment");
  }
  await mongoose.connect(uri);
  console.log("[db] connected to MongoDB");
}
