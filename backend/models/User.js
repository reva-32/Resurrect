import mongoose from "mongoose";

// A merchant account — the person logging into the dashboard.
const UserSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);
