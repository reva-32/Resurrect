import Payment from "../models/Payment.js";
import RecoveryAttempt from "../models/RecoveryAttempt.js";
import SMSLog from "../models/SMSLog.js";

/**
 * Core dashboard metrics, plus the baseline-vs-AI-assisted comparison.
 *
 * "Baseline" = what recovery would look like if every eligible payment just got
 * the rule-engine's decision (decidedBy: "rules"). "AI-assisted" = payments where
 * the AI's decision was used (decidedBy: "ai"). Comparing recovered ₹ and recovery
 * rate between the two groups is what proves the AI is adding value, not just
 * adding a layer of complexity.
 */
export async function getDashboardMetrics() {
  const [
    totalFailed,
    revenueAtRiskAgg,
    recoveredAgg,
    smsSentCount,
    retryAttemptsCount,
    successfulRecoveries,
    failedRecoveries,
  ] = await Promise.all([
    Payment.countDocuments({ status: { $ne: "recovered" } }),
    Payment.aggregate([
      { $match: { status: { $in: ["failed", "recovery_in_progress"] } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Payment.aggregate([
      { $match: { status: "recovered" } },
      { $group: { _id: null, total: { $sum: "$recoveredAmount" } } },
    ]),
    SMSLog.countDocuments({}),
    RecoveryAttempt.countDocuments({ action: "retry" }),
    RecoveryAttempt.countDocuments({ outcome: "success" }),
    RecoveryAttempt.countDocuments({ outcome: "failure" }),
  ]);

  const revenueAtRisk = revenueAtRiskAgg[0]?.total || 0;
  const totalRecovered = recoveredAgg[0]?.total || 0;
  const totalAttempted = successfulRecoveries + failedRecoveries;
  const recoveryRate = totalAttempted > 0 ? successfulRecoveries / totalAttempted : 0;

  const baselineVsAI = await getBaselineVsAI();

  return {
    revenueAtRisk,
    totalRecovered,
    recoveryRate, // 0–1, multiply by 100 for %
    totalFailedPayments: totalFailed,
    smsSentCount,
    retryAttemptsCount,
    successfulRecoveries,
    failedRecoveries,
    baselineVsAI,
  };
}

async function getBaselineVsAI() {
  const groups = await RecoveryAttempt.aggregate([
    {
      $lookup: {
        from: "payments",
        localField: "payment",
        foreignField: "_id",
        as: "paymentDoc",
      },
    },
    { $unwind: "$paymentDoc" },
    {
      $group: {
        _id: "$decidedBy", // "rules" or "ai"
        attempts: { $sum: 1 },
        successes: { $sum: { $cond: [{ $eq: ["$outcome", "success"] }, 1, 0] } },
        recoveredAmount: {
          $sum: {
            $cond: [{ $eq: ["$outcome", "success"] }, "$paymentDoc.recoveredAmount", 0],
          },
        },
      },
    },
  ]);

  const shape = (row) => ({
    attempts: row?.attempts || 0,
    successes: row?.successes || 0,
    recoveryRate: row?.attempts ? row.successes / row.attempts : 0,
    recoveredAmount: row?.recoveredAmount || 0,
  });

  const rules = shape(groups.find((g) => g._id === "rules"));
  const ai = shape(groups.find((g) => g._id === "ai"));

  return { baseline: rules, aiAssisted: ai };
}
