import mongoose from "mongoose";

const WebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    event: { type: String, required: true },
    status: {
      type: String,
      enum: ["processing", "processed", "failed"],
      default: "processing",
    },
    processedAt: { type: Date },
    error: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("WebhookEvent", WebhookEventSchema);
