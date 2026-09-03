import express from "express";
import { getDashboardMetrics } from "../services/metricsService.js";
import { seedForMerchant } from "../services/seedService.js";
import { getDashboardInsights, askDashboardAssistant } from "../services/assistantService.js";

const router = express.Router();

router.get("/metrics", async (req, res) => {
  try {
    const metrics = await getDashboardMetrics(req.user._id);
    res.json(metrics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to compute metrics" });
  }
});

router.get("/insights", async (req, res) => {
  try {
    const insights = await getDashboardInsights(req.user._id, req.query.language);
    res.json(insights);
  } catch (err) {
    console.error("[dashboard] insights error:", err.message);
    res.status(500).json({ error: "Failed to generate dashboard insights" });
  }
});

router.post("/assistant", async (req, res) => {
  try {
    const { question, language } = req.body || {};
    if (!question || String(question).trim().length > 500) {
      return res.status(400).json({ error: "Question is required and must be 500 characters or fewer" });
    }
    const result = await askDashboardAssistant(req.user._id, question, language);
    res.json(result);
  } catch (err) {
    console.error("[dashboard] assistant error:", err.message);
    res.status(500).json({ error: "Failed to answer dashboard question" });
  }
});

// "Add Data" button on the dashboard — (re)generates the synthetic dataset
// scoped to the logged-in merchant only. A fresh signup starts at zero
// until this is called, which is the point: real numbers, not shared demo data.
router.post("/seed", async (req, res) => {
  try {
    const { demoPhone, demoName } = req.body || {};
    const result = await seedForMerchant(req.user._id, { demoPhone, demoName });
    res.json(result);
  } catch (err) {
    console.error("[dashboard] seed error:", err.message);
    res.status(500).json({ error: "Failed to seed data" });
  }
});

export default router;
