import test from "node:test";
import assert from "node:assert/strict";
import { canTransitionPayment, transitionPayment } from "../services/paymentStateMachine.js";

test("allows a normal payment flow", () => {
  const payment = { paymentState: "failed" };

  transitionPayment(payment, "processing");
  transitionPayment(payment, "captured");

  assert.equal(payment.paymentState, "captured");
});

test("rejects an invalid backwards transition", () => {
  assert.equal(canTransitionPayment("captured", "failed"), false);

  const payment = { paymentState: "captured" };
  assert.throws(
    () => transitionPayment(payment, "failed"),
    /Invalid payment transition: captured -> failed/
  );
});

test("allows a failed payment to be captured by a successful recovery link", () => {
  assert.equal(canTransitionPayment("failed", "captured"), true);
});
