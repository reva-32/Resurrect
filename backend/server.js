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

// The merchant dashboard and the public customer payment page are both routes
// in the same React/Vite frontend, so production needs only CLIENT_URL.
const ALLOWED_ORIGINS = ["http://localhost:5173", process.env.CLIENT_URL].filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      // No Origin header (curl, server-to-server, some mobile clients) — allow.
      if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
  })
);
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
    app.listen(PORT, "0.0.0.0", () => console.log(`[server] listening on 0.0.0.0:${PORT}`));
  })
  .catch((err) => {
    console.error("[server] failed to connect to DB:", err.message);
    process.exit(1);
  });
