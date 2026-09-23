import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import User from "../models/User.js";

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

router.put("/business-type", async (req, res) => {
  try {
    const { businessType } = req.body || {};
    if (!["retail", "b2b", "hybrid"].includes(businessType)) {
      return res.status(400).json({ error: "Invalid business type" });
    }
    req.user.businessType = businessType;
    await User.updateOne({ _id: req.user._id }, { $set: { businessType } });
    res.json({ businessType });
  } catch (err) {
    console.error("[settings] business type update error:", err.message);
    res.status(500).json({ error: "Failed to update business type" });
  }
});
