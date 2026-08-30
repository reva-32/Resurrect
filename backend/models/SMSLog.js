import mongoose from "mongoose";

const SMSLogSchema = new mongoose.Schema(
  {
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },

    message: { type: String, required: true },
    recoveryLink: { type: String },

    mode: { type: String, enum: ["mock", "real"], required: true },
    status: { type: String, enum: ["queued", "sent", "delivered", "failed"], default: "queued" },
    providerResponse: { type: String }, // raw provider response, for debugging

    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("SMSLog", SMSLogSchema);
