// Deterministic, rule-based decisioning. This is the baseline the AI is measured against,
// and it's also the backend policy layer that the AI's recommendations must pass through.

export const MAX_RETRIES = 2;

/**
 * Given a payment (with .failureReason and .retryCount), decide an action using
 * simple rules only — no AI. Used both as (a) the baseline for the
 * "baseline vs AI-assisted" comparison, and (b) a fallback if the AI call fails.
 */
export function decideActionByRules(payment) {
  const { failureReason, retryCount } = payment;

  if (retryCount >= MAX_RETRIES) {
    return { action: "stop", reason: `Already retried ${retryCount} times — stopping per policy.` };
  }

  switch (failureReason) {
    case "bank_timeout":
    case "network_error":
      return { action: "retry", reason: "Transient failure — safe to auto-retry." };
    case "checkout_abandoned":
      return { action: "sms", reason: "Customer likely didn't complete checkout — nudge with SMS." };
    case "insufficient_funds":
      return { action: "sms", reason: "Needs the customer to act — send SMS with recovery link, don't auto-retry." };
    case "card_declined":
    case "otp_failed":
      return { action: "review", reason: "Needs manual/careful handling — flagged for review." };
    default:
      return { action: "sms", reason: "Unclear failure reason — default to a gentle SMS nudge." };
  }
}

/**
 * Backend policy check — the hard boundary the AI cannot cross, regardless of what
 * the LLM recommends. Returns the final action plus whether it was overridden.
 */
export function applyPolicy(payment, recommendedAction) {
  const { retryCount } = payment;

  if (recommendedAction === "retry" && retryCount >= MAX_RETRIES) {
    return {
      finalAction: "stop",
      wasOverridden: true,
      overrideReason: "max_retries_exceeded",
    };
  }

  // Add further hard rules here as needed (e.g. daily SMS caps, high-value customer escalation, etc.)

  return { finalAction: recommendedAction, wasOverridden: false, overrideReason: null };
}

/**
 * SYNTHETIC PAYMENTS ONLY. A synthetic payment has no real bank/customer behind
 * it, so nothing will ever call our webhook for it — without this, every
 * synthetic "sms"/"retry" action would sit at recovery_in_progress forever and
 * the dashboard would never show any successes. This simulates whether the
 * customer would have completed the payment, so metrics/funnel/baseline-vs-AI
 * numbers have something real to show. It is NEVER used for the real demo
 * payment (isSynthetic: false) — that one only resolves via an actual Razorpay
 * webhook, since it's a genuine payment.
 */
const SIMULATED_SUCCESS_PROBABILITY = {
  bank_timeout: 0.75,
  network_error: 0.7,
  checkout_abandoned: 0.4,
  insufficient_funds: 0.3,
  card_declined: 0.25,
  otp_failed: 0.35,
  unknown: 0.3,
};

export function simulateSyntheticOutcome(failureReason, action) {
  if (action === "stop" || action === "review") return false;
  const p = SIMULATED_SUCCESS_PROBABILITY[failureReason] ?? 0.3;
  return Math.random() < p;
}
