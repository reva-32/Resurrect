import express from "express";
import Payment from "../models/Payment.js";
import RecoveryAttempt from "../models/RecoveryAttempt.js";
import AIDecision from "../models/AIDecision.js";
import AuditLog from "../models/AuditLog.js";
import { decideActionByRules, applyPolicy, simulateSyntheticOutcome } from "../services/recoveryEngine.js";
import { getAIDecision } from "../services/aiService.js";
import { sendRecoverySMS } from "../services/smsService.js";
import { createRecoveryPaymentLink } from "../services/razorpayService.js";

const router = express.Router();

// How many payments in a single "Start Recovery" run actually get a live
// Gemini call before the rest fall back to rules for that run only. This is
// a deliberate, visible-in-the-response cost control — not a silent lifetime
// cap. Configurable via GEMINI_MAX_CALLS_PER_RUN in .env; defaults generous
// enough to cover the whole sample dataset.
const AI_CALLS_PER_RUN = Number(process.env.GEMINI_MAX_CALLS_PER_RUN) || 50;

// Process ALL of the logged-in merchant's currently-failed payments through
// rules or AI (bulk demo action — "START RECOVERY" button). useAI=false
// forces the rule-engine baseline for every payment in this run.
router.post("/run", async (req, res) => {
  const useAI = req.body.useAI !== false;

  // Always process the real demo payment first. This makes the live Razorpay
  // path deterministic and prevents the synthetic dataset from consuming the
  // run before the merchant gets a usable demo link.
  const payments = await Payment.find({
    merchant: req.user._id,
    status: "failed",
  })
    .populate("customer")
    .sort({ isSynthetic: 1, createdAt: -1 });

  const aiBudget = { remaining: AI_CALLS_PER_RUN };

  const results = [];
  for (const payment of payments) {
    const isLiveDemo = payment.customer?.isDemoCustomer === true && !payment.isSynthetic;
    const result = await processOnePayment(
      payment,
      useAI,
      req.user._id,
      { createRealLink: isLiveDemo },
      aiBudget
    );
    results.push(result);
  }

  res.json({ processed: results.length, results, aiCallsUsed: AI_CALLS_PER_RUN - aiBudget.remaining });
});

// Process a single payment (used for the live/real demo customer, or a retry).
// Scoped by merchant so one merchant can't act on another merchant's payment.
router.post("/:paymentId/run", async (req, res) => {
  const useAI = req.body.useAI !== false;
  const payment = await Payment.findOne({ _id: req.params.paymentId, merchant: req.user._id }).populate("customer");
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  // A single-payment action gets one AI attempt if requested. If Gemini has
  // already reported quota exhaustion, aiService immediately uses rules.
  const aiBudget = { remaining: 1 };
  const result = await processOnePayment(
    payment,
    useAI,
    req.user._id,
    { createRealLink: !!req.body.createRealLink },
    aiBudget
  );
  res.json(result);
});

// Synthetic payments have no real bank behind them, so nothing will ever
// call our webhook for them. Rather than resolving instantly (which felt
// fake — a real recovery flow takes at least a few seconds of "processing"),
// we schedule the outcome a few seconds out. The dashboard polls, so numbers
// visibly tick up over time during a live demo instead of jumping all at once.
//
// NOTE: this is an in-memory setTimeout — fine for a demo process, but a
// restart before the delay elapses loses the pending resolution. A real
// deployment would use a persisted job queue instead.
function scheduleSimulatedResolution({ merchantId, paymentId, attemptId, failureReason, action }) {
  const delayMs = 3000 + Math.floor(Math.random() * 6000); // 3–9s

  setTimeout(async () => {
    try {
      const payment = await Payment.findOne({ _id: paymentId, merchant: merchantId });
      const attempt = await RecoveryAttempt.findOne({ _id: attemptId, merchant: merchantId });
      if (!payment || !attempt || attempt.outcome !== "pending") return; // already resolved/gone

      const succeeded = simulateSyntheticOutcome(failureReason, action);
      attempt.outcome = succeeded ? "success" : "failure";
      attempt.resolvedAt = new Date();
      await attempt.save();

      if (succeeded) {
        payment.status = "recovered";
        payment.recoveredAmount = payment.amount;
        payment.recoveredAt = new Date();
        await AuditLog.create({
          merchant: merchantId,
          payment: payment._id,
          event: "payment_recovered",
          detail: `Simulated ${action} recovery succeeded.`,
        });
      } else {
        // Back to "failed" so the next Start Recovery run can pick the next
        // action (another retry, an SMS, or stop once max retries is hit).
        payment.status = "failed";
      }
      await payment.save();
    } catch (err) {
      console.error("[recovery] simulated resolution failed:", err.message);
    }
  }, delayMs);
}

async function processOnePayment(payment, useAI, merchantId, opts = {}, aiBudget = { remaining: Infinity }) {
  const customer = payment.customer;

  // 1. Get a recommendation — AI or rules
  let recommendedAction, reasoning, smsMessage, decidedBy, aiMeta = null;
  if (useAI && aiBudget.remaining > 0) {
    aiBudget.remaining -= 1;
    const ai = await getAIDecision(payment, customer);
    recommendedAction = ai.recommendedAction;
    reasoning = ai.reasoning;
    smsMessage = ai.smsMessage;
    decidedBy = ai.model === "rules-fallback" ? "rules" : "ai";
    aiMeta = ai;
  } else if (useAI) {
    // AI was requested but this run's budget is used up — fall back to rules
    // for this payment, and say so explicitly rather than pretending it's AI.
    const rule = decideActionByRules(payment);
    recommendedAction = rule.action;
    reasoning = `[rules — this run's AI call budget was used up] ${rule.reason}`;
    decidedBy = "rules";
  } else {
    const rule = decideActionByRules(payment);
    recommendedAction = rule.action;
    reasoning = rule.reason;
    decidedBy = "rules";
  }

  // 2. Backend policy check — the AI (or rules) cannot bypass this
  let { finalAction, wasOverridden, overrideReason } = applyPolicy(payment, recommendedAction);

  // Explicit live-demo path: when the merchant clicks the real Razorpay-link
  // action, ensure the recovery action is link/SMS based even if the AI chose
  // retry/review. This does not affect bulk AI-vs-rules runs.
  if (opts.createRealLink && finalAction !== "sms" && finalAction !== "priority_sms") {
    finalAction = "sms";
    wasOverridden = true;
    overrideReason = "live_demo_requires_customer_payment_link";
  }

  if (decidedBy === "ai" || aiMeta) {
    await AIDecision.create({
      merchant: merchantId,
      payment: payment._id,
      recommendedAction,
      reasoning,
      finalAction,
      wasOverridden,
      overrideReason,
      model: aiMeta?.model,
      rawResponse: aiMeta?.rawResponse,
    });
  }

  await AuditLog.create({
    merchant: merchantId,
    payment: payment._id,
    event: wasOverridden ? "action_rejected" : "action_approved",
    detail: `${decidedBy === "ai" ? "AI" : "Rules"} recommended "${recommendedAction}"${
      wasOverridden ? ` — backend overrode to "${finalAction}" (${overrideReason})` : ""
    }. ${reasoning}`,
  });

  // 3. Execute the final action
  const attempt = await RecoveryAttempt.create({
    merchant: merchantId,
    payment: payment._id,
    customer: customer._id,
    action: finalAction,
    decidedBy,
    outcome: "pending",
  });

  if (finalAction === "stop") {
    payment.status = "stopped";
    await payment.save();
    await AuditLog.create({ merchant: merchantId, payment: payment._id, event: "recovery_stopped", detail: reasoning });
    return { paymentId: payment._id, action: finalAction, decidedBy, reasoning };
  }

  if (finalAction === "retry") {
    payment.retryCount += 1;
    payment.status = "recovery_in_progress";
    await payment.save();
    await AuditLog.create({ merchant: merchantId, payment: payment._id, event: "retry_attempted", detail: reasoning });

    // Real payments (the live demo customer) only resolve via a real
    // Razorpay webhook — never fabricated. Synthetic ones get a delayed
    // simulated outcome (see scheduleSimulatedResolution above).
    if (payment.isSynthetic) {
      scheduleSimulatedResolution({
        merchantId,
        paymentId: payment._id,
        attemptId: attempt._id,
        failureReason: payment.failureReason,
        action: finalAction,
      });
    }

    return { paymentId: payment._id, action: finalAction, decidedBy, reasoning, outcome: "pending" };
  }

  if (finalAction === "sms" || finalAction === "priority_sms") {
    payment.status = "recovery_in_progress";

    // The SMS always links to our branded status page, not straight to
    // Razorpay — that page shows the amount/merchant and links onward to the
    // real Razorpay checkout when one exists. One consistent customer entry
    // point for both mock and real payments.
    // The customer payment page is a public route in the same frontend app,
    // so one Vercel deployment is enough for both merchant and customer views.
    const recoveryLink = `${process.env.CLIENT_URL}/pay/${payment._id}`;
    payment.recoveryLink = recoveryLink;

    // Only create a REAL Razorpay Payment Link for demo/live payments — test
    // mode caps you at 30 links per business, so never do this for the bulk
    // synthetic set.
    if (opts.createRealLink) {
      const link = await createRecoveryPaymentLink({ payment, customer });
      payment.razorpay.paymentLinkId = link.id;
      payment.razorpay.paymentLinkUrl = link.short_url;
      payment.razorpay.isLive = true;
      payment.isSynthetic = false;
    }

    const message =
      smsMessage ||
      `Hi ${customer.name}, your payment of Rs.${(payment.amount / 100).toFixed(
        2
      )} couldn't go through. Retry securely here: [RECOVERY_LINK]`;

    if (opts.createRealLink && payment.razorpay?.paymentLinkId) {
      // Razorpay itself can send the Payment Link notification. No external
      // SMS provider is required for the live demo. Keep an audit/SMS log so
      // the merchant dashboard still shows that a customer notification was
      // dispatched, while the actual delivery is handled by Razorpay.
      const SMSLog = (await import("../models/SMSLog.js")).default;
      await SMSLog.create({
        merchant: merchantId,
        payment: payment._id,
        customer: customer._id,
        message: `Razorpay Payment Link notification for ${recoveryLink}`,
        recoveryLink,
        mode: "real",
        status: "sent",
        providerResponse: "Razorpay Payment Link notification (SMS handled by Razorpay)",
      });
    } else {
      await sendRecoverySMS({ merchant: merchantId, payment, customer, message, recoveryLink });
    }
    await AuditLog.create({
      merchant: merchantId,
      payment: payment._id,
      event: "sms_sent",
      detail: opts.createRealLink && payment.razorpay?.paymentLinkId
        ? `Razorpay sent the Payment Link notification. Customer recovery page: ${recoveryLink}`
        : `Mock SMS logged with link ${recoveryLink}`,
    });

    await payment.save();

    if (payment.isSynthetic) {
      scheduleSimulatedResolution({
        merchantId,
        paymentId: payment._id,
        attemptId: attempt._id,
        failureReason: payment.failureReason,
        action: finalAction,
      });
    }

    return { paymentId: payment._id, action: finalAction, decidedBy, reasoning, recoveryLink, outcome: "pending" };
  }

  // "review" — flagged for merchant attention. Still needs to resolve like
  // any other action, or a card_declined/otp_failed payment (which rules
  // always route here) would sit in the "failed" pool forever, getting
  // re-decided and re-logged on every future Start Recovery click without
  // ever counting toward the recovery rate in either direction.
  payment.status = "recovery_in_progress";
  await payment.save();

  if (payment.isSynthetic) {
    scheduleSimulatedResolution({
      merchantId,
      paymentId: payment._id,
      attemptId: attempt._id,
      failureReason: payment.failureReason,
      action: finalAction,
    });
  }

  return { paymentId: payment._id, action: finalAction, decidedBy, reasoning, outcome: "pending" };
}

export default router;
