// Shared seeding logic — used both by the CLI script (backend/seed/seedDataset.js)
// and by the "Add Data" button in the dashboard (POST /api/dashboard/seed).
// Everything created here is scoped to a single merchantId, so different
// merchant accounts never see each other's synthetic data.

import Customer from "../models/Customer.js";
import Payment, { FAILURE_REASON_VALUES } from "../models/Payment.js";

const FIRST_NAMES = ["Rahul", "Priya", "Amit", "Sneha", "Vikram", "Anjali", "Rohan", "Neha", "Karan", "Divya", "Arjun", "Pooja", "Suresh", "Kavya", "Manish"];
const LAST_NAMES = ["Sharma", "Verma", "Patel", "Iyer", "Reddy", "Nair", "Gupta", "Singh", "Rao", "Mehta", "Kulkarni", "Joshi"];
const SYNTHETIC_PAYMENT_COUNT = 15;

function randomFrom(array) {
  return array[Math.floor(Math.random() * array.length)];
}
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function generateName() {
  return `${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}`;
}
function generatePhone(seedSuffix) {
  return `+9190000${String(1000 + seedSuffix).slice(-4)}`;
}
function generateSuccessfulPaymentsCount() {
  const p = Math.random();
  if (p < 0.15) return 0;
  if (p < 0.35) return randomInt(1, 2);
  if (p < 0.75) return randomInt(3, 5);
  return randomInt(6, 10);
}
function generateFailureReason() {
  return randomFrom(FAILURE_REASON_VALUES);
}
function generateAmountPaise() {
  const bucket = Math.random();
  let rupees;
  if (bucket < 0.5) rupees = randomInt(500, 5000);
  else if (bucket < 0.85) rupees = randomInt(5001, 25000);
  else if (bucket < 0.97) rupees = randomInt(25001, 75000);
  else rupees = randomInt(75001, 100000);
  return rupees * 100;
}
function generateRetryCount() {
  const p = Math.random();
  if (p < 0.65) return 0;
  if (p < 0.9) return 1;
  return 2;
}
function generateFailedAt() {
  const daysAgo = randomInt(0, 13);
  const hoursAgo = randomInt(0, 23);
  const minutesAgo = randomInt(0, 59);
  const msAgo = ((daysAgo * 24 + hoursAgo) * 60 + minutesAgo) * 60 * 1000;
  return new Date(Date.now() - msAgo);
}

export async function seedForMerchant(merchantId, { demoPhone, demoName, count = SYNTHETIC_PAYMENT_COUNT } = {}) {
  // Clear this merchant's OWN previous synthetic data only — never touches
  // other merchants' documents.
  await Payment.deleteMany({ merchant: merchantId, isSynthetic: true });
  await Customer.deleteMany({ merchant: merchantId, isDemoCustomer: { $ne: true } });

  const paymentDocs = [];
  for (let i = 0; i < count; i++) {
    const customer = await Customer.create({
      merchant: merchantId,
      name: generateName(),
      phone: generatePhone(i),
      successfulPaymentsCount: generateSuccessfulPaymentsCount(),
      isDemoCustomer: false,
    });

    paymentDocs.push({
      merchant: merchantId,
      customer: customer._id,
      amount: generateAmountPaise(),
      status: "failed",
      failureReason: generateFailureReason(),
      retryCount: generateRetryCount(),
      isSynthetic: true,
      failedAt: generateFailedAt(),
    });
  }
  await Payment.insertMany(paymentDocs);

  let demoCreated = false;
  const resolvedPhone = demoPhone || process.env.DEMO_PHONE;
  const resolvedName = demoName || process.env.DEMO_NAME || "Demo Customer";

  if (resolvedPhone) {
    const existingDemo = await Customer.findOne({ merchant: merchantId, isDemoCustomer: true });
    if (existingDemo) {
      await Payment.deleteMany({ merchant: merchantId, customer: existingDemo._id });
    }

    const demoCustomer = await Customer.findOneAndUpdate(
      { merchant: merchantId, isDemoCustomer: true },
      { merchant: merchantId, name: resolvedName, phone: resolvedPhone, isDemoCustomer: true, successfulPaymentsCount: 3 },
      { upsert: true, new: true }
    );

    const demoAmountRupees = Math.max(1, Number(process.env.DEMO_AMOUNT_RUPEES) || 5);

    await Payment.create({
      merchant: merchantId,
      customer: demoCustomer._id,
      amount: demoAmountRupees * 100, // configurable demo amount, defaults to ₹5
      status: "failed",
      failureReason: "bank_timeout",
      retryCount: 0,
      isSynthetic: false,
    });
    demoCreated = true;
  }

  return { syntheticCount: paymentDocs.length, demoCreated };
}
