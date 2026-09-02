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

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  console.log(`[webhook] received ${event.event || "unknown_event"}`);

  try {
    if (event.event === "payment_link.paid" || event.event === "payment.captured") {
      const paymentLinkEntity = event.payload?.payment_link?.entity;
      const paymentEntity = event.payload?.payment?.entity;
      const paymentLinkId =
        paymentLinkEntity?.id ||
        paymentEntity?.payment_link_id ||
        paymentEntity?.payment_link?.id;
      const internalPaymentId =
        paymentLinkEntity?.notes?.paymentId ||
        paymentLinkEntity?.notes?.internal_payment_id ||
        paymentLinkEntity?.reference_id;

      let payment = null;
      if (paymentLinkId) {
        payment = await Payment.findOne({ "razorpay.paymentLinkId": paymentLinkId });
      }
      if (!payment && internalPaymentId) {
        payment = await Payment.findById(internalPaymentId);
      }

      if (!payment) {
        console.warn("[webhook] no matching payment found", { paymentLinkId, internalPaymentId });
        return res.status(200).json({ received: true, matched: false });
      }

      console.log(`[webhook] matched payment ${payment._id}`);

      if (payment.status !== "recovered") {
        payment.status = "recovered";
        payment.recoveredAmount = Number(
          paymentEntity?.amount || paymentLinkEntity?.amount_paid || payment.amount
        );
        payment.recoveredAt = new Date();
        if (paymentEntity?.id) {
          payment.razorpay.paymentId = paymentEntity.id;
        }
        await payment.save();

        await RecoveryAttempt.updateMany(
          { payment: payment._id, outcome: "pending" },
          { outcome: "success", resolvedAt: new Date() }
        );

        try {
          await AuditLog.create({
            merchant: payment.merchant,
            payment: payment._id,
            event: "payment_recovered",
            detail: `Payment recovered via Razorpay webhook (${event.event})`,
            metadata: {
              razorpayPaymentId: payment.razorpay.paymentId,
              event: event.event,
            },
          });
        } catch (auditErr) {
          console.error("[webhook] audit log failed after recovery:", auditErr.message);
        }
      }
    }

    console.log(`[webhook] processed ${event.event || "unknown_event"}`);
    res.json({ received: true });
  } catch (err) {
    console.error("[webhook] processing error:", err.message);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
