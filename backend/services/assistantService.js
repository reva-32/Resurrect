import { GoogleGenAI } from "@google/genai";
import Payment from "../models/Payment.js";
import RecoveryAttempt from "../models/RecoveryAttempt.js";
import SMSLog from "../models/SMSLog.js";
import { getDashboardMetrics } from "./metricsService.js";
import {
  formatINR,
  pct,
  computeFailureBreakdown,
  computePriorityQueue,
  buildStrategyNote,
  recoveryRateReliability,
  failureLabel,
  recommendedAction,
} from "./insightsEngine.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
let geminiUnavailable = false;

const LANGUAGE_NAMES = { en: "English", hi: "Hindi" };

function safeLanguage(language) {
  return language === "hi" ? "hi" : "en";
}

function t(language, en, hi) {
  return language === "hi" ? hi : en;
}

// ---------------------------------------------------------------------------
// Context gathering — every number/name shown by Insights or the chatbot
// comes from here. Nothing downstream is allowed to invent a fact that
// isn't present in this snapshot.
// ---------------------------------------------------------------------------
async function buildContext(merchantId, language = "en") {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [metrics, recentPayments, smsCount, recentAttempts, unresolvedPayments, todayRows] = await Promise.all([
    getDashboardMetrics(merchantId),
    Payment.find({ merchant: merchantId })
      .populate("customer", "name successfulPaymentsCount lifetimeValue isDemoCustomer")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    SMSLog.countDocuments({ merchant: merchantId }),
    RecoveryAttempt.find({ merchant: merchantId })
      .select("action outcome decidedBy attemptedAt payment customer")
      .populate("payment", "amount status failureReason")
      .populate("customer", "name successfulPaymentsCount")
      .sort({ attemptedAt: -1 })
      .limit(200)
      .lean(),
    // Every currently-unresolved payment (failed / recovery_in_progress / stopped),
    // with the customer fields needed for loyalty-based prioritization. This is
    // the grounded population behind both the failure-reason breakdown (WHY)
    // and the priority queue (WHO) — never a synthetic or invented sample.
    Payment.find({ merchant: merchantId, status: { $ne: "recovered" } })
      .populate("customer", "name successfulPaymentsCount lifetimeValue")
      .select("amount status failureReason retryCount failedAt createdAt customer")
      .lean(),
    Payment.find({
      merchant: merchantId,
      $or: [{ failedAt: { $gte: todayStart } }, { recoveredAt: { $gte: todayStart } }],
    })
      .select("failedAt recoveredAt amount recoveredAmount")
      .lean(),
  ]);

  // Recovery attempts scoped to the currently-unresolved payments, so the
  // priority scorer can see "how many times has THIS payment already been
  // tried" — not just the global retryCount field.
  const unresolvedIds = unresolvedPayments.map((p) => String(p._id));
  const attemptsRaw = unresolvedIds.length
    ? await RecoveryAttempt.find({ merchant: merchantId, payment: { $in: unresolvedIds } })
        .select("payment outcome action")
        .lean()
    : [];
  const attemptsByPayment = new Map();
  for (const a of attemptsRaw) {
    const key = String(a.payment);
    if (!attemptsByPayment.has(key)) attemptsByPayment.set(key, []);
    attemptsByPayment.get(key).push(a);
  }

  const customersById = new Map();
  for (const p of unresolvedPayments) {
    if (p.customer) customersById.set(String(p.customer._id), p.customer);
  }

  const failureBreakdown = computeFailureBreakdown(unresolvedPayments, language);
  const priorityQueue = computePriorityQueue({
    payments: unresolvedPayments,
    customersById,
    attemptsByPayment,
    language,
  });
  const strategyNote = buildStrategyNote(metrics.analytics?.strategyPerformance || [], language);
  const rateInfo = recoveryRateReliability(metrics.successfulRecoveries, metrics.failedRecoveries);

  let todayFailedAmount = 0;
  let todayRecoveredAmount = 0;
  let todayFailedCount = 0;
  let todayRecoveredCount = 0;
  for (const p of todayRows) {
    if (p.failedAt && new Date(p.failedAt) >= todayStart) {
      todayFailedCount += 1;
      todayFailedAmount += p.amount || 0;
    }
    if (p.recoveredAt && new Date(p.recoveredAt) >= todayStart) {
      todayRecoveredCount += 1;
      todayRecoveredAmount += p.recoveredAmount || 0;
    }
  }

  const customerMap = new Map();
  for (const payment of recentPayments) {
    const c = payment.customer;
    if (!c) continue;
    const id = String(c._id);
    if (!customerMap.has(id)) customerMap.set(id, {
      name: c.name,
      successfulPayments: c.successfulPaymentsCount || 0,
      lifetimeValue: c.lifetimeValue || 0,
      failedPayments: 0,
      recoveredPayments: 0,
    });
    const item = customerMap.get(id);
    if (payment.status === "recovered") item.recoveredPayments += 1;
    if (payment.status !== "recovered") item.failedPayments += 1;
  }
  const customers = [...customerMap.values()]
    .sort((a, b) => b.successfulPayments - a.successfulPayments)
    .slice(0, 20);

  return {
    metrics: {
      ...metrics,
      smsSentCount: smsCount,
      recoveryRateReliable: rateInfo.reliable,
      recoveryAttemptsSampleSize: rateInfo.attempted,
    },
    today: {
      failedCount: todayFailedCount,
      recoveredCount: todayRecoveredCount,
      failedAmount: todayFailedAmount,
      recoveredAmount: todayRecoveredAmount,
      failedAmountFormatted: formatINR(todayFailedAmount),
      recoveredAmountFormatted: formatINR(todayRecoveredAmount),
    },
    failureBreakdown,
    priorityQueue,
    strategyNote,
    payments: recentPayments.map((p) => ({
      id: String(p._id),
      customer: p.customer?.name || "Unknown customer",
      amount: p.amount,
      status: p.status,
      failureReason: p.failureReason,
      retryCount: p.retryCount,
      failedAt: p.failedAt,
      recoveredAt: p.recoveredAt,
    })),
    attempts: recentAttempts.map((a) => ({
      action: a.action,
      outcome: a.outcome,
      decidedBy: a.decidedBy,
      customer: a.customer?.name || "Unknown customer",
      paymentAmount: a.payment?.amount || 0,
      paymentStatus: a.payment?.status || "unknown",
      failureReason: a.payment?.failureReason || "unknown",
    })),
    customers,
  };
}

function contextForPrompt(context) {
  // Trim to what the model actually needs — the full priorityQueue/failureBreakdown
  // are already backend-computed and grounded, so Gemini only has to narrate them,
  // not recompute a ranking of its own.
  return JSON.stringify(
    {
      metrics: context.metrics,
      today: context.today,
      failureBreakdown: context.failureBreakdown,
      priorityQueue: context.priorityQueue,
      strategyNote: context.strategyNote,
      recentPayments: context.payments.slice(0, 40),
      customers: context.customers,
    },
    null,
    2
  );
}

// ---------------------------------------------------------------------------
// Deterministic (non-LLM) sections. These back both the Insights fallback
// and most chatbot answers, and are always available even if Gemini is down.
// ---------------------------------------------------------------------------
function whatHappenedText(context, language) {
  const { today, metrics } = context;
  if (language === "hi") {
    return `आज ${today.failedCount} payments fail हुए (${today.failedAmountFormatted}) और ${today.recoveredCount} payments recover हुए (${today.recoveredAmountFormatted})। कुल मिलाकर, ${metrics.totalFailedPayments} payments अभी भी unresolved हैं (${formatINR(metrics.revenueAtRisk)} जोखिम में) और अब तक ${metrics.recoveredPaymentCount} unique payments recover हो चुके हैं (${formatINR(metrics.totalRecovered)})।`;
  }
  return `Today, ${today.failedCount} payment(s) failed (${today.failedAmountFormatted}) and ${today.recoveredCount} payment(s) were recovered (${today.recoveredAmountFormatted}). Overall, ${metrics.totalFailedPayments} payments are still unresolved (${formatINR(metrics.revenueAtRisk)} at risk) and ${metrics.recoveredPaymentCount} unique payments have been recovered so far (${formatINR(metrics.totalRecovered)}).`;
}

function whyText(context, language) {
  const { failureBreakdown } = context;
  if (failureBreakdown.length === 0) {
    return t(
      language,
      "There are no currently-failing payments, so there is no failure-reason pattern to explain right now.",
      "अभी कोई payment failed नहीं है, इसलिए समझाने के लिए कोई failure pattern नहीं है।"
    );
  }
  const top = failureBreakdown.slice(0, 3);
  const lines = top.map((f) =>
    t(
      language,
      `${f.label}: ${f.count} payment(s), ${f.percentage}% of unresolved payments, ${f.revenueImpactFormatted} at stake. ${f.advice}`,
      `${f.label}: ${f.count} payments, unresolved payments का ${f.percentage}%, ${f.revenueImpactFormatted} दांव पर। ${f.advice}`
    )
  );
  return lines.join("\n");
}

function whoText(context, language) {
  const { priorityQueue } = context;
  if (priorityQueue.length === 0) {
    return t(
      language,
      "No failed payments currently need prioritization.",
      "अभी कोई failed payment prioritize करने के लिए नहीं है।"
    );
  }
  return priorityQueue
    .slice(0, 5)
    .map((p) => t(language, `${p.rank}. ${p.customerName} — ${p.reasonText}`, `${p.rank}. ${p.customerName} — ${p.reasonText}`))
    .join("\n");
}

function whatNextText(context, language) {
  const { priorityQueue, strategyNote, failureBreakdown } = context;
  const parts = [];
  if (priorityQueue.length > 0) {
    const top = priorityQueue[0];
    parts.push(
      t(
        language,
        `Start with ${top.customerName} (${top.amountFormatted}, ${top.failureLabel}): ${top.recommendedAction}`,
        `${top.customerName} (${top.amountFormatted}, ${top.failureLabel}) से शुरू करें: ${top.recommendedAction}`
      )
    );
  } else if (failureBreakdown.length > 0) {
    const top = failureBreakdown[0];
    parts.push(t(language, `Most failures right now are "${top.label}": ${top.advice}`, `अभी सबसे ज़्यादा failures "${top.label}" हैं: ${top.advice}`));
  } else {
    parts.push(t(language, "No failed payments currently need action.", "अभी कोई failed payment पर action लेने की ज़रूरत नहीं है।"));
  }
  parts.push(strategyNote);
  return parts.join("\n\n");
}

function chartExplanations(language) {
  if (language === "hi") {
    return [
      `Recovery Funnel पूरे merchant dataset में failed payments से recovery actions और successful recovery attempts का flow दिखाता है।`,
      `Recovery Over Time केवल पिछले 7 दिनों में failedAt और recoveredAt पर आधारित daily movement दिखाता है।`,
      `Recovery by Strategy हर strategy के attempts और successful outcomes की तुलना करता है; एक payment पर एक से अधिक attempts हो सकते हैं।`,
    ];
  }
  return [
    `Recovery Funnel shows the merchant-wide flow from failed payments to recovery actions and successful recovery attempts.`,
    `Recovery Over Time shows daily failures and recoveries based on payment failedAt and recoveredAt timestamps for the last 7 days.`,
    `Recovery by Strategy compares attempts with successful outcomes for each strategy; one payment can have more than one recovery attempt.`,
  ];
}

function deterministicInsights(context, language) {
  return {
    whatHappened: whatHappenedText(context, language),
    why: whyText(context, language),
    who: whoText(context, language),
    whatNext: whatNextText(context, language),
    chartExplanations: chartExplanations(language),
  };
}

function composeNarrative(sections, language) {
  const heading = {
    en: { happened: "WHAT HAPPENED", why: "WHY PAYMENTS ARE FAILING", who: "WHO TO PRIORITIZE", next: "WHAT TO DO NEXT" },
    hi: { happened: "क्या हुआ", why: "PAYMENTS क्यों FAIL हो रहे हैं", who: "किसे प्राथमिकता दें", next: "आगे क्या करें" },
  }[language];

  return [
    heading.happened,
    sections.whatHappened,
    heading.why,
    sections.why,
    heading.who,
    sections.who,
    heading.next,
    sections.whatNext,
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------
async function askGemini(prompt) {
  if (!process.env.GEMINI_API_KEY || geminiUnavailable) return null;
  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: prompt,
      config: { temperature: 0.1, maxOutputTokens: 1400 },
    });
    const text = response.text?.trim();
    if (!text) return null;
    return text;
  } catch (err) {
    const message = String(err?.message || "").toLowerCase();
    if (err?.status === 429 || message.includes("quota") || message.includes("rate limit") || message.includes("resource exhausted")) {
      geminiUnavailable = true;
    }
    console.error("[assistantService] Gemini unavailable:", err.message);
    return null;
  }
}

export async function getDashboardInsights(merchantId, language = "en") {
  const lang = safeLanguage(language);
  const context = await buildContext(merchantId, lang);
  const sections = deterministicInsights(context, lang);
  const fallbackNarrative = composeNarrative(sections, lang);

  const prompt = `You are Resurrect, a merchant payment-recovery copilot. Write concise dashboard insights in ${LANGUAGE_NAMES[lang]} using ONLY the supplied JSON snapshot below. This is a strict grounding rule: never invent, estimate, or infer any customer, amount, failure reason, date, or business fact that is not directly present in the snapshot. Keep every numeric value exactly as supplied — do not round differently or recompute totals.

The snapshot already contains a backend-computed "priorityQueue" (already ranked, do not re-rank or add/remove entries — only explain it in prose) and a "failureBreakdown" (already computed — only explain it). For the strategy comparison, use the supplied "strategyNote" as the source of truth and do not claim a low-sample strategy is "better" than a higher-sample one just because its percentage looks larger.

Return plain text with exactly these four headings, each followed by 1-4 sentences (or short lines for lists): WHAT HAPPENED, WHY PAYMENTS ARE FAILING, WHO TO PRIORITIZE, WHAT TO DO NEXT. WHO TO PRIORITIZE must list the top entries from priorityQueue by name, amount, and reason — do not substitute different customers. WHAT TO DO NEXT must give concrete, failure-specific actions (e.g. delayed retry for insufficient funds, alternate payment method for card declines, retry after delay for bank timeouts, checkout/OTP retry reminder for OTP failures, a payment reminder/link for abandoned checkouts, and stopping automation in favor of manual follow-up for payments with repeated failures). If a section has no data (e.g. no failed payments), say so plainly instead of inventing content.

DASHBOARD SNAPSHOT:
${contextForPrompt(context)}`;

  const aiText = await askGemini(prompt);

  return {
    language: lang,
    generatedBy: aiText ? "gemini" : "grounded-fallback",
    content: aiText || fallbackNarrative,
    chartExplanations: sections.chartExplanations,
    failureBreakdown: context.failureBreakdown,
    priorityQueue: context.priorityQueue,
    strategyNote: context.strategyNote,
    today: context.today,
    recoveryRateReliable: context.metrics.recoveryRateReliable,
    data: context.metrics,
  };
}

// ---------------------------------------------------------------------------
// Chatbot — deterministic pattern matching first (fast, always-grounded,
// zero LLM cost for the common questions), Gemini for anything open-ended,
// and a deterministic composed answer if Gemini is unavailable. The chatbot
// never returns an empty response or a "try again" message.
// ---------------------------------------------------------------------------
const REASON_KEYWORDS = [
  { reason: "insufficient_funds", re: /insufficient|balance|अपर्याप्त|बैलेंस/i },
  { reason: "card_declined", re: /card declin|declined card|कार्ड अस्वीकृत/i },
  { reason: "bank_timeout", re: /bank timeout|बैंक टाइमआउट/i },
  { reason: "otp_failed", re: /otp/i },
  { reason: "checkout_abandoned", re: /abandon|छोड़/i },
  { reason: "network_error", re: /network error|नेटवर्क/i },
];

// ---------------------------------------------------------------------------
// General merchant business questions — not about THIS dashboard's data, but
// still legitimate things a merchant running a payments/recovery business
// would ask (customer relationships, reach/growth, trust, communication,
// refunds, pricing). Answered with genuine practical guidance, deterministically
// and bilingually, with zero LLM cost for the common cases. Anything outside
// this scope (entertainment, trivia, unrelated general knowledge) is declined
// rather than guessed at — see isLikelyOffTopic()/offTopicDecline() below.
// ---------------------------------------------------------------------------
const BUSINESS_TOPICS = [
  {
    key: "customer_relationships",
    re: /customer relationship|retain customers?|customer retention|loyal(ty)?|repeat customers?|churn|ग्राहक.*(संबंध|रोकना|बनाए रखना|loyalty)|ग्राहक.*बार-बार/i,
    en: `For stronger customer relationships, focus on three things: make buying easy, respond quickly when something goes wrong, and give existing customers a reason to return. Segment customers into first-time, repeat, high-value and inactive groups, then give each group a different follow-up. For failed payments, be helpful rather than pushy: explain the issue, provide one clear way to complete payment, and stop repeated automation when a customer has already been contacted several times.`,
    hi: `ग्राहक relationships बेहतर करने के लिए तीन चीज़ों पर ध्यान दें: खरीदारी आसान रखें, समस्या होने पर जल्दी जवाब दें और existing customers को दोबारा खरीदने का कारण दें। Customers को first-time, repeat, high-value और inactive groups में बाँटें और हर group के लिए अलग follow-up रखें। Failed payment में बार-बार message भेजने के बजाय समस्या समझाएँ, एक clear payment option दें और कई attempts के बाद manual follow-up करें।`,
  },
  {
    key: "customer_reach_growth",
    re: /customer reach|increase.*reach|reach.*customer|grow.*customer|new customers?|customer acquisition|acquir.*customer|marketing|social media|advertis|lead generation|ग्राहक.*(बढ़|पहुंच|लाना)|नए ग्राहक|मार्केटिंग|विज्ञापन/i,
    en: `To increase customer reach, build a simple acquisition loop: pick 1–2 channels where your target buyers already spend time, create a clear offer, send interested visitors to a fast checkout, and measure the funnel from visit → checkout → successful payment → repeat purchase. Add referral incentives for existing customers, recover abandoned checkouts, collect reviews after successful purchases, and test different offers instead of spending everywhere at once.`,
    hi: `Customer reach बढ़ाने के लिए एक simple acquisition loop बनाइए: 1–2 ऐसे channels चुनें जहाँ आपके target buyers पहले से मौजूद हों, clear offer दें, fast checkout रखें और visit → checkout → successful payment → repeat purchase पूरा funnel measure करें। Existing customers के लिए referral incentive रखें, abandoned checkouts recover करें, successful purchases के बाद reviews लें और एक साथ हर जगह पैसा खर्च करने के बजाय अलग-अलग offers test करें।`,
  },
  {
    key: "sales_growth",
    re: /increase sales|grow sales|boost sales|more sales|sales growth|बिक्री.*(बढ़|बढ़ाना)|sales बढ़/i,
    en: `To grow sales, work on the three levers separately: get more qualified visitors, convert more of them, and increase repeat purchases. Start by finding where customers drop out — product page, checkout, payment or after the first purchase. Then run one change at a time, such as a clearer offer, fewer checkout steps, a better payment mix, abandoned-checkout recovery, or a targeted repeat-purchase offer.`,
    hi: `Sales बढ़ाने के लिए तीन levers अलग-अलग देखें: qualified visitors बढ़ाएँ, conversion बढ़ाएँ और repeat purchases बढ़ाएँ। पहले पता करें कि customer कहाँ drop हो रहा है — product page, checkout, payment या first purchase के बाद। फिर एक समय में एक बदलाव test करें, जैसे clearer offer, कम checkout steps, बेहतर payment options, abandoned-checkout recovery या targeted repeat-purchase offer।`,
  },
  {
    key: "payment_recovery_methods",
    re: /recover (money|money\b|payments?|revenue)|recover.*payment|payment recovery|recovery methods?|other methods.*recover|how.*recover.*money|money.*recover|failed payment|failed payments?|stuck payment|unpaid|outstanding payment|payment.*वसूल|पैसे.*वसूल|पेमेंट.*recover|भुगतान.*वसूल/i,
    en: `You can recover more failed payments with a layered approach instead of relying only on retries: (1) retry at a sensible time for temporary failures, (2) offer another payment method when the original method is declined, (3) send a short payment link/reminder for abandoned checkouts, (4) use WhatsApp/SMS or email follow-ups with a clear next step, (5) switch repeated failures to manual support, and (6) give high-value or repeat customers a more personal recovery flow. Track recovery by failure type, channel and number of attempts so you can stop tactics that do not work.`,
    hi: `Failed payments से ज्यादा पैसा recover करने के लिए सिर्फ retries पर निर्भर न रहें। Layered approach रखें: (1) temporary failures के लिए सही समय पर retry, (2) declined payment पर दूसरा payment method, (3) abandoned checkout के लिए short payment link/reminder, (4) WhatsApp/SMS या email पर clear next step, (5) बार-बार fail होने पर manual support, और (6) high-value या repeat customers के लिए personal recovery flow। Recovery को failure type, channel और attempts के हिसाब से track करें ताकि जो तरीका काम नहीं करता उसे बंद किया जा सके।`,
  },
  {
    key: "checkout_conversion",
    re: /checkout conversion|improve checkout|checkout.*convert|abandon.*checkout|cart abandonment|checkout छोड़|कार्ट.*छोड़/i,
    en: `Improve checkout by reducing friction: keep the form short, show the final amount clearly, make trusted payment methods obvious, avoid unnecessary redirects, and give customers a clear recovery path if payment fails. For abandoned checkouts, send a timely reminder with the payment link rather than restarting the entire sales conversation. Measure checkout starts, payment attempts, failures and successful payments separately.`,
    hi: `Checkout conversion बेहतर करने के लिए friction कम करें: form छोटा रखें, final amount साफ दिखाएँ, trusted payment methods सामने रखें, unnecessary redirects कम करें और payment fail होने पर clear recovery path दें। Abandoned checkout पर पूरी sales conversation दोबारा शुरू करने के बजाय समय पर payment link वाला reminder भेजें। Checkout starts, payment attempts, failures और successful payments को अलग-अलग measure करें।`,
  },
  {
    key: "offers_promotions",
    re: /offer|promotion|promotions|campaign|coupon|coupon code|discount|छूट|ऑफर|promotion|campaign/i,
    en: `Use promotions strategically rather than discounting everyone. Test a few offers: first-purchase incentive for new customers, limited-time offer for inactive customers, bundle/quantity offer for increasing order value, and a small recovery incentive only when a failed payment is worth saving. Compare incremental recovered/sold value against the discount cost so the offer does not simply reduce your margin.`,
    hi: `Promotions को हर customer पर लागू करने के बजाय strategically इस्तेमाल करें। अलग offers test करें: new customers के लिए first-purchase incentive, inactive customers के लिए limited-time offer, order value बढ़ाने के लिए bundle/quantity offer और valuable failed payment के लिए छोटा recovery incentive। Discount की cost के मुकाबले extra recovered/sold value देखें ताकि margin बेवजह कम न हो।`,
  },
  {
    key: "communication_reminders",
    re: /communicat|reminder|follow.?up|message.*customer|sms|whatsapp|email.*customer|communication|संदेश|reminder|follow.?up|ग्राहक.*message/i,
    en: `Good payment follow-ups are short, specific and action-oriented. Tell the customer what happened, give one clear next step or payment link, and avoid sending the same message repeatedly in a short period. A useful sequence is reminder → second channel → manual support for repeated failures, with different wording for abandoned checkout, temporary failure and payment-method decline.`,
    hi: `अच्छे payment follow-ups छोटे, specific और action-oriented होने चाहिए। Customer को बताएं कि क्या हुआ, एक clear next step या payment link दें और कम समय में वही message बार-बार न भेजें। एक useful sequence है: reminder → दूसरा channel → repeated failure पर manual support; abandoned checkout, temporary failure और payment-method decline के लिए wording अलग रखें।`,
  },
  {
    key: "pricing",
    re: /pricing|price strategy|pricing strategy|how.*price|price.*customer|मूल्य|कीमत|pricing/i,
    en: `For pricing, make the value obvious before trying to lower the price. Compare your conversion and repeat-purchase behaviour across a few price points or packages, use simple tiers, and avoid permanent blanket discounts. If a customer has already reached checkout, test whether the problem is actually price or payment friction before changing the price.`,
    hi: `Pricing में price कम करने से पहले value साफ दिखाएँ। अलग price points या packages पर conversion और repeat purchase compare करें, simple tiers रखें और permanent blanket discounts से बचें। अगर customer checkout तक पहुँच चुका है, तो price बदलने से पहले देखें कि असली problem price है या payment friction।`,
  },
  {
    key: "support_trust",
    re: /customer support|customer service|complaint|complaints|trust|credibility|review|reviews|reputation|ग्राहक.*(सहायता|शिकायत)|भरोसा|विश्वास|review/i,
    en: `Build trust by making the payment experience predictable: show the business name clearly, explain failures without vague language, respond quickly to complaints, keep refunds straightforward, and ask for a review after a genuinely successful purchase. When a payment fails repeatedly, human support is often better for trust than sending another automated message.`,
    hi: `Trust बनाने के लिए payment experience predictable रखें: business name साफ दिखाएँ, failure को vague language के बजाय स्पष्ट तरीके से समझाएँ, complaints पर जल्दी जवाब दें, refunds सरल रखें और successful purchase के बाद review माँगें। Payment बार-बार fail होने पर एक और automated message भेजने के बजाय human support trust के लिए बेहतर हो सकता है।`,
  },
  {
    key: "refunds_disputes",
    re: /refund|refunds|dispute|chargeback|रिफंड|विवाद/i,
    en: `For refunds and disputes, respond quickly, confirm what the customer is asking for, keep the process simple, and maintain a clear record of the payment and communication. If a refund is appropriate, making it easy and transparent can protect repeat business better than making the customer fight through support.`,
    hi: `Refunds और disputes में जल्दी respond करें, customer की समस्या confirm करें, process सरल रखें और payment तथा communication का clear record रखें। Refund उचित है तो process को आसान और transparent रखना customer को support में भटकाने से बेहतर long-term business दे सकता है।`,
  },
];

function businessTopicAnswer(question, language) {
  const topic = BUSINESS_TOPICS.find((b) => b.re.test(question));
  if (!topic) return null;
  return topic[language] || topic.en;
}

// Broad merchant intent used only as the offline safety net. It intentionally
// recognizes natural business wording such as "what other methods can I use
// to recover money?" rather than requiring the user to mention dashboard terms.
const GENERAL_MERCHANT_INTENT = /customer|customers|sales|sell|revenue|money|payment|payments|pay|recover|recovery|failed|failure|checkout|cart|order|orders|marketing|market|reach|grow|growth|acquisition|lead|offer|promotion|campaign|discount|price|pricing|refund|support|complaint|review|trust|retention|retain|repeat|loyal|churn|sms|whatsapp|email|ग्राहक|बिक्री|पैसे|भुगतान|पेमेंट|वसूल|रिकवरी|असफल|चेकआउट|मार्केटिंग|ऑफर|छूट|कीमत|रिफंड|सहायता|शिकायत|भरोसा|बार-बार/i;

const DASHBOARD_DATA_INTENT = /dashboard|today|currently|right now|how many|count|amount|revenue at risk|recovery rate|who should i contact|which customer|which payment|why are my payments failing|कितने|आज|अभी|किसे.*संपर्क|कौन.*customer|कितना.*revenue/i;

function offTopicDecline(language) {
  return t(
    language,
    "I’m focused on merchant and business questions. Ask me about sales, customer growth, payment recovery, checkout, retention, offers, pricing, refunds, support, or your dashboard.",
    "मैं merchant और business से जुड़े सवालों में मदद कर सकता हूँ। Sales, customer growth, payment recovery, checkout, retention, offers, pricing, refunds, support या dashboard के बारे में पूछें।"
  );
}

function reasonSpecificAnswer(context, reason, language) {
  const entry = context.failureBreakdown.find((f) => f.reason === reason);
  const label = failureLabel(reason, language);
  const advice = recommendedAction({ failureReason: reason, repeatedFailures: false }, language);
  if (!entry) {
    return t(
      language,
      `There are no currently-unresolved payments with "${label}" as the failure reason. If you mean how to handle this type of failure in general, ${advice}`,
      `अभी कोई unresolved payment "${label}" failure reason के साथ नहीं है। अगर आप इस failure type को सामान्य रूप से handle करने के तरीके पूछ रहे हैं, तो ${advice}`
    );
  }
  return t(
    language,
    `"${label}" accounts for ${entry.count} of your currently-unresolved payments (${entry.percentage}%, ${entry.revenueImpactFormatted} at risk). ${advice}`,
    `"${label}" अभी unresolved payments में से ${entry.count} (${entry.percentage}%, ${entry.revenueImpactFormatted}) का कारण है। ${advice}`
  );
}

function whoAnswer(context, language) {
  const { priorityQueue } = context;
  if (priorityQueue.length === 0) {
    return t(language, "There are no failed payments waiting for action right now.", "अभी कोई failed payment action का इंतज़ार नहीं कर रहा है।");
  }
  const top = priorityQueue.slice(0, 5);
  const lines = top.map((p) =>
    t(
      language,
      `${p.rank}. ${p.customerName} — ${p.amountFormatted}, ${p.failureLabel}${p.repeatedFailures ? " (repeated failures — needs a human, not more automation)" : ""}. ${p.recommendedAction}`,
      `${p.rank}. ${p.customerName} — ${p.amountFormatted}, ${p.failureLabel}${p.repeatedFailures ? " (बार-बार असफल — automation नहीं, manual follow-up चाहिए)" : ""}। ${p.recommendedAction}`
    )
  );
  return [t(language, "Contact these first, ranked by amount at risk, customer loyalty, and how recoverable the failure reason is:", "इन्हें पहले संपर्क करें — amount, ग्राहक loyalty और failure recoverability के आधार पर rank किया गया:"), ...lines].join("\n");
}

function todayAnswer(context, language) {
  return whatHappenedText(context, language);
}

function strategyAnswer(context, language) {
  return context.strategyNote;
}

function whyAnswer(context, language) {
  const { failureBreakdown, metrics } = context;
  if (failureBreakdown.length === 0) {
    return t(language, "There are no currently-failing payments to explain right now.", "अभी explain करने के लिए कोई failed payment नहीं है।");
  }
  const rateText = metrics.recoveryRateReliable
    ? t(language, `The overall recovery rate is ${pct(metrics.recoveryRate)}% across ${metrics.recoveryAttemptsSampleSize} recovery attempts.`, `कुल recovery rate ${metrics.recoveryAttemptsSampleSize} attempts में ${pct(metrics.recoveryRate)}% है।`)
    : t(language, "There isn't a reliable recovery rate yet — no recovery attempts have resolved.", "अभी recovery rate reliably calculate करने लायक data नहीं है — कोई recovery attempt resolve नहीं हुआ है।");
  return `${whyText(context, language)}\n\n${rateText}`;
}

function nextAnswer(context, language) {
  return whatNextText(context, language);
}

export async function askDashboardAssistant(merchantId, question, language = "en") {
  const lang = safeLanguage(language);
  const q = String(question || "").trim();
  if (!q) throw new Error("Question is required");
  const context = await buildContext(merchantId, lang);
  const lower = q.toLowerCase();
  const m = context.metrics;

  // 1. "What happened today?"
  if (/today|आज/.test(lower)) {
    return { language: lang, generatedBy: "dashboard-data", answer: todayAnswer(context, lang) };
  }

  // 2. Failure-reason-specific questions (e.g. "How can I reduce insufficient-fund failures?")
  const reasonMatch = REASON_KEYWORDS.find((r) => r.re.test(q));
  if (reasonMatch) {
    return { language: lang, generatedBy: "dashboard-data", answer: reasonSpecificAnswer(context, reasonMatch.reason, lang) };
  }

  // 3. "Who should I contact first?"
  if (/who should i|who.*(contact|priority|reach|call)|किसे.*priority|किसे.*संपर्क|prioriti[sz]e/.test(lower)) {
    return { language: lang, generatedBy: "dashboard-data", answer: whoAnswer(context, lang) };
  }

  // 4. "Which recovery strategy is working?"
  if (/strategy|strategies|रणनीति/.test(lower)) {
    return { language: lang, generatedBy: "dashboard-data", answer: strategyAnswer(context, lang) };
  }

  // 5. "Why are my payments failing?" / "Why is recovery rate low?"
  if (/why.*(fail|declin|recovery rate|rate)|failing|क्यों/.test(lower)) {
    return { language: lang, generatedBy: "dashboard-data", answer: whyAnswer(context, lang) };
  }

  // 6. "What should I do next?"
  if (/what should i do|what.*next|अगला|आगे.*क्या/.test(lower)) {
    return { language: lang, generatedBy: "dashboard-data", answer: nextAnswer(context, lang) };
  }

  // 7. Plain stat lookups — answered straight from the snapshot, no LLM needed.
  if (/recovered|recovery rate|failed|sms|retry|retries|revenue at risk|risk/.test(lower)) {
    if (/how many|count|number/.test(lower) && /recover/.test(lower)) {
      return { language: lang, generatedBy: "dashboard-data", answer: t(lang, `${m.recoveredPaymentCount || 0} unique payments are recovered.`, `${m.recoveredPaymentCount || 0} unique payments recover हैं।`) };
    }
    if (/recovery rate/.test(lower)) {
      const answer = m.recoveryRateReliable
        ? t(lang, `The current recovery rate is ${pct(m.recoveryRate)}% (based on ${m.recoveryAttemptsSampleSize} recovery attempts).`, `Current recovery rate ${pct(m.recoveryRate)}% है (${m.recoveryAttemptsSampleSize} attempts पर आधारित)।`)
        : t(lang, "There isn't enough data yet to calculate a reliable recovery rate — no recovery attempts have resolved as success or failure yet.", "अभी recovery rate reliably calculate करने लायक data नहीं है — अभी तक कोई recovery attempt resolve नहीं हुआ।");
      return { language: lang, generatedBy: "dashboard-data", answer };
    }
    if (/sms/.test(lower)) return { language: lang, generatedBy: "dashboard-data", answer: t(lang, `The dashboard shows ${m.smsSentCount} SMS sent.`, `Dashboard में ${m.smsSentCount} SMS भेजे गए हैं।`) };
    if (/retry|retries/.test(lower)) return { language: lang, generatedBy: "dashboard-data", answer: t(lang, `There are ${m.retryAttemptsCount} retry attempts.`, `${m.retryAttemptsCount} retry attempts दर्ज हैं।`) };
    if (/revenue at risk|risk/.test(lower)) return { language: lang, generatedBy: "dashboard-data", answer: t(lang, `Current revenue at risk is ${formatINR(m.revenueAtRisk)}.`, `Current revenue at risk ${formatINR(m.revenueAtRisk)} है।`) };
    if (/failed/.test(lower)) return { language: lang, generatedBy: "dashboard-data", answer: t(lang, `${m.totalFailedPayments} payments are not currently in recovered status.`, `${m.totalFailedPayments} payments अभी recovered status में नहीं हैं।`) };
    return { language: lang, generatedBy: "dashboard-data", answer: t(lang, `The dashboard shows ${formatINR(m.totalRecovered)} in recovered value.`, `Dashboard में recovered value ${formatINR(m.totalRecovered)} है।`) };
  }

  // 8. General merchant business questions (not about this dashboard's data,
  // but still legitimate — customer relationships, reach, trust, refunds,
  // pricing, support). Curated, deterministic, bilingual, zero LLM cost.
  const topicAnswer = businessTopicAnswer(q, lang);
  if (topicAnswer) {
    return { language: lang, generatedBy: "business-advice", answer: topicAnswer };
  }

  // 9. Open-ended questions. Dashboard facts remain grounded, but general
  // merchant/business advice is NOT forced to pretend it comes from the
  // dashboard. This is the important distinction: "what other methods can I
  // use to recover money?" should receive useful business advice even when the
  // current dashboard has no matching failed-payment row.
  const isDashboardQuestion = DASHBOARD_DATA_INTENT.test(q);
  const isBusinessQuestion = GENERAL_MERCHANT_INTENT.test(q) || /how|what|why|can i|should i|ways|methods|क्या|कैसे|क्यों|करूँ|करना/i.test(q);

  const prompt = `You are Resurrect, an AI copilot for merchants and online businesses. Reply in ${LANGUAGE_NAMES[lang]}.

There are TWO modes:
1) DASHBOARD MODE: If the merchant asks for a fact about their actual dashboard (counts, amounts, named customers, current failures, recovery rate, today's activity, or which payment/customer to prioritize), use ONLY the supplied dashboard snapshot. Never invent dashboard facts.
2) BUSINESS ADVICE MODE: If the merchant asks a general business question (sales, customer reach, acquisition, retention, checkout, payment recovery, failed payments, offers, pricing, communication, refunds, support, reviews, etc.), answer directly with practical, specific merchant advice from your general business knowledge. Do NOT say that you can only answer from the dashboard. Do NOT require a matching dashboard record. You may mention dashboard data when it genuinely improves the answer, but general advice should stand on its own.

The merchant's question may be informal or use mixed Hindi/English. Understand the intent, and answer naturally in the requested language. Give diverse, concrete suggestions rather than repeating the same generic referral/SMS advice. Where useful, structure the answer as 4-6 actionable points and explain what to measure or test.

If the question is clearly unrelated to running a merchant/business, give a short refusal. Otherwise, help.

DASHBOARD SNAPSHOT (use only when dashboard facts are requested):
${contextForPrompt(context)}

MERCHANT QUESTION:
${q}`;
  const aiText = await askGemini(prompt);
  if (aiText) return { language: lang, generatedBy: isDashboardQuestion ? "gemini" : "business-ai", answer: aiText };

  // 10. Gemini unavailable: still provide useful business advice for broad
  // merchant questions instead of falling back to the old dashboard-only text.
  if (GENERAL_MERCHANT_INTENT.test(q)) {
    return {
      language: lang,
      generatedBy: "business-advice",
      answer: t(
        lang,
        `For a merchant, start with the lever behind the question: acquisition (bring qualified customers), conversion (make checkout easier), recovery (retry temporary failures, offer another payment method, recover abandoned checkouts, and move repeated failures to human follow-up), and retention (give successful customers a reason to return). Test one change at a time and measure completed payments, recovered value, repeat purchases and cost per recovery.`,
        `Merchant business में पहले यह देखें कि problem किस lever की है: acquisition (qualified customers लाना), conversion (checkout आसान करना), recovery (temporary failures को सही समय पर retry करना, दूसरा payment method देना, abandoned checkout recover करना और repeated failures को human follow-up में भेजना) और retention (successful customers को दोबारा खरीदने का कारण देना)। एक समय में एक बदलाव test करें और completed payments, recovered value, repeat purchases और recovery cost measure करें।`
      ),
    };
  }

  return { language: lang, generatedBy: "off-topic", answer: offTopicDecline(lang) };
}
