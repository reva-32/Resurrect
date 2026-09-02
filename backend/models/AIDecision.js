import mongoose from "mongoose";

const AIDecisionSchema = new mongoose.Schema(
  {
    merchant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true },

    // What the model recommended, before backend policy checked it
    recommendedAction: { type: String, enum: ["retry", "sms", "priority_sms", "stop", "review"], required: true },
    reasoning: { type: String, required: true }, // short natural-language explanation, shown in audit trail

    // What actually happened after backend safety rules were applied
    finalAction: { type: String, enum: ["retry", "sms", "priority_sms", "stop", "review"], required: true },
    wasOverridden: { type: Boolean, default: false }, // true if backend rejected/changed the AI's recommendation
    overrideReason: { type: String }, // e.g. "max_retries_exceeded"

    model: { type: String }, // e.g. "claude-sonnet-4-6"
    rawResponse: { type: String }, // stored for debugging / audit, not shown in main UI
  },
  { timestamps: true }
);

export default mongoose.model("AIDecision", AIDecisionSchema);
