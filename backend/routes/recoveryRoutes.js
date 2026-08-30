import express from "express";
import Payment from "../models/Payment.js";
import Customer from "../models/Customer.js";
import RecoveryAttempt from "../models/RecoveryAttempt.js";
import AIDecision from "../models/AIDecision.js";
import AuditLog from "../models/AuditLog.js";
import { decideActionByRules, applyPolicy, simulateSyntheticOutcome } from "../services/recoveryEngine.js";
import { getAIDecision } from "../services/aiService.js";
import { sendRecoverySMS } from "../services/smsService.js";
import { createRecoveryPaymentLink } from "../services/razorpayService.js";

const router = express.Router();

// Process ALL currently-failed payments through rules or AI (bulk demo action —
// "START RECOVERY" button). useAI=false forces the rule-engine baseline.
router.post("/run", async (req, res) => {
  const useAI = req.body.useAI !== false;
  const payments = await Payment.find({ status: "failed" }).populate("customer");

  const results = [];
  for (const payment of payments) {
    const result = await processOnePayment(payment, useAI);
    results.push(result);
  }

  res.json({ processed: results.length, results });
});

// Process a single payment (used for the live/real demo customer, or a retry)
router.post("/:paymentId/run", async (req, res) => {
  const useAI = req.body.useAI !== false;
  const payment = await Payment.findById(req.params.paymentId).populate("customer");
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  const result = await processOnePayment(payment, useAI, { createRealLink: !!req.body.createRealLink });
  res.json(result);
});

async function processOnePayment(payment, useAI, opts = {}) {
  const customer = payment.customer;

  // 1. Get a recommendation — AI or rules
  let recommendedAction, reasoning, smsMessage, decidedBy, aiMeta = null;
  if (useAI) {
    const ai = await getAIDecision(payment, customer);
    recommendedAction = ai.recommendedAction;
    reasoning = ai.reasoning;
    smsMessage = ai.smsMessage;
    decidedBy = ai.model === "rules-fallback" ? "rules" : "ai";
    aiMeta = ai;
  } else {
    const rule = decideActionByRules(payment);
    recommendedAction = rule.action;
    reasoning = rule.reason;
    decidedBy = "rules";
  }

  // 2. Backend policy check — the AI (or rules) cannot bypass this
  const { finalAction, wasOverridden, overrideReason } = applyPolicy(payment, recommendedAction);

  if (decidedBy === "ai" || aiMeta) {
    await AIDecision.create({
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
    payment: payment._id,
    event: wasOverridden ? "action_rejected" : "action_approved",
    detail: `${decidedBy === "ai" ? "AI" : "Rules"} recommended "${recommendedAction}"${
      wasOverridden ? ` — backend overrode to "${finalAction}" (${overrideReason})` : ""
    }. ${reasoning}`,
  });

  // 3. Execute the final action
  const attempt = await RecoveryAttempt.create({
    payment: payment._id,
    customer: customer._id,
    action: finalAction,
    decidedBy,
    outcome: "pending",
  });

  if (finalAction === "stop") {
    payment.status = "stopped";
    await payment.save();
    await AuditLog.create({ payment: payment._id, event: "recovery_stopped", detail: reasoning });
    return { paymentId: payment._id, action: finalAction, decidedBy, reasoning };
  }

  if (finalAction === "retry") {
    payment.retryCount += 1;
    payment.status = "recovery_in_progress";
    await AuditLog.create({ payment: payment._id, event: "retry_attempted", detail: reasoning });

    // Real payments (the live demo customer) only resolve via a real Razorpay
    // webhook — we never fabricate an outcome for real money. Synthetic
    // payments have no real bank behind them, so we simulate whether the
    // retry would have succeeded, otherwise they'd sit "in progress" forever.
    if (payment.isSynthetic) {
      const succeeded = simulateSyntheticOutcome(payment.failureReason, finalAction);
      attempt.outcome = succeeded ? "success" : "failure";
      attempt.resolvedAt = new Date();
      await attempt.save();

      if (succeeded) {
        payment.status = "recovered";
        payment.recoveredAmount = payment.amount;
        payment.recoveredAt = new Date();
        await AuditLog.create({ payment: payment._id, event: "payment_recovered", detail: "Simulated retry succeeded." });
      } else {
        // Goes back to "failed" so the next Start Recovery run can decide the
        // next action (another retry, an SMS, or stop once max retries is hit).
        payment.status = "failed";
      }
    }

    await payment.save();
    return { paymentId: payment._id, action: finalAction, decidedBy, reasoning, outcome: attempt.outcome };
  }

  if (finalAction === "sms" || finalAction === "priority_sms") {
    payment.status = "recovery_in_progress";

    // The SMS always links to our branded status page, not straight to
    // Razorpay — that page shows the amount/merchant and links onward to the
    // real Razorpay checkout when one exists. Keeps one consistent customer
    // entry point for both mock and real payments.
    const recoveryLink = `${process.env.CLIENT_URL}/pay/${payment._id}`;

    // Only create a REAL Razorpay Payment Link for demo/live payments — test mode
    // caps you at 30 links per business, so never do this for the bulk synthetic set.
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

    await sendRecoverySMS({ payment, customer, message, recoveryLink });
    await AuditLog.create({ payment: payment._id, event: "sms_sent", detail: `SMS sent with link ${recoveryLink}` });

    // Same reasoning as the retry branch above: only simulate for synthetic
    // payments. The real demo payment waits for an actual webhook.
    if (payment.isSynthetic) {
      const succeeded = simulateSyntheticOutcome(payment.failureReason, finalAction);
      attempt.outcome = succeeded ? "success" : "failure";
      attempt.resolvedAt = new Date();
      await attempt.save();

      if (succeeded) {
        payment.status = "recovered";
        payment.recoveredAmount = payment.amount;
        payment.recoveredAt = new Date();
        await AuditLog.create({ payment: payment._id, event: "payment_recovered", detail: "Simulated SMS recovery succeeded." });
      } else {
        payment.status = "failed";
      }
    }

    await payment.save();
    return { paymentId: payment._id, action: finalAction, decidedBy, reasoning, recoveryLink, outcome: attempt.outcome };
  }

  // "review" — leave status as-is, just log it
  await payment.save();
  return { paymentId: payment._id, action: finalAction, decidedBy, reasoning };
}

export default router;
