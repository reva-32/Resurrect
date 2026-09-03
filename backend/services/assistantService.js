import { GoogleGenAI } from "@google/genai";
import Payment from "../models/Payment.js";
import Customer from "../models/Customer.js";
import RecoveryAttempt from "../models/RecoveryAttempt.js";
import SMSLog from "../models/SMSLog.js";
import { getDashboardMetrics } from "./metricsService.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
let geminiUnavailable = false;

const LANGUAGE_NAMES = { en: "English", hi: "Hindi" };
const money = (paise) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function safeLanguage(language) {
  return language === "hi" ? "hi" : "en";
}

async function buildContext(merchantId) {
  const [metrics, payments, smsCount, attempts] = await Promise.all([
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
  ]);

  const customerMap = new Map();
  for (const payment of payments) {
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
    metrics: { ...metrics, smsSentCount: smsCount },
    payments: payments.map((p) => ({
      id: String(p._id),
      customer: p.customer?.name || "Unknown customer",
      amount: p.amount,
      status: p.status,
      failureReason: p.failureReason,
      retryCount: p.retryCount,
      failedAt: p.failedAt,
      recoveredAt: p.recoveredAt,
    })),
    attempts: attempts.map((a) => ({
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
  return JSON.stringify(context, null, 2);
}

function deterministicInsights(context, language) {
  const { metrics, customers } = context;
  const trend = metrics.analytics?.recoveryTrend || [];
  const strategy = metrics.analytics?.strategyPerformance || [];
  const recentFailed = trend.reduce((n, d) => n + d.failed, 0);
  const recentRecovered = trend.reduce((n, d) => n + d.recovered, 0);
  const best = [...strategy].sort((a, b) => {
    const ar = a.attempted ? a.successful / a.attempted : 0;
    const br = b.attempted ? b.successful / b.attempted : 0;
    return br - ar;
  })[0];
  const bestRate = best?.attempted ? Math.round((best.successful / best.attempted) * 100) : 0;
  const loyal = customers.find((c) => c.successfulPayments >= 2 && c.failedPayments > 0);

  if (language === "hi") {
    return {
      headline: `पिछले 7 दिनों में ${recentFailed} failed payments और ${recentRecovered} recoveries दर्ज हुईं।`,
      summary: `Dashboard में कुल recovered value ${money(metrics.totalRecovered)} है और recovery rate ${Math.round((metrics.recoveryRate || 0) * 100)}% है।`,
      chartExplanations: [
        `Recovery Funnel पूरे merchant dataset में failed payments से recovery actions और successful recovery attempts का flow दिखाता है।`,
        `Recovery Over Time केवल पिछले 7 दिनों में failedAt और recoveredAt पर आधारित daily movement दिखाता है।`,
        `Recovery by Strategy हर strategy के attempts और successful outcomes की तुलना करता है; एक payment पर एक से अधिक attempts हो सकते हैं।`,
      ],
      solution: best?.attempted
        ? `${best.strategy} अभी उपलब्ध strategies में ${bestRate}% success rate के साथ बेहतर perform कर रही है। पहले इसी तरह के failure cases पर इसे प्राथमिकता दें और कम-performing strategies के कारणों की समीक्षा करें।`
        : `अभी पर्याप्त recovery attempts नहीं हैं। पहले failed payments पर recovery चलाएँ, फिर strategy performance के आधार पर अगला action चुनें।`,
      opportunity: loyal
        ? `${loyal.name} जैसे repeat customers को priority recovery दें क्योंकि उनके ${loyal.successfulPayments} previous successful payments हैं।`
        : `Repeat-customer history बढ़ने पर loyal customers को priority recovery में रखें।`,
    };
  }

  return {
    headline: `${recentFailed} failed payments and ${recentRecovered} recoveries were recorded in the last 7 days.`,
    summary: `The dashboard shows ${money(metrics.totalRecovered)} in recovered value and a ${Math.round((metrics.recoveryRate || 0) * 100)}% recovery rate.`,
    chartExplanations: [
      `Recovery Funnel shows the merchant-wide flow from failed payments to recovery actions and successful recovery attempts.`,
      `Recovery Over Time shows daily failures and recoveries based on payment failedAt and recoveredAt timestamps for the last 7 days.`,
      `Recovery by Strategy compares attempts with successful outcomes for each strategy; one payment can have more than one recovery attempt.`,
    ],
    solution: best?.attempted
      ? `${best.strategy} currently has the strongest observed success rate at ${bestRate}%. Prioritize it for similar failure cases and review why lower-performing strategies are underperforming.`
      : `There are not enough recovery attempts to identify a reliable winning strategy yet. Run recovery on eligible failed payments and then compare the strategy outcomes.`,
    opportunity: loyal
      ? `Prioritize repeat customers such as ${loyal.name}: this customer has ${loyal.successfulPayments} previous successful payments and a current failed payment. That is a strong retention opportunity.`
      : `As repeat-customer history grows, prioritize loyal customers during recovery because protecting repeat revenue can improve retention.`,
  };
}

async function askGemini(prompt) {
  if (!process.env.GEMINI_API_KEY || geminiUnavailable) return null;
  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
      contents: prompt,
      config: { temperature: 0.1, maxOutputTokens: 1200 },
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
  const context = await buildContext(merchantId);
  const fallback = deterministicInsights(context, lang);

  const prompt = `You are Resurrect, a merchant payment-recovery copilot. Generate concise dashboard insights in ${LANGUAGE_NAMES[lang]} using ONLY the supplied JSON snapshot. Never invent, estimate, or infer a business fact that is not directly supported. Keep every numeric value exactly as supplied. Explain the three charts, describe the current scenario, give a concrete SOLUTION, and give one opportunity. If the data is insufficient for a claim, say so. Return plain text with exactly these headings: CURRENT SCENARIO, WHAT THE GRAPHS MEAN, SOLUTION, OPPORTUNITY.\n\nDASHBOARD SNAPSHOT:\n${contextForPrompt(context)}`;
  const aiText = await askGemini(prompt);

  return { language: lang, generatedBy: aiText ? "gemini" : "grounded-fallback", content: aiText || [fallback.headline, fallback.summary, "WHAT THE GRAPHS MEAN", ...fallback.chartExplanations, "SOLUTION", fallback.solution, "OPPORTUNITY", fallback.opportunity].join("\n\n"), data: context.metrics };
}

export async function askDashboardAssistant(merchantId, question, language = "en") {
  const lang = safeLanguage(language);
  const context = await buildContext(merchantId);
  const q = String(question || "").trim();
  if (!q) throw new Error("Question is required");

  // For direct stat questions, answer from the database snapshot without an LLM.
  const lower = q.toLowerCase();
  const m = context.metrics;
  if (/recovered|recovery rate|failed|sms|retry|retries|revenue at risk|risk/.test(lower)) {
    if (/how many|count|number/.test(lower) && /recover/.test(lower)) return { language: lang, generatedBy: "dashboard-data", answer: lang === "hi" ? `${m.recoveredPaymentCount || 0} unique payments recovered हैं।` : `${m.recoveredPaymentCount || 0} unique payments are recovered.` };
    if (/recovery rate/.test(lower)) return { language: lang, generatedBy: "dashboard-data", answer: lang === "hi" ? `Recovery rate ${Math.round((m.recoveryRate || 0) * 100)}% है।` : `The current recovery rate is ${Math.round((m.recoveryRate || 0) * 100)}%.` };
    if (/sms/.test(lower)) return { language: lang, generatedBy: "dashboard-data", answer: lang === "hi" ? `Dashboard में ${m.smsSentCount} SMS भेजे गए हैं।` : `The dashboard shows ${m.smsSentCount} SMS sent.` };
    if (/retry/.test(lower)) return { language: lang, generatedBy: "dashboard-data", answer: lang === "hi" ? `${m.retryAttemptsCount} retry attempts दर्ज हैं।` : `There are ${m.retryAttemptsCount} retry attempts.` };
    if (/revenue at risk|risk/.test(lower)) return { language: lang, generatedBy: "dashboard-data", answer: lang === "hi" ? `Current revenue at risk ${money(m.revenueAtRisk)} है।` : `Current revenue at risk is ${money(m.revenueAtRisk)}.` };
    if (/failed/.test(lower)) return { language: lang, generatedBy: "dashboard-data", answer: lang === "hi" ? `${m.totalFailedPayments} payments अभी recovered status में नहीं हैं।` : `${m.totalFailedPayments} payments are not currently in recovered status.` };
    return { language: lang, generatedBy: "dashboard-data", answer: lang === "hi" ? `Dashboard में recovered value ${money(m.totalRecovered)} है।` : `The dashboard shows ${money(m.totalRecovered)} in recovered value.` };
  }

  const prompt = `You are Resurrect's merchant AI copilot. Answer the merchant in ${LANGUAGE_NAMES[lang]} using ONLY this dashboard snapshot. This is a strict grounding rule: do not invent customers, amounts, trends, causes, dates, strategies, or business results. If the requested fact is not in the snapshot, explicitly say that the dashboard does not contain enough information. You may recommend actions only when they are clearly tied to observed data. Keep the answer brief (maximum 5 bullets or 120 words). For business advice, state the observed data first and then the recommendation.\n\nDASHBOARD SNAPSHOT:\n${contextForPrompt(context)}\n\nMERCHANT QUESTION:\n${q}`;
  const aiText = await askGemini(prompt);
  if (aiText) return { language: lang, generatedBy: "gemini-grounded", answer: aiText };

  const fallback = deterministicInsights(context, lang);
  return {
    language: lang,
    generatedBy: "grounded-fallback",
    answer: lang === "hi"
      ? `मैं केवल dashboard के उपलब्ध data पर जवाब दे सकता हूँ। वर्तमान स्थिति: ${fallback.summary} समाधान: ${fallback.solution}`
      : `I can only answer from the dashboard data available. Current situation: ${fallback.summary} Solution: ${fallback.solution}`,
  };
}
