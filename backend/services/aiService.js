import { GoogleGenAI } from "@google/genai";
import { decideActionByRules } from "./recoveryEngine.js";

const ALLOWED_ACTIONS = new Set([
  "retry",
  "sms",
  "priority_sms",
  "stop",
  "review",
]);

// Demo safety limit:
// Your current Gemini free-tier project has a 20-request limit.
// We intentionally use only 15 calls so there is a safety buffer.
const GEMINI_MAX_CALLS = 15;
let geminiCallsUsed = 0;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Ask Gemini to analyze a failed payment and recommend
 * the best recovery action + SMS copy.
 *
 * The first 15 eligible requests use Gemini.
 * After that, the deterministic rule engine is used.
 *
 * If Gemini fails for any reason (quota, network, API error,
 * invalid response, etc.), the rule engine safely takes over.
 */
export async function getAIDecision(payment, customer) {
  const prompt = buildPrompt(payment, customer);
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

  // ---------------------------------------------------------
  // DEMO AI CALL LIMIT
  // ---------------------------------------------------------
  if (geminiCallsUsed >= GEMINI_MAX_CALLS) {
    console.log(
      `[aiService] Gemini demo limit reached (${GEMINI_MAX_CALLS} calls). ` +
        "Using rule engine for remaining payments."
    );

    const fallback = decideActionByRules(payment);

    return {
      recommendedAction: fallback.action,

      reasoning:
        `[AI limit reached — using rules] ${fallback.reason}`,

      smsMessage: null,

      model: "rules-fallback",

      rawResponse: null,
    };
  }

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    // Count only actual Gemini attempts.
    geminiCallsUsed++;

    console.log(
      `[aiService] Gemini request ${geminiCallsUsed}/${GEMINI_MAX_CALLS}`
    );

    const response = await ai.models.generateContent({
      model,
      contents: prompt,

      config: {
        responseMimeType: "application/json",

        responseSchema: {
          type: "object",

          properties: {
            action: {
              type: "string",
              enum: [
                "retry",
                "sms",
                "priority_sms",
                "stop",
                "review",
              ],
            },

            reasoning: {
              type: "string",
            },

            sms_message: {
              type: "string",
            },
          },

          required: [
            "action",
            "reasoning",
            "sms_message",
          ],
        },

        maxOutputTokens: 300,
      },
    });

    const text = response.text?.trim();

    if (!text) {
      throw new Error("Gemini returned an empty response");
    }

    console.log("[aiService] Gemini response received");

    const parsed = JSON.parse(text);

    if (!ALLOWED_ACTIONS.has(parsed.action)) {
      throw new Error(
        `Gemini returned unsupported action: ${parsed.action}`
      );
    }

    // Safety rule:
    // Gemini must never override our retry limit.
    if (
      parsed.action === "retry" &&
      payment.retryCount >= 2
    ) {
      throw new Error(
        "Gemini recommended retry despite retry limit"
      );
    }

    return {
      recommendedAction: parsed.action,

      reasoning:
        parsed.reasoning ||
        "Gemini recommended this action based on the payment context.",

      smsMessage:
        parsed.sms_message?.trim() || null,

      model,

      rawResponse: text,
    };
  } catch (err) {
    console.error(
      "[aiService] Gemini call failed, falling back to rules:",
      err.message
    );

    const fallback = decideActionByRules(payment);

    return {
      recommendedAction: fallback.action,

      reasoning:
        `[fallback — Gemini unavailable] ${fallback.reason}`,

      smsMessage: null,

      model: "rules-fallback",

      rawResponse: null,
    };
  }
}

function buildPrompt(payment, customer) {
  return `
You are a payment recovery assistant for an Indian merchant using Razorpay.

Analyze the failed payment and select exactly one recovery action.

Customer:
Name: ${customer.name}
Previous successful payments: ${customer.successfulPaymentsCount}

Payment:
Amount: ₹${(payment.amount / 100).toFixed(2)}
Failure reason: ${payment.failureReason}
Retry attempts so far: ${payment.retryCount}

Allowed actions:
retry
sms
priority_sms
stop
review

Rules:
1. Never recommend retry when retryCount is 2 or more.
2. Use sms when a normal recovery message is appropriate.
3. Use priority_sms when urgent customer follow-up is appropriate.
4. Use stop when another recovery attempt is unlikely to succeed.
5. Use review when merchant intervention is required.
6. Keep reasoning to one short sentence.
7. If action is sms or priority_sms, sms_message must contain [RECOVERY_LINK].
8. Otherwise sms_message must be an empty string.

Return ONLY the structured response requested by the response schema.
Do not add explanations, markdown, or code fences.
`;
}