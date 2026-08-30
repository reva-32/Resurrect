import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import recoveryRoutes from "./routes/recoveryRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import { requireAuth } from "./middleware/authMiddleware.js";

dotenv.config();

const app = express();

// Security headers on every response (sets a conservative CSP, disables
// sniffing, etc). See SECURITY.md for the full write-up.
app.use(helmet());

// Webhook route needs the raw body for signature verification, so it's mounted
// BEFORE express.json() and only that route uses express.raw().
app.use("/api/webhooks", webhookRoutes);

app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

// Blunt brute-force protection on login/signup — 20 attempts per 15 min per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

// Looser general API limiter so a runaway frontend loop or a scripted probe
// can't hammer the backend — well above normal dashboard usage.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/public", apiLimiter, publicRoutes);

// Everything below requires a logged-in merchant.
app.use("/api/payments", apiLimiter, requireAuth, paymentRoutes);
app.use("/api/recovery", apiLimiter, requireAuth, recoveryRoutes);
app.use("/api/dashboard", apiLimiter, requireAuth, dashboardRoutes);
app.use("/api/settings", apiLimiter, settingsRoutes);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("[server] failed to connect to DB:", err.message);
    process.exit(1);
  });
