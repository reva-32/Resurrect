import mongoose from "mongoose";

const RecoveryAttemptSchema = new mongoose.Schema(
  {
    merchant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },

    action: {
      type: String,
      enum: ["retry", "sms", "priority_sms", "stop", "review"],
      required: true,
    },

    // Where the decision came from — lets you compare rule-only vs AI-assisted at demo time
    decidedBy: { type: String, enum: ["rules", "ai"], required: true },

    outcome: {
      type: String,
      enum: ["pending", "success", "failure", "no_response"],
      default: "pending",
    },

    attemptedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("RecoveryAttempt", RecoveryAttemptSchema);
