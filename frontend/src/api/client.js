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

// --- Settings / onboarding status ---
export const getSettingsStatus = () => client.get("/settings/status").then((r) => r.data);
