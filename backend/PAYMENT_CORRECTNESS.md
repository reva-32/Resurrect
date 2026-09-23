# Payment Correctness — Checkpoint 1

## What changed

Resurrect now separates two ideas that were previously mixed together:

- `status` = recovery workflow (`failed`, `recovery_in_progress`, `recovered`, `stopped`)
- `paymentState` = provider/payment lifecycle (`failed`, `processing`, `authorized`, `captured`, `settled`, `refunded`, `disputed`)

A small state-machine service controls `paymentState` transitions.

## Idempotent webhooks

Razorpay webhook deliveries include an event ID in `x-razorpay-event-id`.
Resurrect stores each event in `WebhookEvent` with a unique database index.

If the same event is delivered again, the existing event is detected and the
payment logic is not executed again.

## Interview-level explanation

**Why state machine?** It prevents impossible payment states such as moving a
captured payment back to failed through normal application logic.

**Why idempotency?** Providers can retry webhook delivery. Processing the same
event more than once must not duplicate business effects.

**Why a separate `paymentState`?** Recovery workflow state and provider payment
state are different concepts. A payment can be `captured` while its recovery
workflow is `recovered`.
