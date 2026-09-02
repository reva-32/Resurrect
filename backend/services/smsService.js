import SMSLog from "../models/SMSLog.js";

/**
 * Sends (or mocks) an SMS. Mock mode is the default — controlled entirely by
 * SMS_MOCK_MODE in .env — so the demo never depends on DLT/provider approval
 * landing in time. Flip SMS_MOCK_MODE=false once a real provider + template
 * are approved.
 */
export async function sendRecoverySMS({ merchant, payment, customer, message, recoveryLink }) {
  const mockMode = process.env.SMS_MOCK_MODE !== "false";

  const finalMessage = message.replace("[RECOVERY_LINK]", recoveryLink);

  if (mockMode) {
    console.log(`\n[SMS - MOCK] To: ${customer.phone}\n${finalMessage}\n`);
    const log = await SMSLog.create({
      merchant,
      payment: payment._id,
      customer: customer._id,
      message: finalMessage,
      recoveryLink,
      mode: "mock",
      status: "delivered", // mock always "succeeds" so the rest of the flow can be demoed
      providerResponse: "mock mode — logged only, not actually sent",
    });
    return log;
  }

  // --- Real provider integration goes here once SMS_PROVIDER + SMS_API_KEY are set ---
  // Example shape (adapt to whichever provider you land on, e.g. MSG91/Twilio):
  //
  // const res = await axios.post(PROVIDER_URL, {...}, { headers: {...} });
  //
  // For now this throws so you notice immediately if SMS_MOCK_MODE=false without
  // a real provider wired up yet.
  throw new Error(
    "SMS_MOCK_MODE is false but no real provider is wired up yet — implement the provider call in smsService.js"
  );
}
