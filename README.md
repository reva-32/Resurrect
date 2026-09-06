# Resurrect — AI Revenue Recovery Engine

> **Don't just detect lost revenue. Decide how to recover it, execute safely, verify the payment, and prove the money came back.**

Resurrect is an **AI-assisted revenue recovery engine** that helps merchants recover revenue slipping through failed payments.

It combines **AI decisioning, deterministic safety controls, Razorpay Payment Links, verified webhooks, recovery analytics, bilingual insights, and a complete audit trail** into one closed-loop recovery system.

## The Core Loop

```text
Failed Payments
      ↓
Detect → Diagnose → Prioritize
      ↓
AI recommends the right action
      ↓
Deterministic policy validates it
      ↓
Recovery via Razorpay
      ↓
Verified Webhook
      ↓
Recovered Revenue + Insights + Audit Trail
```

## Why Resurrect?

* **AI decides, not just detects** — every failed payment is analyzed for the appropriate intervention: retry, SMS/payment link, escalate, or stop.
* **No blanket reminders** — decisions are based on the individual payment, customer history, failure reason, and previous attempts.
* **AI never touches money directly** — recommendations pass through deterministic backend policies with retry limits and stopping rules.
* **Recovery is outcome-based** — sending an SMS or creating a payment link is not counted as recovery. Revenue is marked recovered only after verified Razorpay payment confirmation.
* **Revenue-first prioritization** — failed payments are ranked using amount at risk, customer history, failure reason, retry history, repeated failures, and recency.
* **End-to-end recovery funnel** — failed payment → diagnosis → recovery action → customer payment → verified recovery.
* **Actionable analytics** — charts explain where revenue is leaking, whether recovery is improving, and which strategies are working.
* **Bilingual insights** — recovery insights and explanations are available in **English and Hindi**.
* **Full audit trail** — AI recommendations, backend decisions, recovery attempts, and outcomes are logged per payment.
* **PCI-safe by design** — card numbers and bank credentials stay inside Razorpay Checkout.
* **Resilient by design** — deterministic recovery rules keep the workflow running when Gemini is unavailable or rate-limited.

## Key Features

### 🧠 AI-Assisted Recovery

Resurrect uses Gemini to provide contextual recovery recommendations instead of applying one recovery action to every failure.

* Analyzes payment context and failure reason.
* Recommends **retry, SMS/payment link, escalate, or stop**.
* Uses customer and recovery history as part of the decision context.
* Passes AI recommendations through deterministic backend policies.
* Enforces retry limits and stopping rules outside the AI.
* Falls back to deterministic recovery rules when Gemini is unavailable or rate-limited.
* Limits Gemini calls per run to control API usage.

### 🎯 Smart Prioritization

A failed-payment list is only useful if the merchant knows **where to start**.

Resurrect ranks payments using:

* Amount at risk
* Customer payment history
* Failure reason
* Previous recovery attempts
* Repeated failures
* Recency

This turns a large pool of failed payments into an actionable:

> **“Recover these first” queue.**

### 📊 Insights & Recovery Analytics

Resurrect goes beyond basic dashboard metrics by connecting **transaction behavior with actual revenue impact**.

#### Failure Breakdown

Shows how failed payments are distributed across failure reasons while also showing the **revenue exposed by each category**.

This helps distinguish between:

* A failure reason with many low-value transactions
* A failure reason with fewer transactions but much higher revenue at risk

Merchants can therefore prioritize based on **financial impact**, not just transaction count.

#### Recovery Trend

Tracks recovery performance over time to show whether recovery efforts are actually improving.

Instead of asking only:

> “How much have we recovered?”

the merchant can see:

> “Is our recovery performance improving over time?”

#### Strategy Performance

Compares recovery outcomes across different strategies.

Resurrect applies a **minimum sample-size guard**, preventing the system from declaring a strategy “best” simply because it performed well on a tiny number of attempts.

#### Priority & Failure Insights

The Insights layer converts payment data into actionable explanations:

* What is causing the most failures?
* Where is the most revenue exposed?
* Which payments deserve attention first?
* What recovery action makes sense?
* Which strategies are producing successful outcomes?

#### Bilingual Insights

Recovery insights and explanations are available in:

**English 🇬🇧 | Hindi 🇮🇳**

Together, the charts and insights provide a complete view of:

> **Where is revenue leaking?
> Is recovery improving?
> Which strategy is working?
> What should the merchant focus on next?**

### 💳 Razorpay-Powered Recovery

* Razorpay Test Mode Payment Links for the live demonstration.
* Razorpay notification SMS for the live Payment Link.
* Customer-facing payment-status page.
* Secure Razorpay Checkout handles payment details.
* Verified Razorpay webhook confirmation.
* Payment state changes to `recovered` only after valid payment confirmation.

### 💬 Recovery AI Assistant

The dashboard provides a conversational assistant for questions such as:

* “Who should I recover first?”
* “Why are these payments failing?”
* “What should I do next?”

The assistant is grounded in backend-generated payment and recovery context, allowing merchants to interact with the recovery intelligence conversationally.

### 🔎 Full Audit Trail

Every important recovery step is traceable through:

* AI decisions
* Approved/rejected actions
* Recovery attempts
* SMS logs
* Payment recovery events
* Audit logs

This provides transparency into **what the AI recommended, what the backend allowed, and what ultimately happened**.

### 🔐 Security & PCI-Safe Design

* Card numbers and bank credentials are never handled by Resurrect.
* Razorpay Checkout handles sensitive payment information.
* Razorpay webhook signatures are verified before processing payment events.
* Secrets remain on the backend.
* JWT authentication protects merchant APIs.
* Passwords are bcrypt-hashed.
* API/auth rate limiting is enabled.
* Helmet security headers are enabled.

## Tech Stack

| Layer          | Technology                        |
| -------------- | --------------------------------- |
| Frontend       | React, Vite                       |
| Backend        | Node.js, Express                  |
| Database       | MongoDB, Mongoose                 |
| AI             | Gemini                            |
| Payments       | Razorpay Payment Links + Webhooks |
| Authentication | JWT + bcrypt                      |
| Deployment     | Vercel + Render                   |
| Demo Data      | Synthetic failed-payment dataset  |

## Architecture

```text
                         ┌─────────────────────┐
                         │   Merchant Dashboard │
                         │     React + Vite     │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Express Backend   │
                         │ Recovery + Policies  │
                         └───────┬───────┬──────┘
                                 │       │
                    ┌────────────┘       └─────────────┐
                    ▼                                  ▼
             ┌─────────────┐                    ┌─────────────┐
             │   Gemini AI  │                    │   MongoDB   │
             │ Recommendation│                   │ State + Logs│
             └──────┬──────┘                    └─────────────┘
                    │
                    ▼
           ┌─────────────────────┐
           │ Deterministic Policy│
           │ Limits + Stop Rules │
           └──────────┬──────────┘
                      │
                      ▼
              ┌──────────────────┐
              │ Razorpay Payment │
              │      Link        │
              └────────┬─────────┘
                       │
                       ▼
                    Customer
                       │
                       ▼
               Razorpay Webhook
                       │
                       ▼
              Verified Recovery State
                       │
                       ▼
                Dashboard Metrics
```

## Demo

The project uses two complementary modes.

### Synthetic Batch

Demonstrates recovery intelligence across multiple failed payments:

* Failure analysis
* Revenue at risk
* Smart prioritization
* Recovery actions
* Strategy performance
* Recovery trends
* Bilingual insights
* AI-assisted recommendations

### Dedicated Live Demo

A separate non-synthetic demo payment demonstrates the actual Razorpay recovery loop:

```text
Merchant Dashboard
      ↓
Run Recovery
      ↓
Razorpay Test Mode Payment Link
      ↓
Customer SMS → Phone
      ↓
Customer Payment
      ↓
Razorpay Webhook
      ↓
Signature Verification
      ↓
Payment → Recovered
      ↓
Dashboard + Customer Status Updated
```

> **Test Mode:** the live demo uses Razorpay Test Mode, so no real money is transferred.

> **Important:** Creating, opening, or sending a Payment Link does **not** count as recovered revenue. Recovery is confirmed only after the verified Razorpay webhook.

## Manual Guide

A **merchant manual guide is available within the dashboard** for newly registered merchants.

It briefly explains how to get started, understand revenue at risk, run recovery workflows, interpret insights and charts, and use the AI Assistant.

## Live Demo

🚀 **Deployed Application:** https://resurrect-one.vercel.app/

The complete application is deployed and can be tested through the live frontend.

> **Demo Note:** The recovery payment flow uses Razorpay Test Mode, so no real money is involved.

## Deployment

The application is deployed using:

* **Vercel** — React frontend
* **Render** — Express backend
* **MongoDB Atlas** — database
* **Razorpay Test Mode** — Payment Links + webhooks

Razorpay webhooks require a publicly reachable backend endpoint.

```text
https://<your-render-service>.onrender.com/api/webhooks/razorpay
```

The backend verifies `X-Razorpay-Signature` before processing payment events.

Supported recovery events include:

```text
payment_link.paid
payment.captured
```

## API Overview

The backend exposes APIs for authentication, payment management, recovery execution, dashboard analytics, and Razorpay webhook processing.

### Key Endpoints

```text
POST /api/auth/signup
POST /api/auth/login

GET  /api/payments
POST /api/recovery/run
POST /api/recovery/:paymentId/run

GET  /api/dashboard/metrics
POST /api/dashboard/seed

POST /api/webhooks/razorpay
GET  /api/public/payments/:id
```

Merchant endpoints are protected using JWT authentication where required.

## Security

* Passwords are bcrypt-hashed.
* JWT protects merchant APIs.
* Helmet security headers are enabled.
* API/auth rate limiting is enabled.
* Razorpay webhook signatures are verified against the raw request body.
* Razorpay, Gemini, JWT, MongoDB, and webhook secrets are stored in environment variables.
* Card numbers and bank credentials are never handled by the application server.
* Public payment-status routes expose only the information required for the customer payment experience.
* The live demo uses Razorpay Test Mode and does not collect real money.

### Never Commit Secrets

```text
backend/.env
frontend/.env
frontend/.env.local
API keys
Razorpay secrets
Webhook secrets
JWT secrets
Gemini API keys
MongoDB credentials
Personal phone numbers
```

If a real credential is ever committed to a public repository, rotate/revoke it before deployment.

## Project Structure

```text
Resurrect/
├── backend/
│   ├── config/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── seed/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env.example
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── context/
│   │   └── pages/
│   ├── .env.example
│   ├── vercel.json
│   └── vite.config.js
├── SCHEMA.md
├── SECURITY.md
├── README.md
└── .gitignore
```

## Future Scope

Resurrect can expand from failed-payment recovery into a broader **AI revenue recovery layer for different merchant segments and revenue types**.

* **MSME revenue recovery** — tailor recovery workflows for small and medium businesses where delayed customer payments, failed transactions, and overdue invoices can directly affect cash flow.
* **B2B & receivables recovery** — extend the same decisioning and audit framework to overdue invoices, payment promises, and receivables follow-ups.
* **Checkout abandonment recovery** — recover customers who leave before completing checkout.
* **Failed subscription recovery** — handle recurring-payment failures with adaptive retry and communication strategies.
* **Adaptive recovery strategies** — learn from historical recovery outcomes to improve intervention selection over time.
* **Broader merchant coverage** — support both **retail/customer-facing payments and MSME/B2B revenue recovery** while retaining deterministic controls, payment verification, and auditability.

The long-term goal is to evolve Resurrect from a failed-payment recovery tool into a **general-purpose AI revenue recovery layer for merchants**.

---

### Resurrect in one line

**Detect the revenue at risk. Decide how to recover it. Execute safely. Verify the payment. Measure what came back.**
