import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

// Configuration health-check for the "Getting Started" panel — booleans only,
// never the actual secret values, even to an authenticated merchant.
router.get("/status", requireAuth, async (req, res) => {
  res.json({
    razorpayConfigured: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    webhookConfigured: !!process.env.RAZORPAY_WEBHOOK_SECRET,
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    smsMockMode: process.env.SMS_MOCK_MODE !== "false",
    smsProvider: process.env.SMS_PROVIDER || "mock",
    demoCustomerConfigured: !!process.env.DEMO_PHONE,
    clientUrl: process.env.CLIENT_URL || null,
  });
});

export default router;
