import mongoose from "mongoose";
import Payment from "../models/Payment.js";
import RecoveryAttempt from "../models/RecoveryAttempt.js";
import SMSLog from "../models/SMSLog.js";

/**
 * Core dashboard metrics. Everything is scoped to a single merchantId.
 * Analytics are computed from the same live collections so charts update as
 * recovery attempts, SMS messages, and Razorpay webhooks change the data.
 */
export async function getDashboardMetrics(merchantId) {
  const merchant = new mongoose.Types.ObjectId(merchantId);

  const [
    totalFailed,
    revenueAtRiskAgg,
    recoveredAgg,
    recoveredPaymentCount,
    smsSentCount,
    retryAttemptsCount,
    successfulRecoveries,
    failedRecoveries,
    recoveryTrendAgg,
    strategyAgg,
  ] = await Promise.all([
    Payment.countDocuments({ merchant, status: { $ne: "recovered" } }),
    Payment.aggregate([
      { $match: { merchant, status: { $in: ["failed", "recovery_in_progress"] } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Payment.aggregate([
      { $match: { merchant, status: "recovered" } },
      { $group: { _id: null, total: { $sum: "$recoveredAmount" } } },
    ]),
    Payment.countDocuments({ merchant, status: "recovered" }),
    SMSLog.countDocuments({ merchant }),
    RecoveryAttempt.countDocuments({ merchant, action: "retry" }),
    RecoveryAttempt.countDocuments({ merchant, outcome: "success" }),
    RecoveryAttempt.countDocuments({ merchant, outcome: "failure" }),
    Payment.aggregate([
      {
        $match: {
          merchant,
          $or: [
            { failedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
            { recoveredAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          ],
        },
      },
      {
        $project: {
          failedAt: 1,
          recoveredAt: 1,
        },
      },
    ]),
    RecoveryAttempt.aggregate([
      { $match: { merchant } },
      {
        $group: {
          _id: "$action",
          attempted: { $sum: 1 },
          successful: {
            $sum: { $cond: [{ $eq: ["$outcome", "success"] }, 1, 0] },
          },
        },
      },
      { $sort: { attempted: -1 } },
    ]),
  ]);

  const revenueAtRisk = revenueAtRiskAgg[0]?.total || 0;
  const totalRecovered = recoveredAgg[0]?.total || 0;
  const totalAttempted = successfulRecoveries + failedRecoveries;
  const recoveryRate = totalAttempted > 0 ? successfulRecoveries / totalAttempted : 0;

  // Build a complete 7-day series, including zero-value days, so the line
  // chart always has a stable time axis and newly arriving data appears
  // immediately on the next dashboard refresh.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const trendMap = new Map();

  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    trendMap.set(day.toISOString().slice(0, 10), { failed: 0, recovered: 0 });
  }

  for (const payment of recoveryTrendAgg) {
    if (payment.failedAt) {
      const key = new Date(payment.failedAt).toISOString().slice(0, 10);
      if (trendMap.has(key)) trendMap.get(key).failed += 1;
    }
    if (payment.recoveredAt) {
      const key = new Date(payment.recoveredAt).toISOString().slice(0, 10);
      if (trendMap.has(key)) trendMap.get(key).recovered += 1;
    }
  }

  const recoveryTrend = [...trendMap.entries()].map(([date, values]) => ({
    date,
    ...values,
  }));

  const strategyLabels = {
    retry: "Retry",
    sms: "SMS",
    priority_sms: "Priority SMS",
    review: "Review",
    stop: "Stopped",
  };

  const strategyCounts = new Map(
    strategyAgg.map((item) => [item._id, { attempted: item.attempted, successful: item.successful }])
  );
  const strategyPerformance = Object.entries(strategyLabels).map(([key, label]) => ({
    strategy: label,
    attempted: strategyCounts.get(key)?.attempted || 0,
    successful: strategyCounts.get(key)?.successful || 0,
  }));

  return {
    revenueAtRisk,
    totalRecovered,
    recoveredPaymentCount,
    recoveryRate,
    totalFailedPayments: totalFailed,
    smsSentCount,
    retryAttemptsCount,
    successfulRecoveries,
    failedRecoveries,
    analytics: {
      recoveryTrend,
      strategyPerformance,
    },
  };
}
