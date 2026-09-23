import mongoose from "mongoose";

const BusinessCustomerSchema = new mongoose.Schema(
  {
    merchant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    businessName: { type: String, required: true, trim: true },
    contactName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    creditLimit: { type: Number, default: 0 }, // paise
    totalBilled: { type: Number, default: 0 }, // paise
    totalPaid: { type: Number, default: 0 }, // paise
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

BusinessCustomerSchema.index({ merchant: 1, businessName: 1 });

export default mongoose.model("BusinessCustomer", BusinessCustomerSchema);
