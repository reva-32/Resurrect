# Resurrect — Checkpoint 3: B2B / MSME Receivables

Checkpoint 3 extends Resurrect from failed-payment recovery into a focused B2B receivables workflow.

## What was added

### Backend
- `BusinessCustomer` model for B2B customers.
- `Invoice` model with due dates, outstanding amount, payment status and recovery action.
- `ReceivableAuditLog` for invoice lifecycle and recovery events.
- `/api/receivables` authenticated API:
  - `GET /summary`
  - `GET /invoices`
  - `POST /customers`
  - `POST /invoices`
  - `POST /invoices/:id/recover`
  - `POST /invoices/:id/payment`
  - `POST /seed`
- Automatic invoice status refresh:
  - `due`
  - `due_soon`
  - `overdue`
  - `partially_paid`
  - `paid`
- A deterministic receivables recovery policy based on overdue age and outstanding amount.
- Demo invoice seeding that is isolated per merchant.

### Merchant profile
`businessType` is now:
- `retail`
- `b2b`
- `hybrid`

New merchants select it during signup. Existing merchants default to the hybrid experience until they choose another value in Settings.

### Frontend
- New `/receivables` merchant page.
- Receivables summary cards.
- Invoice table with business, amount, due date, status, risk score and recommended action.
- Record recovery action.
- Record partial/full payment.
- Load demo B2B invoices.
- Business type selector in Settings.
- Receivables navigation for B2B/Hybrid merchants.

## Important boundary

The invoice workflow is intentionally separate from the payment state machine.

A B2B invoice is a receivable. A Razorpay payment is a transaction. The existing payment correctness, webhook idempotency and ML recovery work remain unchanged.

## Demo flow

```text
Business customer
      ↓
Invoice
      ↓
Due date
      ↓
Overdue
      ↓
Risk + deterministic policy
      ↓
Reminder / priority follow-up / review
      ↓
Payment recorded
      ↓
Paid / partially paid
      ↓
Audit log
```

The demo recovery button records the recommended action; it does not send a real B2B message.

## Validation

Existing Checkpoint 1 + Checkpoint 2 automated tests still pass:
- payment state machine: 3 tests
- recovery ML service: 2 tests
- total: 5 passing

Frontend build should be run locally before deployment with:

```bash
cd frontend
npm install
npm run build
```
