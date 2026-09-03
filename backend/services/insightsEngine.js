// Pure, DB-free logic for the AI Insights panel and the floating merchant
// chatbot. Everything here operates on plain data that the caller has
// already fetched from MongoDB — no hallucinated numbers, no network calls.
// Keeping this logic separate from assistantService.js makes it possible to
// unit test the prioritization/formatting rules without a live database.

import { MAX_RETRIES } from "./recoveryEngine.js";

// A recovery attempt is only "reliable" evidence of a strategy's real
// success rate once there's a reasonable sample size. Below this, a raw
// percentage (e.g. 1/1 = 100%) is not allowed to outrank a larger, more
// representative sample (e.g. 8/11 = 73%).
export const MIN_RELIABLE_STRATEGY_SAMPLE = 5;

// How many candidates the "who to prioritize" list surfaces by default.
export const DEFAULT_PRIORITY_LIMIT = 8;

/**
 * ₹ amounts everywhere in Insights/chatbot output use Indian digit grouping
 * with two decimal places, e.g. ₹5,00,000.00 / ₹18,94,500.00. Values stay
 * numeric (paise) internally — this only controls display text.
 */
export function formatINR(paise) {
  const rupees = (Number(paise) || 0) / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function pct(rate) {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return null;
  return Math.round(rate * 100);
}

// ---------------------------------------------------------------------------
// Failure-reason knowledge: label + merchant-facing recovery advice, in both
// supported languages, plus a 0..1 "manual attention" weight used by the
// priority scorer (higher = more likely to need a human, not just automation).
// ---------------------------------------------------------------------------
export const FAILURE_INFO = {
  bank_timeout: {
    manualPriority: 0.45,
    en: { label: "Bank timeout", advice: "Safe to auto-retry after a short delay — this is usually a transient bank/network issue, not something the customer needs to fix." },
    hi: { label: "बैंक टाइमआउट", advice: "थोड़ी देर बाद फिर से retry करना सुरक्षित है — यह आमतौर पर एक अस्थायी बैंक/नेटवर्क समस्या है, ग्राहक की गलती नहीं।" },
  },
  network_error: {
    manualPriority: 0.45,
    en: { label: "Network error", advice: "Safe to auto-retry after a short delay, the same way as a bank timeout — the interruption was technical, not customer-side." },
    hi: { label: "नेटवर्क त्रुटि", advice: "बैंक timeout की तरह ही, थोड़ी देर बाद फिर से retry करना सुरक्षित है — रुकावट technical थी, ग्राहक की तरफ से नहीं।" },
  },
  insufficient_funds: {
    manualPriority: 0.6,
    en: { label: "Insufficient funds", advice: "Don't immediately retry the same charge — wait (e.g. a day) and send a reminder/SMS so the customer can pay once funds are available." },
    hi: { label: "अपर्याप्त बैलेंस", advice: "उसी charge को तुरंत दोबारा न आज़माएँ — कुछ समय (जैसे एक दिन) रुकें और reminder/SMS भेजें ताकि ग्राहक balance आने पर payment कर सके।" },
  },
  card_declined: {
    manualPriority: 0.8,
    en: { label: "Card declined", advice: "Ask the customer to try an alternate payment method or card; avoid repeated immediate retries on the same declined card." },
    hi: { label: "कार्ड अस्वीकृत", advice: "ग्राहक से किसी अन्य card/payment method का उपयोग करने को कहें; उसी अस्वीकृत card पर बार-बार तुरंत retry करने से बचें।" },
  },
  otp_failed: {
    manualPriority: 0.65,
    en: { label: "OTP failed", advice: "Send a reminder for the customer to retry checkout and complete OTP verification." },
    hi: { label: "OTP असफल", advice: "ग्राहक को checkout दोबारा करने और OTP verification पूरा करने के लिए reminder भेजें।" },
  },
  checkout_abandoned: {
    manualPriority: 0.55,
    en: { label: "Checkout abandoned", advice: "Nothing was actually charged — send a payment reminder with the recovery link rather than retrying." },
    hi: { label: "Checkout छोड़ा गया", advice: "असल में कोई charge नहीं हुआ — retry करने के बजाय recovery link के साथ payment reminder भेजें।" },
  },
  unknown: {
    manualPriority: 0.5,
    en: { label: "Unknown reason", advice: "The failure reason wasn't reported by the bank — send a gentle reminder and flag for manual review if it recurs." },
    hi: { label: "अज्ञात कारण", advice: "बैंक ने failure का कारण नहीं बताया — एक हल्का reminder भेजें और दोबारा होने पर manual review के लिए flag करें।" },
  },
};

const REPEATED_FAILURE_ADVICE = {
  en: "Already attempted multiple times without success — stop further automated attempts and follow up with this customer personally.",
  hi: "पहले ही कई बार बिना सफलता के प्रयास किया जा चुका है — आगे automatic प्रयास रोकें और ग्राहक से व्यक्तिगत रूप से संपर्क करें।",
};

function failureInfo(reason) {
  return FAILURE_INFO[reason] || FAILURE_INFO.unknown;
}

export function failureLabel(reason, language = "en") {
  const info = failureInfo(reason);
  return (info[language] || info.en).label;
}

/**
 * The recommended next action for a failure reason, unless the payment has
 * already been through repeated unsuccessful attempts — in which case the
 * advice is always "stop automation, follow up manually", regardless of the
 * underlying failure reason.
 */
export function recommendedAction({ failureReason, repeatedFailures }, language = "en") {
  if (repeatedFailures) return REPEATED_FAILURE_ADVICE[language] || REPEATED_FAILURE_ADVICE.en;
  const info = failureInfo(failureReason);
  return (info[language] || info.en).advice;
}

// ---------------------------------------------------------------------------
// WHY: failure-reason breakdown, computed only from payments that are not
// currently recovered (same population as the "Failed payments" stat card),
// so the percentages/amounts stay consistent with the rest of the dashboard.
// ---------------------------------------------------------------------------
export function computeFailureBreakdown(payments, language = "en") {
  const pool = payments || [];
  if (pool.length === 0) return [];

  const byReason = new Map();
  for (const p of pool) {
    const reason = p.failureReason || "unknown";
    if (!byReason.has(reason)) byReason.set(reason, { count: 0, amount: 0 });
    const entry = byReason.get(reason);
    entry.count += 1;
    entry.amount += p.amount || 0;
  }

  const total = pool.length;
  return [...byReason.entries()]
    .map(([reason, { count, amount }]) => ({
      reason,
      label: failureLabel(reason, language),
      count,
      percentage: Math.round((count / total) * 100),
      revenueImpact: amount,
      revenueImpactFormatted: formatINR(amount),
      advice: recommendedAction({ failureReason: reason, repeatedFailures: false }, language),
    }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// WHO: priority ranking for failed payments awaiting action.
//
// Signals used (all sourced directly from MongoDB, nothing invented):
//   - amount              → bigger payments matter more (revenue at stake)
//   - customer loyalty    → repeat customers are a stronger retention case
//   - failure reason      → some reasons inherently need a human, not just
//                           automation (e.g. card_declined vs bank_timeout)
//   - repeated failures   → retryCount / prior unsuccessful attempts on this
//                           SAME payment bump it up and flag "manual follow-up"
//   - recency             → a payment that failed minutes ago is fresher/more
//                           actionable than one that failed 2 weeks ago
// ---------------------------------------------------------------------------
// Payments may arrive either with `customer` already populated (a Mongoose
// populate().lean() result — the common case from assistantService) or as a
// bare customer id string/ObjectId with a separate lookup map. Support both
// so this stays correct regardless of how the caller fetched the data.
function resolveCustomer(payment, customersById) {
  const c = payment.customer;
  if (c && typeof c === "object") return c;
  return customersById?.get(String(c)) || {};
}

export function computePriorityQueue({
  payments,
  customersById,
  attemptsByPayment,
  language = "en",
  limit = DEFAULT_PRIORITY_LIMIT,
}) {
  const candidates = (payments || []).filter((p) => p.status === "failed");
  if (candidates.length === 0) return [];

  const maxAmount = Math.max(...candidates.map((p) => p.amount || 0), 1);
  const maxLoyalty = Math.max(
    ...candidates.map((p) => resolveCustomer(p, customersById)?.successfulPaymentsCount || 0),
    1
  );
  const now = Date.now();

  const scored = candidates.map((p) => {
    const customer = resolveCustomer(p, customersById);
    const priorAttempts = attemptsByPayment?.get(String(p._id)) || [];
    const priorFailureCount = priorAttempts.filter((a) => a.outcome === "failure").length;
    const retryCount = p.retryCount || 0;
    const repeatedFailures = retryCount >= MAX_RETRIES || priorFailureCount >= MAX_RETRIES;

    const amountScore = (p.amount || 0) / maxAmount;
    const loyaltyScore = maxLoyalty ? (customer.successfulPaymentsCount || 0) / maxLoyalty : 0;
    const manualPriorityScore = failureInfo(p.failureReason).manualPriority;
    const ageHours = (now - new Date(p.failedAt || p.createdAt || now).getTime()) / 3_600_000;
    const recencyScore = Math.max(0, 1 - Math.min(ageHours, 14 * 24) / (14 * 24));
    const attemptBoost = repeatedFailures ? 1 : Math.min(1, priorAttempts.length * 0.3);

    const score =
      amountScore * 0.35 +
      loyaltyScore * 0.2 +
      manualPriorityScore * 0.2 +
      attemptBoost * 0.15 +
      recencyScore * 0.1;

    return {
      payment: p,
      customer,
      retryCount,
      priorAttemptCount: priorAttempts.length,
      repeatedFailures,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((entry, index) => buildPriorityEntry(entry, index, language));
}

function buildPriorityEntry({ payment, customer, retryCount, priorAttemptCount, repeatedFailures, score }, index, language) {
  const parts = [];
  const amountFormatted = formatINR(payment.amount);
  const label = failureLabel(payment.failureReason, language);

  parts.push(
    language === "hi" ? `${amountFormatted} जोखिम में` : `${amountFormatted} at risk`
  );
  parts.push(label);

  if ((customer.successfulPaymentsCount || 0) >= 2) {
    parts.push(
      language === "hi"
        ? `repeat customer — ${customer.successfulPaymentsCount} पिछले successful payments`
        : `repeat customer — ${customer.successfulPaymentsCount} prior successful payments`
    );
  }

  if (repeatedFailures) {
    parts.push(
      language === "hi"
        ? `${retryCount} बार retry / ${priorAttemptCount} recovery attempts हो चुके — automation रोकें`
        : `retried ${retryCount}x / ${priorAttemptCount} recovery attempts already — stop automation`
    );
  } else if (priorAttemptCount > 0) {
    parts.push(
      language === "hi"
        ? `${priorAttemptCount} पिछला recovery attempt`
        : `${priorAttemptCount} prior recovery attempt${priorAttemptCount > 1 ? "s" : ""}`
    );
  }

  return {
    rank: index + 1,
    paymentId: String(payment._id),
    customerName: customer.name || (language === "hi" ? "अज्ञात ग्राहक" : "Unknown customer"),
    amount: payment.amount,
    amountFormatted,
    failureReason: payment.failureReason,
    failureLabel: label,
    retryCount,
    priorAttemptCount,
    repeatedFailures,
    successfulPaymentsCount: customer.successfulPaymentsCount || 0,
    recommendedAction: recommendedAction({ failureReason: payment.failureReason, repeatedFailures }, language),
    reasonText: parts.join(" · "),
    score: Math.round(score * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Strategy performance analysis — attempted-vs-successful per strategy, with
// an explicit small-sample guard so a 1/1 strategy is never presented as
// "better" than an 8/11 strategy just because its raw percentage is higher.
// ---------------------------------------------------------------------------
export function analyzeStrategyPerformance(strategyPerformance) {
  const withRate = (strategyPerformance || [])
    .map((s) => ({ ...s, rate: s.attempted ? s.successful / s.attempted : null }))
    .filter((s) => s.attempted > 0);

  if (withRate.length === 0) return { hasData: false };

  const reliable = withRate.filter((s) => s.attempted >= MIN_RELIABLE_STRATEGY_SAMPLE);
  const pool = reliable.length > 0 ? reliable : withRate;
  const sorted = [...pool].sort((a, b) => b.rate - a.rate);
  const top = sorted[0];
  const isReliable = reliable.length > 0;

  // A low-sample strategy whose raw rate looks better than the reliable
  // leader — worth naming explicitly so the merchant doesn't get misled by it.
  const misleadingHighRate = isReliable
    ? withRate.find((s) => s.attempted < MIN_RELIABLE_STRATEGY_SAMPLE && s.rate > top.rate)
    : null;

  return { hasData: true, top, isReliable, misleadingHighRate, all: withRate, minReliable: MIN_RELIABLE_STRATEGY_SAMPLE };
}

export function buildStrategyNote(strategyPerformance, language = "en") {
  const analysis = analyzeStrategyPerformance(strategyPerformance);

  if (!analysis.hasData) {
    return language === "hi"
      ? "अभी तक कोई recovery attempt दर्ज नहीं है, इसलिए यह बताना संभव नहीं कि कौन-सी strategy बेहतर काम कर रही है। पहले recovery चलाएँ।"
      : "No recovery attempts have been recorded yet, so it isn't possible to say which strategy works best. Run recovery on some failed payments first.";
  }

  const { top, isReliable, misleadingHighRate, minReliable } = analysis;
  const topRatePct = pct(top.rate);

  if (isReliable) {
    let text =
      language === "hi"
        ? `${top.strategy} अभी सबसे भरोसेमंद परिणाम दिखा रही है: ${top.successful}/${top.attempted} attempts सफल (${topRatePct}%), जो ${minReliable}+ attempts के sample पर आधारित है।`
        : `${top.strategy} currently has the most reliable performance: ${top.successful}/${top.attempted} attempts succeeded (${topRatePct}%), based on a sample of ${minReliable}+ attempts.`;

    if (misleadingHighRate) {
      const mPct = pct(misleadingHighRate.rate);
      text +=
        language === "hi"
          ? ` ${misleadingHighRate.strategy} का raw success rate ज़्यादा दिख रहा है (${misleadingHighRate.successful}/${misleadingHighRate.attempted} = ${mPct}%), लेकिन केवल ${misleadingHighRate.attempted} attempt(s) के आधार पर इसे बेहतर strategy नहीं माना जा सकता — sample बहुत छोटा है।`
          : ` ${misleadingHighRate.strategy} shows a higher raw success rate (${misleadingHighRate.successful}/${misleadingHighRate.attempted} = ${mPct}%), but with only ${misleadingHighRate.attempted} attempt(s) that sample is too small to call it the better strategy yet.`;
    }
    return text;
  }

  // No strategy has hit the reliable sample size yet.
  return language === "hi"
    ? `अभी किसी भी strategy के पास ${minReliable} या उससे अधिक attempts नहीं हैं, इसलिए percentage के आधार पर कोई निश्चित "सर्वश्रेष्ठ" strategy नहीं बताई जा सकती। अभी तक ${top.strategy} में सबसे ज़्यादा attempts (${top.attempted}) हैं — इसे तब तक संकेत मानें, dependable निष्कर्ष नहीं, जब तक और data न आ जाए।`
    : `No strategy has ${minReliable} or more attempts yet, so a percentage-based "best strategy" would be misleading. ${top.strategy} currently has the most attempts (${top.attempted}) — treat that as an early signal, not a reliable conclusion, until more data comes in.`;
}

// ---------------------------------------------------------------------------
// Overall recovery-rate reliability guard — avoids showing a bare "0%" when
// there simply isn't enough data to calculate a rate at all (0 attempts).
// ---------------------------------------------------------------------------
export function recoveryRateReliability(successful, failed) {
  const attempted = (successful || 0) + (failed || 0);
  return {
    attempted,
    rate: attempted > 0 ? successful / attempted : null,
    reliable: attempted > 0,
  };
}
