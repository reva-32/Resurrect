# MongoDB Schema

Seven collections. `User` is the merchant account; everything else keys off `Payment`.

## User
| field | type | notes |
|---|---|---|
| businessName | String | |
| name | String | merchant contact name |
| email | String | unique, used for login |
| passwordHash | String | bcrypt hash, never the plain password |

## Customer
_Also has `merchant` (ObjectId → User) — every collection below except `User` does._

| field | type | notes |
|---|---|---|
| name | String | |
| phone | String | E.164, e.g. +91XXXXXXXXXX |
| email | String | optional |
| isDemoCustomer | Boolean | true only for the one real demo customer (your phone) |
| successfulPaymentsCount | Number | used as AI context ("frequent customer") |
| lifetimeValue | Number | paise |

## Payment
| field | type | notes |
|---|---|---|
| customer | ObjectId → Customer | |
| amount | Number | paise |
| status | enum | failed / recovery_in_progress / recovered / stopped |
| failureReason | enum | bank_timeout, insufficient_funds, checkout_abandoned, card_declined, network_error, otp_failed, unknown |
| razorpay.paymentLinkId / paymentLinkUrl / paymentId / isLive | | only populated for the real demo payment(s) |
| retryCount | Number | |
| recoveredAmount | Number | paise |
| recoveryLink | String | the customer-app URL sent via SMS — points at CUSTOMER_APP_URL, not the merchant app |
| isSynthetic | Boolean | false only for the real demo case |

## RecoveryAttempt
One row per action taken on a payment. `decidedBy: "rules" | "ai"` records which
engine actually made the call, kept for audit purposes.

## AIDecision
What the LLM recommended, its reasoning, and what the backend actually allowed
(`finalAction`, `wasOverridden`, `overrideReason`). This is your "AI doesn't touch
money directly" proof point.

## SMSLog
Every SMS attempt, `mode: "mock" | "real"`. Mock mode logs the message instead of
sending — controlled by `SMS_MOCK_MODE` in backend/.env, independent of DLT status.

## AuditLog
Append-only event log per payment (payment_failed, ai_decision_made, action_approved,
action_rejected, sms_sent, retry_attempted, payment_recovered, recovery_stopped).
This is what renders in the judge-facing audit trail on each payment's detail view.
