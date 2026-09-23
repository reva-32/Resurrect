import mongoose from "mongoose";

const ReceivableAuditLogSchema = new mongoose.Schema(
  {
    merchant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },
    event: {
      type: String,
      enum: ["invoice_created", "status_changed", "recovery_recommended", "recovery_actioned", "payment_recorded"],
      required: true,
    },
    detail: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("ReceivableAuditLog", ReceivableAuditLogSchema);
