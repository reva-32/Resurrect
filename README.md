# Resurrect — AI Revenue Recovery Engine

Resurrect is an AI-assisted payment recovery system for merchants. It combines deterministic recovery rules with Gemini-based decisioning, Razorpay Payment Links, webhook-confirmed payment recovery, merchant authentication, recovery analytics, and a public customer payment-status page.

The project is designed so that **real Razorpay recovery is only marked successful after a verified Razorpay webhook**. Creating or opening a payment link does not mark the payment as recovered.

## Architecture

```text
frontend/
├── React + Vite merchant dashboard
├── Login / Signup
├── Dashboard / recovery controls
├── Settings / demo configuration
└── Public /pay/:paymentId customer payment page

backend/
├── Express API
├── MongoDB + Mongoose
├── Razorpay Payment Links + webhooks
├── Gemini AI decision engine
├── Deterministic recovery-rule fallback
├── JWT + bcrypt authentication
└── Mock SMS for synthetic/demo dataset flows
```

## Main features

- Merchant signup/login with JWT authentication.
- Synthetic failed-payment dataset seeding for demonstrations.
- AI-assisted recovery decisions using Gemini.
- Deterministic rule-based fallback when Gemini is unavailable, rate-limited, or returns an unusable response.
- Per-run Gemini call limit through `GEMINI_MAX_CALLS_PER_RUN`.
- Razorpay Test Mode Payment Link generation for the live demo customer.
- Razorpay notification SMS for the live Payment Link — no third-party SMS provider is required.
- Mock SMS logging for synthetic recovery flows.
- Razorpay webhook signature verification using the raw request body.
- Payment recovery state updated only after a valid Razorpay webhook.
- Public customer payment-status page with polling.
- Recovery attempts, AI decisions, SMS logs, and audit logs stored in MongoDB.
- Dashboard metrics for recovery activity and outcomes.

## Local setup

### 1. Backend

```bash
cd backend
npm install
npm start
```

The backend runs on port `5000` by default and exposes the health check at:

```text
http://localhost:5000/api/health
```

Expected response:

```json
{"ok":true}
```

### 2. Backend environment

Copy the example file:

```bash
cd backend
copy .env.example .env
```

On macOS/Linux, use `cp .env.example .env` instead.

Fill in the required local/test values in `backend/.env`. Important variables include:

```text
MONGODB_URI=...
JWT_SECRET=...
CLIENT_URL=http://localhost:5173

RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_NOTIFY_SMS=true
RAZORPAY_NOTIFY_EMAIL=false

GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.6-flash
GEMINI_MAX_CALLS_PER_RUN=5

SMS_MOCK_MODE=true
DEMO_PHONE=+91XXXXXXXXXX
DEMO_NAME=Your Name
DEMO_AMOUNT_RUPEES=5
```

`GEMINI_API_KEY` is optional. If Gemini cannot be used, the application continues with the deterministic recovery rules.

### 3. Seed demo data

Run the seed command from the `backend/` directory:

```bash
cd backend
npm run seed
```

The seed creates the synthetic dataset plus a dedicated non-synthetic demo customer/payment. The live demo payment uses:

- `DEMO_NAME` for the customer name.
- `DEMO_PHONE` for the customer phone number.
- `DEMO_AMOUNT_RUPEES` for the amount, defaulting to **₹5**.

### 4. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Create `frontend/.env` with:

```text
VITE_API_URL=http://localhost:5000/api
```

The main frontend contains both the authenticated merchant dashboard and the public `/pay/:paymentId` customer page.

## Recovery logic

Ressurect uses two decision paths:

1. **Gemini AI decisioning** — Gemini evaluates the failed-payment context and returns a structured recovery action.
2. **Deterministic rules fallback** — the recovery engine applies predefined failure-reason rules when Gemini is unavailable, rate-limited/quota-limited, invalid, or otherwise cannot provide a usable decision.

The application also stops repeatedly calling Gemini after an explicit quota/rate-limit condition during the current process run. This prevents unnecessary repeated requests while allowing the recovery flow to continue through the rules engine.

For the dedicated live demo customer, the application ensures the recovery flow produces a real Razorpay Payment Link even if the AI/rules decision would otherwise choose a non-payment-link action. This is intentional: the live demo must give the customer an actual Razorpay payment path, while synthetic payments continue to demonstrate the normal AI-vs-rules recovery experiment.

## Live Razorpay demo flow

1. Start MongoDB/backend/frontend and log in to the merchant dashboard.
2. Open **Settings → Sample Data** and configure the demo customer's name and phone number if required.
3. Seed/reload the sample data. The dedicated demo payment is non-synthetic and defaults to **₹5**.
4. Open the demo payment and choose **Run recovery (real Razorpay link → SMS)**.
5. The backend creates a **Razorpay Test Mode Payment Link** using the configured Razorpay test credentials.
6. Razorpay can send the Payment Link notification directly to the configured customer phone when `RAZORPAY_NOTIFY_SMS=true`. No separate SMS provider is used for this live flow.
7. Open the public `/pay/:paymentId` page from the recovery flow. Authentication is not required for this page.
8. Before payment, the customer page shows the payment as pending/recovery in progress.
9. Complete the payment through Razorpay Test Mode using Razorpay's test payment flow.
10. Razorpay sends the payment event to the configured webhook endpoint.
11. The backend verifies `X-Razorpay-Signature`, finds the corresponding payment, marks it `recovered`, stores the recovered amount/time, and resolves the pending recovery attempt.
12. The customer page polls the backend and changes to **Payment received**. The merchant dashboard changes the same payment to **Recovered**.

### Important demo rule

The merchant dashboard **must not** mark the live demo payment as recovered merely because a Payment Link was created, opened, or sent. Recovery is confirmed only after the verified Razorpay webhook updates MongoDB.

## Local webhook testing

Razorpay cannot directly deliver webhooks to a private `localhost` URL. Therefore, the complete local payment → webhook → MongoDB flow requires a publicly reachable webhook URL, such as a temporary tunnel.

For the final demonstration, **deploy the backend to Render instead of relying on a local tunnel**. The public Render URL becomes the Razorpay webhook endpoint.

The Payment Link itself can still be created and paid in Razorpay Test Mode while the application is running locally; only the webhook callback requires a public endpoint.

## Deployment

### MongoDB Atlas

Create a MongoDB Atlas cluster/database user and configure network access so the deployed backend can connect.

Use the Atlas connection string as:

```text
MONGODB_URI=...
```

### Render — backend

Deploy the `backend/` directory as a **Docker Web Service**.

Render configuration:

```text
Root Directory: backend
Runtime: Docker
Dockerfile: Dockerfile
```

The included `backend/Dockerfile` installs production dependencies and starts the Express server. The server uses Render's `PORT` value and binds to `0.0.0.0`.

Set these environment variables in Render:

```text
MONGODB_URI
JWT_SECRET
CLIENT_URL

RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
RAZORPAY_NOTIFY_SMS=true
RAZORPAY_NOTIFY_EMAIL=false

GEMINI_API_KEY (optional)
GEMINI_MODEL
gemini-3.6-flash
GEMINI_MAX_CALLS_PER_RUN

SMS_MOCK_MODE=true
DEMO_PHONE
DEMO_NAME
DEMO_AMOUNT_RUPEES=5
```

Do **not** manually hardcode Render's `PORT`; Render provides it at runtime.

After deployment, verify:

```text
https://<your-render-service>.onrender.com/api/health
```

It should return HTTP 200 with:

```json
{"ok":true}
```

### Vercel — frontend

Deploy `frontend/` as the Vercel project root.

```text
Build command: npm run build
Output directory: dist
```

Set the Vercel environment variable:

```text
VITE_API_URL=https://<your-render-service>.onrender.com/api
```

The included `frontend/vercel.json` rewrites SPA routes so direct navigation works for:

- `/login`
- `/signup`
- `/dashboard`
- `/settings`
- `/pay/:paymentId`

After the Vercel deployment is available, set Render's `CLIENT_URL` to the final Vercel frontend URL.

## Razorpay webhook configuration

After the Render backend is live, configure a Razorpay **Test Mode** webhook pointing to:

```text
https://<your-render-service>.onrender.com/api/webhooks/razorpay
```

Use the same value for `RAZORPAY_WEBHOOK_SECRET` in Razorpay and Render.

The backend is prepared to handle the payment events used by the recovery flow, including:

```text
payment_link.paid
payment.captured
```

The webhook handler validates the Razorpay signature before processing the event. Unmatched but valid webhook events are acknowledged without changing unrelated payments.

## End-to-end deployment test

After Render, Vercel, MongoDB Atlas, and the Razorpay webhook are configured:

1. Open the Vercel frontend.
2. Log in to the merchant account.
3. Configure the demo customer in Settings if needed.
4. Seed/reload the sample data.
5. Run **Run recovery (real Razorpay link → SMS)** for the live demo payment.
6. Open the generated Razorpay Payment Link.
7. Complete the ₹5 Test Mode payment.
8. Check Render logs for the incoming Razorpay webhook.
9. Confirm the payment changes from `recovery_in_progress` to `recovered`.
10. Confirm the customer page shows **Payment received** and the merchant dashboard shows **Recovered**.

## API overview

### Public

```text
GET  /api/health
GET  /api/public/payments/:id
POST /api/public/payments/:id/viewed
POST /api/webhooks/razorpay
```

### Authentication

```text
POST /api/auth/signup
POST /api/auth/login
GET  /api/auth/me
```

### Merchant APIs

```text
GET  /api/payments
GET  /api/payments/:id
POST /api/recovery/run
POST /api/recovery/:paymentId/run
GET  /api/dashboard/metrics
POST /api/dashboard/seed
GET  /api/settings/status
```

Merchant endpoints are protected by JWT authentication where required.

## Security

- Passwords are bcrypt-hashed.
- Signup/login validate email format and require a password of at least 8 characters containing a letter, number, and special character.
- JWT protects merchant APIs.
- Helmet security headers are enabled.
- API/auth rate limiting is enabled.
- Razorpay webhook signatures are verified against the raw request body.
- Razorpay API credentials, webhook secrets, Gemini keys, and JWT secrets are loaded from environment variables.
- Card/payment credentials are never handled by the application server.
- The public `/pay/:paymentId` route exposes only the customer/payment information required for the payment-status experience.
- The live demo uses Razorpay Test Mode; it is intended for simulated transactions, not real-money collection.

## Never commit secrets

Never commit:

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

Use the committed `.env.example` files as templates.

If a real credential was ever committed to a public Git repository, **rotate/revoke it before deployment** even if the file is later deleted.

## Project structure

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