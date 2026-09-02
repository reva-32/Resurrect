import express from "express";
import Payment from "../models/Payment.js";
import AuditLog from "../models/AuditLog.js";
import SMSLog from "../models/SMSLog.js";
import AIDecision from "../models/AIDecision.js";

const router = express.Router();

// List payments, newest first, scoped to the logged-in merchant only.
router.get("/", async (req, res) => {
  const filter = { merchant: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const payments = await Payment.find(filter)
    .populate("customer", "name phone isDemoCustomer")
    .sort({ createdAt: -1 })
    .limit(Number(req.query.limit) || 100);
  res.json(payments);
});

// Single payment with its audit trail + any SMS messages sent for it.
// Scoped by merchant too, so one merchant can't pull another's payment by
// guessing/incrementing an ID.
router.get("/:id", async (req, res) => {
  const payment = await Payment.findOne({ _id: req.params.id, merchant: req.user._id }).populate("customer");
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  const [auditTrail, smsMessages, decisions] = await Promise.all([
    AuditLog.find({ payment: payment._id }).sort({ at: 1 }),
    SMSLog.find({ payment: payment._id }).sort({ sentAt: -1 }),
    AIDecision.find({ payment: payment._id }).sort({ createdAt: -1 }),
  ]);
  // Most recent decision first — this is what actually drove the current
  // status, which is what the merchant wants to see explained clearly.
  const latestDecision = decisions[0] || null;
  res.json({ payment, auditTrail, smsMessages, decisions, latestDecision });
});

export default router;
