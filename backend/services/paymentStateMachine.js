// Payment provider lifecycle state machine.
// Recovery workflow status remains in Payment.status for backwards compatibility.

export const PAYMENT_STATES = [
  "failed",
  "processing",
  "authorized",
  "captured",
  "settled",
  "refunded",
  "disputed",
];

const TRANSITIONS = {
  failed: ["processing", "captured"],
  processing: ["failed", "authorized", "captured"],
  authorized: ["captured", "failed"],
  captured: ["settled", "refunded", "disputed"],
  settled: ["refunded", "disputed"],
  refunded: [],
  disputed: ["captured", "refunded"],
};

export function canTransitionPayment(from, to) {
  if (!from || !to) return false;
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionPayment(payment, nextState) {
  const currentState = payment.paymentState || "failed";

  if (!canTransitionPayment(currentState, nextState)) {
    const error = new Error(`Invalid payment transition: ${currentState} -> ${nextState}`);
    error.code = "INVALID_PAYMENT_TRANSITION";
    throw error;
  }

  payment.paymentState = nextState;
  return payment;
}
