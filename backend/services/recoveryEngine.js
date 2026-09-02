// Deterministic, rule-based decisioning — also the backend policy layer that
// the AI's recommendations must pass through.

export const MAX_RETRIES = 2;

/**
 * Given a payment (with .failureReason and .retryCount), decide an action using
 * simple rules only — no AI. Used as a fallback whenever the AI call fails or
 * is skipped for this run.
 */
const FAILURE_REASON_LABELS = {
  bank_timeout: "the bank timed out during authorization",
  network_error: "a network error interrupted the payment",
  checkout_abandoned: "the customer left checkout without completing payment",
  insufficient_funds: "the customer's account had insufficient funds",
  card_declined: "the customer's bank declined the card",
  otp_failed: "OTP verification failed",
  unknown: "the failure reason wasn't reported by the bank",
};

export function decideActionByRules(payment) {
  const { failureReason, retryCount } = payment;
  const rupees = `₹${((payment.amount || 0) / 100).toFixed(0)}`;
  const why = FAILURE_REASON_LABELS[failureReason] || FAILURE_REASON_LABELS.unknown;

  if (retryCount >= MAX_RETRIES) {
    return {
      action: "stop",
      reason: `Already retried this ${rupees} payment ${retryCount} times with no success — retrying again is unlikely to help, so it's stopped per policy rather than annoying the customer further.`,
    };
  }

  switch (failureReason) {
    case "bank_timeout":
    case "network_error":
      return {
        action: "retry",
        reason: `${why[0].toUpperCase()}${why.slice(1)} — this is on our/the bank's side, not the customer's, so it's safe to automatically retry the same ${rupees} charge.`,
      };
    case "checkout_abandoned":
      return {
        action: "sms",
        reason: `${why[0].toUpperCase()}${why.slice(1)} — retrying won't help since nothing was actually charged, so an SMS nudge with a payment link is sent instead.`,
      };
    case "insufficient_funds":
      return {
        action: "sms",
        reason: `${why[0].toUpperCase()}${why.slice(1)} at the time of the ${rupees} charge — only the customer can fix that, so an SMS is sent rather than auto-retrying the same failed charge.`,
      };
    case "card_declined":
    case "otp_failed":
      return {
        action: "review",
        reason: `${why[0].toUpperCase()}${why.slice(1)} — this can mean a blocked card or fraud check, which needs a human's judgment rather than an automatic retry or message.`,
      };
    default:
      return {
        action: "sms",
        reason: `${why[0].toUpperCase()}${why.slice(1)} for this ${rupees} payment, so a gentle SMS nudge is sent as the safest default while the cause is unclear.`,
      };
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
 * SYNTHETIC PAYMENTS ONLY. A synthetic payment has no real bank behind it, so
 * nothing will ever call our webhook for it — this simulates whether the
 * customer would have completed the payment.
 *
 * Success probability depends on BOTH the failure reason AND the action taken
 * — not just the failure reason. This rewards matching the action to the
 * failure (e.g. retry for a transient bank timeout, SMS/priority_sms for a
 * customer who needs to act), so the simulated outcomes are at least
 * internally consistent with "the right call for this failure recovers more
 * often" rather than being pure noise keyed off failure reason alone.
 */
const SIMULATED_SUCCESS_PROBABILITY = {
  bank_timeout: { retry: 0.8, priority_sms: 0.55, sms: 0.5, review: 0.2 },
  network_error: { retry: 0.78, priority_sms: 0.5, sms: 0.45, review: 0.2 },
  checkout_abandoned: { priority_sms: 0.55, sms: 0.45, retry: 0.25, review: 0.2 },
  insufficient_funds: { priority_sms: 0.4, sms: 0.35, review: 0.15, retry: 0.1 },
  card_declined: { review: 0.3, priority_sms: 0.25, sms: 0.2, retry: 0.05 },
  otp_failed: { priority_sms: 0.45, sms: 0.4, review: 0.3, retry: 0.1 },
  unknown: { priority_sms: 0.35, sms: 0.3, review: 0.2, retry: 0.15 },
};

export function simulateSyntheticOutcome(failureReason, action) {
  if (action === "stop") return false;
  const p = SIMULATED_SUCCESS_PROBABILITY[failureReason]?.[action] ?? 0.2;
  return Math.random() < p;
}
