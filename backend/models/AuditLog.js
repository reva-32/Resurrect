import mongoose from "mongoose";

// One row per meaningful event on a payment — this feeds the judge-facing audit trail.
const AuditLogSchema = new mongoose.Schema(
  {
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true },
    event: {
      type: String,
      enum: [
        "payment_failed",
        "ai_decision_made",
        "action_approved",
        "action_rejected",
        "sms_sent",
        "retry_attempted",
        "payment_recovered",
        "recovery_stopped",
      ],
      required: true,
    },
    detail: { type: String }, // short human-readable summary, e.g. "AI recommended retry, backend approved"
    metadata: { type: mongoose.Schema.Types.Mixed }, // free-form extra data
    at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("AuditLog", AuditLogSchema);
