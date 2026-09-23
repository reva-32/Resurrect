import mongoose from "mongoose";

const TrainingRecordSchema = new mongoose.Schema(
  {
    merchant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ["card", "upi", "netbanking", "wallet"], required: true },
    failureReason: { type: String, required: true },
    retryCount: { type: Number, min: 0, max: 3, required: true },
    timeSinceFailureMinutes: { type: Number, min: 0, required: true },
    customerHistory: { type: Number, min: 0, required: true },
    previousFailures: { type: Number, min: 0, required: true },
    recovered: { type: Boolean, required: true },
    dataSource: { type: String, enum: ["synthetic"], default: "synthetic" },
  },
  { timestamps: true }
);

TrainingRecordSchema.index({ merchant: 1, dataSource: 1 });

export default mongoose.model("TrainingRecord", TrainingRecordSchema);
