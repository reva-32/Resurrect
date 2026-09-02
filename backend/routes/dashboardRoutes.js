import express from "express";
import { getDashboardMetrics } from "../services/metricsService.js";
import { seedForMerchant } from "../services/seedService.js";

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
