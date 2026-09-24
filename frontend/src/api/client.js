import axios from "axios";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

// Attach the merchant's JWT (if present) to every request.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("rra_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// --- Auth ---
export const signup = (payload) => client.post("/auth/signup", payload).then((r) => r.data);
export const login = (payload) => client.post("/auth/login", payload).then((r) => r.data);
export const getMe = () => client.get("/auth/me").then((r) => r.data);

// --- Dashboard / payments / recovery ---
export const getMetrics = () => client.get("/dashboard/metrics").then((r) => r.data);
export const getInsights = (language = "en") => client.get("/dashboard/insights", { params: { language } }).then((r) => r.data);
export const askAssistant = (question, language = "en") => client.post("/dashboard/assistant", { question, language }).then((r) => r.data);
export const seedData = (payload = {}) => client.post("/dashboard/seed", payload).then((r) => r.data);
export const getPayments = (status) =>
  client.get("/payments", { params: status ? { status } : {} }).then((r) => r.data);
export const getPayment = (id) => client.get(`/payments/${id}`).then((r) => r.data);
export const runRecoveryBulk = (useAI = true) =>
  client.post("/recovery/run", { useAI }).then((r) => r.data);
export const runRecoveryOne = (paymentId, { useAI = true, createRealLink = false } = {}) =>
  client.post(`/recovery/${paymentId}/run`, { useAI, createRealLink }).then((r) => r.data);

export default client;

// --- Public (no auth) — customer-facing ---
export const getPublicPayment = (id) => client.get(`/public/payments/${id}`).then((r) => r.data);
export const markPaymentViewed = (id) => client.post(`/public/payments/${id}/viewed`).catch(() => {});

// --- Settings / onboarding status ---
export const getSettingsStatus = () => client.get("/settings/status").then((r) => r.data);

// --- B2B / receivables ---
export const getReceivablesSummary = () => client.get("/receivables/summary").then((r) => r.data);
export const getInvoices = (status) => client.get("/receivables/invoices", { params: status ? { status } : {} }).then((r) => r.data);
export const createBusinessCustomer = (payload) => client.post("/receivables/customers", payload).then((r) => r.data);
export const createInvoice = (payload) => client.post("/receivables/invoices", payload).then((r) => r.data);
export const runInvoiceRecovery = (id) => client.post(`/receivables/invoices/${id}/recover`).then((r) => r.data);
export const recordInvoicePayment = (id, amount) => client.post(`/receivables/invoices/${id}/payment`, { amount }).then((r) => r.data);
export const seedReceivables = (force = false) => client.post("/receivables/seed", { force }).then((r) => r.data);

export const updateBusinessType = (businessType) => client.put("/settings/business-type", { businessType }).then((r) => r.data);

// --- Fintech operations / reconciliation ---
export const getReconciliationSummary = () => client.get("/reconciliation/summary").then((r) => r.data);
export const getReconciliationResults = () => client.get("/reconciliation/results").then((r) => r.data);
export const runReconciliation = () => client.post("/reconciliation/run").then((r) => r.data);
export const seedReconciliationProviderData = () => client.post("/reconciliation/seed").then((r) => r.data);
