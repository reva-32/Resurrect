import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStatus, compare } from "../services/reconciliationService.js";

test("reconciliation normalizes equivalent captured and settled states", () => {
  assert.equal(normalizeStatus("captured"), "captured");
  assert.equal(normalizeStatus("settled"), "captured");
});

test("reconciliation detects amount mismatch before status mismatch", () => {
  const result = compare(
    { amount: 50000, paymentState: "captured" },
    { amount: 49000, status: "failed" }
  );
  assert.equal(result.result, "amount_mismatch");
});

test("reconciliation detects missing provider record", () => {
  const result = compare({ amount: 50000, paymentState: "captured" }, null);
  assert.equal(result.result, "missing_provider");
});

test("reconciliation detects status mismatch when amounts match", () => {
  const result = compare(
    { amount: 50000, paymentState: "captured" },
    { amount: 50000, status: "authorized" }
  );
  assert.equal(result.result, "status_mismatch");
});
