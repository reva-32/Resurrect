# Security Notes

What's actually implemented, what's a known limitation for a hackathon-scope
project, and what a real fintech deployment would need on top of this.

## Implemented

**Multi-tenancy**
- Every `Customer`, `Payment`, `RecoveryAttempt`, `AIDecision`, `SMSLog`, and
  `AuditLog` document carries a `merchant` field. Every query that returns
  data to a merchant (`paymentRoutes.js`, `recoveryRoutes.js`,
  `metricsService.js`) filters by `req.user._id` — a merchant cannot see or
  act on another merchant's data, even by guessing an ID (payment lookups
  are `findOne({ _id, merchant })`, not `findById`).

**Authentication**
- Passwords are hashed with bcrypt (10 salt rounds) — the plaintext password
  is never stored, and `passwordHash` is explicitly excluded (`.select("-passwordHash")`)
  from every API response.
- Sessions are stateless JWTs (7-day expiry), verified on every protected
  request via `requireAuth` middleware. No session data lives server-side.
- Login/signup are rate-limited (20 attempts / 15 min / IP) to blunt basic
  credential-stuffing and brute-force attempts.

**Transport & headers**
- `helmet()` sets standard hardening headers (`X-Content-Type-Options`,
  a conservative CSP, etc.) on every response.
- CORS is restricted to `CLIENT_URL` — not a wildcard — so only the
  known frontend origin can call the API from a browser.
- All other API routes carry a general rate limit (120 req/min/IP) so a
  runaway frontend loop or a scripted probe can't hammer the backend.

**Payments**
- We never touch card numbers, CVVs, or bank credentials — Razorpay's
  Checkout/Payment Link captures that directly on Razorpay's own hosted page.
  This keeps the app almost entirely out of PCI-DSS scope; only Razorpay's
  infrastructure ever sees raw card data.
- Incoming Razorpay webhooks are signature-verified (`X-Razorpay-Signature`,
  HMAC-SHA256 against `RAZORPAY_WEBHOOK_SECRET`) before any payment is marked
  recovered — an attacker can't just POST a fake "payment succeeded" event.
- The AI recommends actions, but never executes them directly. Every
  recommendation passes through a deterministic backend policy layer
  (`applyPolicy` in `recoveryEngine.js`) that enforces hard limits — e.g. max
  2 retries — the model cannot override. This is logged per-payment
  (`AIDecision.wasOverridden`) so it's auditable, not just asserted.

**Data exposure**
- The public customer-facing page (`/api/public/payments/:id`) returns only
  what a customer should see — amount, status, a payment link — never the
  audit trail, AI reasoning, other customers' data, or merchant internals.
- Secrets (Razorpay keys, JWT secret, Gemini key) live only in
  `backend/.env`, never in the frontend bundle or exposed via any API
  response — the Settings page shows configuration *status* (booleans) only,
  never the values.

## Known limitations (fine for a hackathon demo, not for production)

- **Public payment link uses the raw MongoDB `_id` as the token.** It's
  unguessable in practice but not cryptographically signed or expiring. A
  production version should issue a short-lived, single-use signed token
  per recovery link instead.
- **No email verification on signup.** Anyone can create a merchant account
  with any email address.
- **No refresh-token rotation or logout-everywhere.** The 7-day JWT is valid
  until it expires; there's no server-side revocation list.
- **Webhook replay protection is basic.** Signature verification stops
  forged events, but there's no idempotency key check — a duplicate,
  legitimately-signed webhook delivery is currently handled by checking
  `payment.status !== "recovered"` before updating, which is good enough
  here but not a full idempotency guarantee under concurrent delivery.

If you present this at the buildathon, it's worth saying this table out loud
rather than hoping nobody asks — judges tend to trust teams more when the
limitations are already named.
