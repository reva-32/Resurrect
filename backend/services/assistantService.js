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
    re: /customer relationship|retain customers?|customer retention|loyal(ty)? customers?|repeat customers?|ग्राहक.*(संबंध|बनाए रखना|loyalty)|customer loyalty/i,
    en: "Strong customer relationships come from clear, honest communication (especially around a failed payment), a quick response when something goes wrong, small personal touches like using their name, and rewarding loyalty — e.g. priority support or a small discount for customers who've paid successfully before. On recovery specifically, treating loyal/repeat customers with a courteous personal follow-up instead of repeated automated SMS tends to protect the relationship far better than pure automation.",
    hi: "मजबूत ग्राहक संबंध साफ़ और ईमानदार संवाद से बनते हैं (खासकर payment fail होने पर), गड़बड़ी होने पर तेज़ response से, नाम से बुलाने जैसे छोटे personal touches से, और loyalty को reward करने से — जैसे पहले successful payments कर चुके ग्राहकों को priority support या छोटी discount देना। Recovery में, loyal/repeat ग्राहकों के साथ बार-बार automated SMS की जगह विनम्र personal follow-up रिश्ते को बेहतर बनाए रखता है।",
  },
  {
    key: "customer_reach_growth",
    re: /customer reach|increase (my )?reach|grow(ing)? (my )?customers?|new customers?|customer acquisition|marketing|ग्राहक.*(बढ़ाना|reach|पहुंच)|नए ग्राहक/i,
    en: "To grow reach: lean on channels your existing paying customers already trust — referrals, WhatsApp/SMS updates, and reviews from customers whose payments you successfully recovered (they're already warm leads). Pair that with clear, simple checkout (fewer failed/abandoned payments means more of the traffic you already have converts), and consistent, low-friction follow-up messaging rather than one-off blasts.",
    hi: "Reach बढ़ाने के लिए: उन channels का उपयोग करें जिन पर आपके मौजूदा ग्राहक पहले से भरोसा करते हैं — referrals, WhatsApp/SMS updates, और उन ग्राहकों के reviews जिनका payment आपने successfully recover किया (वे पहले से warm leads हैं)। साथ ही checkout को साफ और आसान रखें (कम failed/abandoned payments का मतलब है मौजूदा traffic से ज़्यादा conversion), और एक बार के message की जगह लगातार, कम-friction वाला follow-up रखें।",
  },
  {
    key: "trust_credibility",
    re: /\btrust\b|credibilit|trustworthy|ग्राहकों का भरोसा|विश्वास|भरोसा/i,
    en: "Trust is built by being transparent about what happened and why (e.g. telling a customer plainly that their card was declined, not just that \"something went wrong\"), never over-messaging, using your verified business name/number consistently on every recovery SMS or link, and following through — if you say a link is safe, make sure it actually goes to a branded, secure checkout page.",
    hi: "भरोसा तब बनता है जब आप साफ़-साफ़ बताते हैं कि क्या हुआ और क्यों (जैसे यह बताना कि card decline हुआ, सिर्फ \"कुछ गड़बड़ हुई\" नहीं), बहुत ज़्यादा messages न भेजें, हर recovery SMS/link पर अपना verified business नाम/नंबर लगातार इस्तेमाल करें, और जो कहें वह निभाएँ — अगर कहा कि link safe है, तो वह वाकई branded, secure checkout page पर ले जाए।",
  },
  {
    key: "communication_reminders",
    re: /communicat(e|ion)|reminder message|message (customers?|template)|sms (best|tips|copy)|संवाद|reminder कैसे/i,
    en: "For payment-recovery communication: keep messages short, name the specific issue (insufficient funds, card declined, etc.) rather than being vague, always include one clear link/action, avoid sending the same reminder repeatedly in a short window, and match the tone to the failure — a gentle nudge for an abandoned checkout, a more direct manual message once a payment has failed multiple times.",
    hi: "Payment-recovery messages के लिए: छोटे रखें, vague होने के बजाय exact issue बताएं (insufficient funds, card declined, आदि), हमेशा एक clear link/action दें, कम समय में बार-बार वही reminder न भेजें, और tone को failure के हिसाब से रखें — abandoned checkout के लिए हल्का nudge, कई बार fail होने पर ज़्यादा direct manual message।",
  },
  {
    key: "refunds_disputes",
    re: /refund|dispute|chargeback|रिफंड|विवाद/i,
    en: "For refunds/disputes: respond quickly and acknowledge the issue before debating it, keep the process as simple as the original payment, and document every step (this dashboard's audit trail is useful here) so there's a clear record if a dispute is escalated. Being fast and fair on refunds tends to protect long-term customer trust more than winning any single dispute.",
    hi: "Refunds/disputes के लिए: जल्दी respond करें और बहस से पहले समस्या को स्वीकार करें, process को original payment जितना ही सरल रखें, और हर step को document करें (इसके लिए dashboard का audit trail काम आता है) ताकि dispute बढ़ने पर स्पष्ट record रहे। Refunds में तेज़ और निष्पक्ष रहना किसी एक dispute जीतने से ज़्यादा long-term ग्राहक भरोसा बचाता है।",
  },
  {
    key: "pricing_discounts",
    re: /pricing|discount|price (strategy|psychology)|upsell|cross[- ]?sell|मूल्य|छूट/i,
    en: "On pricing/discounts: use small, targeted incentives (like a modest discount on the recovery link itself) sparingly for high-value or repeat customers rather than broadly — it protects margins while still nudging a stuck payment through. Round, simple prices and clearly showing the original vs. discounted amount tend to convert better than complex tiered pricing.",
    hi: "Pricing/discounts के लिए: छोटे, targeted incentives (जैसे recovery link पर हल्की discount) सिर्फ high-value या repeat ग्राहकों के लिए इस्तेमाल करें, सबके लिए नहीं — इससे margin भी बचता है और अटका payment भी आगे बढ़ता है। Round, सरल prices और original vs discounted amount साफ़ दिखाना, जटिल tiered pricing से बेहतर convert करता है।",
  },
  {
    key: "customer_support",
    re: /customer support|customer service|handle complaints?|ग्राहक सहायता|शिकायत/i,
    en: "For support: prioritize responses for high-value or repeat customers with a failed/stuck payment (they're the most retention-sensitive), give support staff visibility into why a payment failed so they don't ask the customer to repeat information, and close the loop — let the customer know once their payment is actually confirmed recovered, not just that a link was sent.",
    hi: "Support के लिए: high-value या repeat ग्राहकों के stuck/failed payment को प्राथमिकता दें (वे सबसे ज़्यादा retention-sensitive होते हैं), support staff को यह दिखाई दे कि payment क्यों fail हुआ ताकि ग्राहक से दोबारा वही जानकारी न पूछनी पड़े, और loop बंद करें — ग्राहक को तभी बताएं जब payment वाकई recovered confirm हो जाए, सिर्फ link भेजने पर नहीं।",
  },
];

function businessTopicAnswer(question, language) {
  const topic = BUSINESS_TOPICS.find((b) => b.re.test(question));
  if (!topic) return null;
  return topic[language] || topic.en;
}

// A conservative, deterministic guess at whether a question is on-topic for
// this assistant (dashboard data OR general merchant business advice) versus
// unrelated to running the merchant's business entirely. Used only when
// Gemini is unavailable — when Gemini IS available, it does this judgment
// call itself (it's far better at handling arbitrary phrasing), and this is
// just the safety net for the offline fallback.
const ON_TOPIC_HINTS = /payment|recovery|customer|merchant|business|dashboard|revenue|refund|checkout|sms|strategy|reach|market|price|discount|support|trust|loyal|retain|churn|complaint|dispute|भुगतान|ग्राहक|व्यापार|व्यवसाय|राजस्व/i;

function offTopicDecline(language) {
  return t(
    language,
    "I can only help with this recovery dashboard or general merchant-business questions — things like customer relationships, growing customer reach, communication, refunds, or pricing. Try asking one of those instead.",
    "मैं केवल इस recovery dashboard या सामान्य merchant-business सवालों में मदद कर सकता हूँ — जैसे customer relationships, customer reach बढ़ाना, communication, refunds, या pricing। इनमें से कोई सवाल पूछें।"
  );
}

function reasonSpecificAnswer(context, reason, language) {
  const entry = context.failureBreakdown.find((f) => f.reason === reason);
  const label = failureLabel(reason, language);
  const advice = recommendedAction({ failureReason: reason, repeatedFailures: false }, language);
  if (!entry) {
    return t(
      language,
      `No currently-failing payments have "${label}" as the reason right now. General guidance for this failure type: ${advice}`,
      `अभी किसी भी failed payment का कारण "${label}" नहीं है। इस failure type के लिए सामान्य सलाह: ${advice}`
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

  // 9. Open-ended — grounded Gemini. It can do two things: (a) answer further
  // dashboard-data questions using ONLY the supplied snapshot, never inventing
  // a customer/amount/ranking, or (b) answer general merchant-business
  // questions (customer relationships, growing reach, communication, refunds,
  // pricing, support, trust) with genuine practical guidance. Anything outside
  // those two — entertainment, trivia, sports, general knowledge unrelated to
  // running this business — must be politely declined, not guessed at.
  const prompt = `You are Resurrect's merchant AI copilot for a payment-recovery dashboard. Reply in ${LANGUAGE_NAMES[lang]}. The merchant may ask two kinds of legitimate questions:

(a) Questions about THIS dashboard's data (failures, recoveries, priorities, strategies, revenue) — answer these using ONLY the supplied JSON snapshot below. This is a strict grounding rule: do not invent customers, amounts, trends, causes, dates, strategies, or business results. If asked to rank or prioritize customers/payments, use ONLY the supplied "priorityQueue" (already ranked by the backend) — do not compute your own ranking or substitute different names. If the requested fact is not in the snapshot, explicitly say the dashboard does not contain enough information.

(b) General business questions relevant to running an online payments/e-commerce business — for example customer relationships, customer retention, growing customer reach, marketing, communication/reminders, refunds, disputes, pricing, or customer support. For these, answer with genuine, practical business guidance from general knowledge. You may reference the merchant's actual dashboard data as supporting context if relevant, but it isn't required.

Politely DECLINE anything outside those two categories — general trivia, entertainment, celebrities, sports, current events, or any topic unrelated to running this merchant's payments/recovery business. Keep a decline brief and suggest the kind of question you can help with instead.

Never use CIBIL scores, credit scores, bank statements, or any external financial data — none of that is available or permitted. Keep every answer brief (maximum 6 bullets or ~130 words).

DASHBOARD SNAPSHOT:
${contextForPrompt(context)}

MERCHANT QUESTION:
${q}`;
  const aiText = await askGemini(prompt);
  if (aiText) return { language: lang, generatedBy: "gemini-grounded", answer: aiText };

  // 10. Gemini unavailable. Only answer deterministically when the question at
  // least looks on-topic (dashboard/business keywords) — otherwise decline
  // rather than guessing, since without Gemini there's no reliable way to
  // classify arbitrary phrasing as on- or off-topic. Never empty either way.
  if (ON_TOPIC_HINTS.test(q)) {
    const sections = deterministicInsights(context, lang);
    return {
      language: lang,
      generatedBy: "grounded-fallback",
      answer: t(
        lang,
        `I can only answer from the dashboard data available right now. ${sections.whatHappened} ${sections.whatNext}`,
        `मैं अभी केवल dashboard के उपलब्ध data पर जवाब दे सकता हूँ। ${sections.whatHappened} ${sections.whatNext}`
      ),
    };
  }

  return { language: lang, generatedBy: "off-topic", answer: offTopicDecline(lang) };
}
