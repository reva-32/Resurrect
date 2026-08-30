import express from "express";
import { verifyWebhookSignature } from "../services/razorpayService.js";
import Payment from "../models/Payment.js";
import RecoveryAttempt from "../models/RecoveryAttempt.js";
import AuditLog from "../models/AuditLog.js";

const router = express.Router();

// Razorpay needs the RAW body to verify the signature, so this route uses express.raw()
// instead of the global express.json() (see server.js mount order).
router.post("/razorpay", express.raw({ type: "*/*" }), async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const rawBody = req.body; // Buffer, because of express.raw()

  if (!verifyWebhookSignature(rawBody, signature)) {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  const event = JSON.parse(rawBody.toString());

  try {
    if (event.event === "payment_link.paid" || event.event === "payment.captured") {
      const entity = event.payload.payment_link?.entity || event.payload.payment.entity;
      const paymentLinkId = entity.id?.startsWith("plink_") ? entity.id : entity.payment_link_id;

      const payment = await Payment.findOne({ "razorpay.paymentLinkId": paymentLinkId });
      if (payment && payment.status !== "recovered") {
        payment.status = "recovered";
        payment.recoveredAmount = payment.amount;
        payment.recoveredAt = new Date();
        payment.razorpay.paymentId = event.payload.payment?.entity?.id;
        await payment.save();

        await RecoveryAttempt.updateMany(
          { payment: payment._id, outcome: "pending" },
          { outcome: "success", resolvedAt: new Date() }
        );

        await AuditLog.create({
          payment: payment._id,
          event: "payment_recovered",
          detail: `Payment recovered via Razorpay webhook (${event.event})`,
          metadata: { razorpayPaymentId: payment.razorpay.paymentId },
        });
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("[webhook] processing error:", err.message);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
