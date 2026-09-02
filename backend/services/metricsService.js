import mongoose from "mongoose";
import Payment from "../models/Payment.js";
import RecoveryAttempt from "../models/RecoveryAttempt.js";
import SMSLog from "../models/SMSLog.js";

/**
 * Core dashboard metrics. Everything is scoped to a single merchantId — a new
 * signup with no data of their own sees all zeros, not another merchant's
 * seeded numbers.
 */
export async function getDashboardMetrics(merchantId) {
  const merchant = new mongoose.Types.ObjectId(merchantId);

  const [
    totalFailed,
    revenueAtRiskAgg,
    recoveredAgg,
    smsSentCount,
    retryAttemptsCount,
    successfulRecoveries,
    failedRecoveries,
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
    SMSLog.countDocuments({ merchant }),
    RecoveryAttempt.countDocuments({ merchant, action: "retry" }),
    RecoveryAttempt.countDocuments({ merchant, outcome: "success" }),
    RecoveryAttempt.countDocuments({ merchant, outcome: "failure" }),
  ]);

  const revenueAtRisk = revenueAtRiskAgg[0]?.total || 0;
  const totalRecovered = recoveredAgg[0]?.total || 0;
  const totalAttempted = successfulRecoveries + failedRecoveries;
  const recoveryRate = totalAttempted > 0 ? successfulRecoveries / totalAttempted : 0;

  return {
    revenueAtRisk,
    totalRecovered,
    recoveryRate, // 0–1, multiply by 100 for %
    totalFailedPayments: totalFailed,
    smsSentCount,
    retryAttemptsCount,
    successfulRecoveries,
    failedRecoveries,
  };
}
