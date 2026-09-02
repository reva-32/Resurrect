import mongoose from "mongoose";

const FAILURE_REASONS = [
  "bank_timeout",
  "insufficient_funds",
  "checkout_abandoned",
  "card_declined",
  "network_error",
  "otp_failed",
  "unknown",
];

const PaymentSchema = new mongoose.Schema(
  {
    merchant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    amount: { type: Number, required: true }, // in paise (₹1 = 100)
    currency: { type: String, default: "INR" },

    status: {
      type: String,
      enum: ["failed", "recovery_in_progress", "recovered", "stopped"],
      default: "failed",
    },

    failureReason: { type: String, enum: FAILURE_REASONS, default: "unknown" },
    failedAt: { type: Date, default: Date.now },

    // Populated once a real Razorpay Payment Link is created for this payment
    razorpay: {
      paymentLinkId: { type: String }, // plink_xxx
      paymentLinkUrl: { type: String },
      paymentId: { type: String }, // pay_xxx, set once paid
      isLive: { type: Boolean, default: false }, // true only for the real demo payment(s)
    },

    retryCount: { type: Number, default: 0 },
    recoveredAmount: { type: Number, default: 0 },
    recoveryLink: { type: String }, // the customer-app URL sent via SMS, so the merchant dashboard can show/reopen it
    recoveredAt: { type: Date },

    isSynthetic: { type: Boolean, default: true }, // false only for the real demo case(s)
  },
  { timestamps: true }
);

export const FAILURE_REASON_VALUES = FAILURE_REASONS;
export default mongoose.model("Payment", PaymentSchema);
