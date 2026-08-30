import express from "express";
import { getDashboardMetrics } from "../services/metricsService.js";

const router = express.Router();

router.get("/metrics", async (req, res) => {
  try {
    const metrics = await getDashboardMetrics();
    res.json(metrics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to compute metrics" });
  }
});

export default router;
