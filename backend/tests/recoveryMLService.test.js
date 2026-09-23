import test from "node:test";
import assert from "node:assert/strict";

function sigmoid(x) {
  return 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, x))));
}

test("ML probability stays between 0 and 1", () => {
  const p = sigmoid(1.2);
  assert.ok(p > 0 && p < 1);
});

test("higher positive signal produces higher logistic probability", () => {
  const low = sigmoid(-1);
  const high = sigmoid(1);
  assert.ok(high > low);
});
