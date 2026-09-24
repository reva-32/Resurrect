import mongoose from "mongoose";

const ReconciliationSchema = new mongoose.Schema(
  {
    merchant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", index: true },
    providerTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "ProviderTransaction", index: true },
    result: { type: String, enum: ["matched", "amount_mismatch", "status_mismatch", "missing_provider", "missing_internal"], required: true },
    internalAmount: { type: Number },
    providerAmount: { type: Number },
    internalStatus: { type: String },
    providerStatus: { type: String },
    detail: { type: String, required: true },
    checkedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("Reconciliation", ReconciliationSchema);
