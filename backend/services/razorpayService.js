import Razorpay from "razorpay";
import crypto from "crypto";
import "dotenv/config";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Creates a real Razorpay Payment Link (test mode) for one payment.
 * NOTE: test mode caps you at 30 Payment Links per business — use this only
 * for the handful of live-demo payments, never for the bulk synthetic dataset.
 */
export async function createRecoveryPaymentLink({ payment, customer }) {
  const link = await razorpay.paymentLink.create({
    amount: payment.amount, // paise
    currency: "INR",
    description: `Recovery payment for order ${payment._id}`,
    customer: {
      name: customer.name,
      contact: customer.phone,
      email: customer.email || undefined,
    },
    notify: { sms: false, email: false }, // we send our own SMS via smsService
    reminder_enable: false,
    notes: { paymentId: String(payment._id) },
    callback_url: `${process.env.CLIENT_URL}/recovery/${payment._id}/complete`,
    callback_method: "get",
  });

  return { id: link.id, short_url: link.short_url };
}

/**
 * Verifies the X-Razorpay-Signature header on incoming webhooks.
 * Reject anything that doesn't match RAZORPAY_WEBHOOK_SECRET.
 */
export function verifyWebhookSignature(rawBody, signature) {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}
