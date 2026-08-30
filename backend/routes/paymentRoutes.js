import express from "express";
import Payment from "../models/Payment.js";
import AuditLog from "../models/AuditLog.js";
import SMSLog from "../models/SMSLog.js";

const router = express.Router();

// List payments, newest first. Supports ?status=failed etc.
router.get("/", async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const payments = await Payment.find(filter)
    .populate("customer", "name phone isDemoCustomer")
    .sort({ createdAt: -1 })
    .limit(Number(req.query.limit) || 100);
  res.json(payments);
});

// Single payment with its audit trail + any SMS messages sent for it
router.get("/:id", async (req, res) => {
  const payment = await Payment.findById(req.params.id).populate("customer");
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  const [auditTrail, smsMessages] = await Promise.all([
    AuditLog.find({ payment: payment._id }).sort({ at: 1 }),
    SMSLog.find({ payment: payment._id }).sort({ sentAt: -1 }),
  ]);
  res.json({ payment, auditTrail, smsMessages });
});

export default router;
