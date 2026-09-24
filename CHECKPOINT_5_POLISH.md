# Checkpoint 5 — Polish & Production Readiness

Checkpoint 5 turns Resurrect into a final, demo-ready project without adding unnecessary infrastructure.

## Included

### Testing
- Existing payment state-machine tests remain enabled.
- Existing ML recovery tests remain enabled.
- Reconciliation logic now has deterministic unit tests for normalization, missing records, amount mismatches, and status mismatches.

Run:

```bash
cd backend
npm test
```

### Health check

The backend exposes:

```text
GET /api/health
```

A healthy response reports MongoDB as `connected`. If the database is unavailable, the endpoint returns HTTP 503.

### Docker

The project now has:

- `backend/Dockerfile` — production Node/Express container
- `frontend/Dockerfile` — Vite build served by Nginx
- `frontend/nginx.conf` — SPA routing fallback
- `docker-compose.yml` — runs frontend + backend together

MongoDB is intentionally not containerized because Resurrect uses MongoDB Atlas.

Copy the required environment variables into a shell or `.env` file before running Compose. Never commit secrets.

Example:

```bash
docker compose up --build
```

Frontend: `http://localhost`
Backend health: `http://localhost:5000/api/health`

### Data-source honesty

The application distinguishes synthetic/demo records from Razorpay test-mode data. Demo provider snapshots used by reconciliation are explicitly labeled as snapshots and are not presented as production payment data.

## Final architecture

```text
Retail
Failed payment
    ↓
ML recovery probability
    ↓
Deterministic policy
    ↓
Recovery action
    ↓
Verified payment webhook
    ↓
Recovered revenue

B2B / MSME
Invoice
    ↓
Due date
    ↓
Overdue
    ↓
Receivables policy
    ↓
Follow-up / payment

Both workflows
    ↓
Audit trail
    ↓
Reconciliation
    ↓
Operational visibility
```

## Local run

Backend:

```bash
cd backend
npm install
npm test
npm start
```

Frontend (separate terminal):

```bash
cd frontend
npm install
npm run build
npm run dev
```

## Demo order

1. Login.
2. Show the retail payment recovery dashboard.
3. Show ML recovery probability and deterministic policy.
4. Open Receivables and show an overdue B2B invoice.
5. Open Reconciliation, load the provider demo snapshot, and run reconciliation.
6. Show matched, amount-mismatch, and status-mismatch records.
7. Open the audit trail / relevant payment history.
8. Show `/api/health` as the final operations check.
