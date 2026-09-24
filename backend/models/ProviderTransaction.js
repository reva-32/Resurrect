import mongoose from "mongoose";

const ProviderTransactionSchema = new mongoose.Schema(
  {
    merchant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", index: true },
    externalPaymentId: { type: String, required: true },
    paymentLinkId: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["created", "processing", "authorized", "captured", "settled", "failed", "refunded", "unknown"], default: "unknown" },
    dataSource: { type: String, enum: ["razorpay_test", "demo_provider_snapshot"], default: "demo_provider_snapshot" },
    observedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ProviderTransactionSchema.index({ merchant: 1, externalPaymentId: 1 }, { unique: true });

export default mongoose.model("ProviderTransaction", ProviderTransactionSchema);
