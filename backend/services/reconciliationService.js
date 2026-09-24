import Payment from "../models/Payment.js";
import ProviderTransaction from "../models/ProviderTransaction.js";
import Reconciliation from "../models/Reconciliation.js";
import AuditLog from "../models/AuditLog.js";

function normalizeStatus(paymentState) {
  if (["captured", "settled"].includes(paymentState)) return "captured";
  if (paymentState === "authorized") return "authorized";
  if (paymentState === "failed") return "failed";
  if (paymentState === "refunded") return "refunded";
  return paymentState || "unknown";
}

function compare(payment, provider) {
  if (!provider) {
    return { result: "missing_provider", detail: "Internal payment has no matching provider transaction." };
  }
  const amountMismatch = Number(payment.amount) !== Number(provider.amount);
  const statusMismatch = normalizeStatus(payment.paymentState) !== normalizeStatus(provider.status);
  if (amountMismatch) return { result: "amount_mismatch", detail: `Amount mismatch: internal ₹${(payment.amount / 100).toLocaleString("en-IN")} vs provider ₹${(provider.amount / 100).toLocaleString("en-IN")}.` };
  if (statusMismatch) return { result: "status_mismatch", detail: `Status mismatch: internal ${payment.paymentState} vs provider ${provider.status}.` };
  return { result: "matched", detail: "Amount and payment lifecycle status match the provider snapshot." };
}

export async function reconcileMerchant(merchantId) {
  const [payments, providers] = await Promise.all([
    Payment.find({ merchant: merchantId }),
    ProviderTransaction.find({ merchant: merchantId }),
  ]);

  await Reconciliation.deleteMany({ merchant: merchantId });

  const providerByPayment = new Map();
  for (const provider of providers) {
    if (provider.payment) providerByPayment.set(String(provider.payment), provider);
  }

  const results = [];
  for (const payment of payments) {
    const provider = providerByPayment.get(String(payment._id));
    const comparison = compare(payment, provider);
    results.push(await Reconciliation.create({
      merchant: merchantId,
      payment: payment._id,
      providerTransaction: provider?._id,
      result: comparison.result,
      internalAmount: payment.amount,
      providerAmount: provider?.amount,
      internalStatus: payment.paymentState,
      providerStatus: provider?.status,
      detail: comparison.detail,
    }));
  }

  const paymentIds = new Set(payments.map((p) => String(p._id)));
  for (const provider of providers) {
    if (!provider.payment || !paymentIds.has(String(provider.payment))) {
      results.push(await Reconciliation.create({
        merchant: merchantId,
        providerTransaction: provider._id,
        result: "missing_internal",
        providerAmount: provider.amount,
        providerStatus: provider.status,
        detail: "Provider transaction has no matching internal payment.",
      }));
    }
  }

  await AuditLog.create({
    merchant: merchantId,
    payment: payments[0]?._id,
    event: "reconciliation_run",
    detail: `Reconciliation checked ${payments.length} internal payments against ${providers.length} provider records.`,
    metadata: { internalCount: payments.length, providerCount: providers.length, resultCount: results.length },
  }).catch(async (err) => {
    if (err?.errors?.payment) {
      // AuditLog currently requires a payment. Keep reconciliation itself successful
      // even when there are no payments to attach to an audit row.
      return;
    }
    throw err;
  });

  return results;
}

export { normalizeStatus, compare };
