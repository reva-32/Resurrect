import mongoose from "mongoose";

const InvoiceSchema = new mongoose.Schema(
  {
    merchant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    businessCustomer: { type: mongoose.Schema.Types.ObjectId, ref: "BusinessCustomer", required: true, index: true },
    invoiceNumber: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 1 }, // paise
    amountPaid: { type: Number, default: 0, min: 0 }, // paise
    issueDate: { type: Date, required: true },
    dueDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["due", "due_soon", "overdue", "partially_paid", "paid"],
      default: "due",
      index: true,
    },
    lastRecoveryAction: { type: String, enum: ["reminder", "priority_followup", "review", null], default: null },
    lastRecoveryAt: { type: Date, default: null },
    dataSource: { type: String, enum: ["synthetic", "merchant"], default: "merchant" },
  },
  { timestamps: true }
);

InvoiceSchema.index({ merchant: 1, invoiceNumber: 1 }, { unique: true });

export default mongoose.model("Invoice", InvoiceSchema);
