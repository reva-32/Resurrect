import mongoose from "mongoose";

const CustomerSchema = new mongoose.Schema(
  {
    merchant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true }, // E.164, e.g. +91XXXXXXXXXX
    email: { type: String },
    isDemoCustomer: { type: Boolean, default: false }, // true = your real phone, used for the live demo
    successfulPaymentsCount: { type: Number, default: 0 },
    lifetimeValue: { type: Number, default: 0 }, // sum of successful payments, in paise
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("Customer", CustomerSchema);
