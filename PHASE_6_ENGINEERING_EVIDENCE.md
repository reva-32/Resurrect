# Resurrect — Engineering Evidence & Correctness Notes

## Data trust
- Verified recovered revenue counts only `isSynthetic: false` / `dataSource: razorpay_test` payments.
- Synthetic recoveries are reported separately and never mixed into verified revenue.
- The dashboard labels this distinction directly.

## Webhook hardening
- The webhook verifies that an internal payment exists **before** reading payment fields or creating a provider transaction.
- Razorpay event IDs remain the idempotency key.
- Refund and dispute webhook paths stop recovery and move the payment lifecycle to `refunded` / `disputed`.

## B2B partial payments
- Invoice creation rejects `amountPaid > amount`.
- A recorded payment cannot exceed the remaining balance.
- Status remains `partially_paid` until the full invoice amount is paid.

## Reconciliation evidence
The provider-demo loader intentionally creates controlled cases: matched, amount mismatch, status mismatch, missing provider, and missing internal. These are simulated test cases, not claims about real merchant discrepancies.

## Rules vs ML
Run `npm run benchmark:recovery` after loading at least 200 synthetic training records. The output compares a deterministic recovery eligibility baseline with the logistic ML benchmark on a held-out synthetic set. Results must be described as a synthetic validation experiment; they are not evidence of real-world recovery lift.

## Incident note
A webhook edge case was identified where an unmatched payment could be dereferenced before the null check. The fix moves payment existence validation before provider-transaction persistence.

## Scope
Rate limiting, health checks, Docker packaging, payment state transitions, reconciliation, B2B receivables, and audit logging remain part of the project. No ledger/microservice/Kafka layer was added because the current evidence and correctness work provide more useful engineering depth.
