import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { getPublicPayment } from "../api/client";

const rupees = (paise) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// This is the page a customer actually lands on from the SMS/recovery link —
// no login required. It polls for status so if the merchant (or a real
// webhook) marks the payment recovered while the customer has this open,
// it flips to "received" live without a refresh.
export default function PayStatus() {
  const { paymentId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await getPublicPayment(paymentId);
      setData(res);
      if (res.status === "recovered" && pollRef.current) {
        clearInterval(pollRef.current);
      }
    } catch {
      setError("We couldn't find this payment. The link may have expired.");
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [paymentId]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 4000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  if (error) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-6">
        <div className="text-center text-ink/60">{error}</div>
      </div>
    );
  }

  if (!data) {
    return <div className="min-h-screen bg-paper flex items-center justify-center text-ink/40">Loading…</div>;
  }

  const recovered = data.status === "recovered";

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-black/5 shadow-soft p-8 text-center">
        <div className="text-xs font-medium text-ink/40 mb-6">{data.businessName}</div>

        {recovered ? (
          <>
            <div className="w-14 h-14 rounded-full bg-recovered/10 text-recovered flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={28} />
            </div>
            <div className="font-display text-xl font-bold text-recovered mb-1">Payment received</div>
            <div className="text-sm text-ink/50">
              {rupees(data.amount)} — thank you{data.customerName ? `, ${data.customerName}` : ""}.
            </div>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-full bg-gold/15 text-gold flex items-center justify-center mx-auto mb-4">
              <Clock size={28} />
            </div>
            <div className="font-display text-xl font-bold mb-1">
              Hi{data.customerName ? ` ${data.customerName}` : ""}, your payment didn't go through
            </div>
            <div className="text-2xl font-display font-bold text-ink my-3">{rupees(data.amount)}</div>
            <div className="text-sm text-ink/50 mb-6">You can complete it securely below.</div>

            {data.isLive && data.paymentLinkUrl ? (
              <a
                href={data.paymentLinkUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 bg-ink text-white px-5 py-3 rounded-xl font-medium text-sm hover:bg-ink/90 transition"
              >
                Pay now <ExternalLink size={14} />
              </a>
            ) : (
              <div className="text-xs text-ink/40 bg-black/[0.03] rounded-lg px-4 py-3">
                This is a demo recovery link — in production, a live Razorpay checkout would appear here.
              </div>
            )}

            <div className="text-xs text-ink/30 mt-6">This page updates automatically once payment is received.</div>
          </>
        )}
      </div>
    </div>
  );
}
