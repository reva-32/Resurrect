import express from "express";
import Payment from "../models/Payment.js";
import ProviderTransaction from "../models/ProviderTransaction.js";
import Reconciliation from "../models/Reconciliation.js";
import { reconcileMerchant } from "../services/reconciliationService.js";

const router = express.Router();

router.get("/summary", async (req, res) => {
  try {
    const latest = await Reconciliation.find({ merchant: req.user._id }).sort({ checkedAt: -1 }).limit(500);
    const counts = { total: latest.length, matched: 0, amountMismatch: 0, statusMismatch: 0, missingProvider: 0, missingInternal: 0 };
    for (const row of latest) {
      if (row.result === "matched") counts.matched++;
      if (row.result === "amount_mismatch") counts.amountMismatch++;
      if (row.result === "status_mismatch") counts.statusMismatch++;
      if (row.result === "missing_provider") counts.missingProvider++;
      if (row.result === "missing_internal") counts.missingInternal++;
    }
    res.json({ counts, lastCheckedAt: latest[0]?.checkedAt || null });
  } catch (err) {
    console.error("[reconciliation] summary error:", err.message);
    res.status(500).json({ error: "Failed to load reconciliation summary" });
  }
});

router.get("/results", async (req, res) => {
  try {
    const results = await Reconciliation.find({ merchant: req.user._id })
      .populate("payment", "amount paymentState status razorpay dataSource createdAt")
      .populate("providerTransaction", "externalPaymentId amount status dataSource observedAt")
      .sort({ checkedAt: -1 })
      .limit(200);
    res.json(results);
  } catch (err) {
    console.error("[reconciliation] results error:", err.message);
    res.status(500).json({ error: "Failed to load reconciliation results" });
  }
});

router.post("/run", async (req, res) => {
  try {
    const results = await reconcileMerchant(req.user._id);
    res.json({ checked: results.length, results, message: "Reconciliation completed." });
  } catch (err) {
    console.error("[reconciliation] run error:", err.message);
    res.status(500).json({ error: "Failed to run reconciliation" });
  }
});

router.post("/seed", async (req, res) => {
  try {
    const payments = await Payment.find({ merchant: req.user._id }).sort({ createdAt: -1 }).limit(10);
    if (payments.length < 4) return res.status(400).json({ error: "Load at least 4 payment demo records first." });
    await ProviderTransaction.deleteMany({ merchant: req.user._id, dataSource: "demo_provider_snapshot" });
    const docs = [];
    payments.forEach((payment, index) => {
      if (index === 3) return;
      docs.push({ merchant: req.user._id, payment: payment._id, externalPaymentId: `demo_pay_${String(payment._id).slice(-8)}_${index}`, paymentLinkId: payment.razorpay?.paymentLinkId, amount: index === 1 ? Math.max(100, payment.amount - 100) : payment.amount, currency: payment.currency, status: index === 2 ? "authorized" : (payment.paymentState === "settled" ? "settled" : payment.paymentState), dataSource: "demo_provider_snapshot", observedAt: new Date() });
    });
    docs.push({ merchant: req.user._id, externalPaymentId: `demo_orphan_${String(payments[0]._id).slice(-8)}`, amount: payments[0].amount, currency: payments[0].currency, status: "captured", dataSource: "demo_provider_snapshot", observedAt: new Date() });
    await ProviderTransaction.insertMany(docs);
    res.json({ created: docs.length, message: "Controlled demo loaded: matched plus amount mismatch, status mismatch, missing provider, and missing internal cases." });
  } catch (err) { console.error("[reconciliation] seed error:", err.message); res.status(500).json({ error: "Failed to load provider demo data" }); }
});

export default router;
