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
    notify: {
      sms: process.env.RAZORPAY_NOTIFY_SMS !== "false",
      email: process.env.RAZORPAY_NOTIFY_EMAIL === "true",
    },
    reminder_enable: false,
    // Correlation metadata used by the webhook to map the Razorpay payment
    // back to our MongoDB payment. Keep both fields for payload compatibility.
    reference_id: String(payment._id),
    notes: { paymentId: String(payment._id) },
    callback_url: `${process.env.CLIENT_URL}/pay/${payment._id}`,
    callback_method: "get",
  });

  return { id: link.id, short_url: link.short_url };
}

/**
 * Verifies the X-Razorpay-Signature header on incoming webhooks.
 * Reject anything that doesn't match RAZORPAY_WEBHOOK_SECRET.
 */
export function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature || !Buffer.isBuffer(rawBody)) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(String(signature), "utf8");
  return (
    expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}
