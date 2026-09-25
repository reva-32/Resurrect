# Checkpoint 4 — Reconciliation

Resurrect now includes a small fintech-operations reconciliation workflow.

## What it does

The reconciliation engine compares Resurrect's internal payment record with a provider transaction record and classifies the result as:

- `matched`
- `amount_mismatch`
- `status_mismatch`
- `missing_provider`
- `missing_internal`

## Provider data sources

- `razorpay_test`: created from verified Razorpay webhook events when a real test transaction is processed.
- `demo_provider_snapshot`: explicit demo data used to demonstrate reconciliation without claiming a live provider connection.

The demo provider loader intentionally creates one amount difference and one status difference so the reconciliation page can demonstrate exception handling.

## API

Authenticated merchant routes:

- `GET /api/reconciliation/summary`
- `GET /api/reconciliation/results`
- `POST /api/reconciliation/run`
- `POST /api/reconciliation/seed`

## Demo flow

1. Load the normal payment demo data from the Dashboard if the account is empty.
2. Open **Reconciliation** from the Dashboard.
3. Click **Load provider demo**.
4. Click **Run reconciliation**.
5. Show matched and mismatch rows.

## Important positioning

This is a reconciliation workflow, not a production accounting ledger. The demo snapshot is clearly labeled as demo data, while real Razorpay test transactions are recorded only from verified webhooks.
