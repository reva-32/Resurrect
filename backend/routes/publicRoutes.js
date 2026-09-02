import express from "express";
import mongoose from "mongoose";
import Payment from "../models/Payment.js";
import AuditLog from "../models/AuditLog.js";

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

  const payment = await Payment.findById(req.params.id).populate("customer", "name").populate("merchant", "businessName");
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  res.json({
    customerName: payment.customer?.name,
    businessName: payment.merchant?.businessName || "Merchant",
    amount: payment.amount,
    status: payment.status, // failed | recovery_in_progress | recovered | stopped
    recoveredAt: payment.recoveredAt,
    paymentLinkUrl: payment.razorpay?.isLive ? payment.razorpay.paymentLinkUrl : null,
    isLive: !!payment.razorpay?.isLive,
  });
});

// PUBLIC — no auth. Called once by the customer app when the recovery link
// is actually opened, so the merchant's audit trail shows "customer opened
// the link" as a distinct event from "payment recovered" — not just silence
// until money shows up. Guarded to at most one log per payment per minute so
// the status page's polling (every 3s) doesn't spam the audit trail.
router.post("/payments/:id/viewed", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ error: "Payment not found" });
  }

  const payment = await Payment.findById(req.params.id);
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const recentlyLogged = await AuditLog.findOne({
    payment: payment._id,
    event: "link_opened",
    at: { $gte: oneMinuteAgo },
  });

  if (!recentlyLogged) {
    await AuditLog.create({
      merchant: payment.merchant,
      payment: payment._id,
      event: "link_opened",
      detail: "Customer opened the recovery link.",
    });
  }

  res.json({ ok: true });
});

export default router;
