import express from "express";
import mongoose from "mongoose";
import Payment from "../models/Payment.js";
import User from "../models/User.js";

const router = express.Router();

// PUBLIC — no auth. This is what the customer sees when they open the
// recovery link from SMS. Deliberately returns only what a customer should
// see: never the internal audit trail, AI reasoning, or other customers' data.
//
// NOTE (see SECURITY.md): using the raw MongoDB _id as the public link token
// is fine for a hackathon demo but is guessable/enumerable. A production
// version should use a separate signed, single-use, expiring token instead.
router.get("/payments/:id", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ error: "Payment not found" });
  }

  const payment = await Payment.findById(req.params.id).populate("customer", "name");
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  const merchant = await User.findOne().select("businessName");

  res.json({
    customerName: payment.customer?.name,
    businessName: merchant?.businessName || "Merchant",
    amount: payment.amount,
    status: payment.status, // failed | recovery_in_progress | recovered | stopped
    recoveredAt: payment.recoveredAt,
    paymentLinkUrl: payment.razorpay?.isLive ? payment.razorpay.paymentLinkUrl : null,
    isLive: !!payment.razorpay?.isLive,
  });
});

export default router;
