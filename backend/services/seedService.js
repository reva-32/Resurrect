// Shared seeding logic — used both by the CLI script (backend/seed/seedDataset.js)
// and by the "Add Data" button in the dashboard (POST /api/dashboard/seed).
// Everything created here is scoped to a single merchantId, so different
// merchant accounts never see each other's synthetic data.

import Customer from "../models/Customer.js";
import Payment, { FAILURE_REASON_VALUES } from "../models/Payment.js";
import TrainingRecord from "../models/TrainingRecord.js";

const FIRST_NAMES = ["Rahul", "Priya", "Amit", "Sneha", "Vikram", "Anjali", "Rohan", "Neha", "Karan", "Divya", "Arjun", "Pooja", "Suresh", "Kavya", "Manish"];
const LAST_NAMES = ["Sharma", "Verma", "Patel", "Iyer", "Reddy", "Nair", "Gupta", "Singh", "Rao", "Mehta", "Kulkarni", "Joshi"];
const SYNTHETIC_PAYMENT_COUNT = 100;
const SYNTHETIC_TRAINING_RECORD_COUNT = 1000;

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

const PAYMENT_METHODS = ["card", "upi", "netbanking", "wallet"];

function generatePaymentMethod() {
  return randomFrom(PAYMENT_METHODS);
}

function generateCustomerHistory() {
  return randomInt(0, 12);
}

function generatePreviousFailures() {
  return randomInt(0, 4);
}

function generateTimeSinceFailureMinutes() {
  return randomInt(5, 7 * 24 * 60);
}

function calculateSyntheticRecoveryProbability({ amount, failureReason, retryCount, customerHistory, previousFailures, timeSinceFailureMinutes }) {
  let probability = 0.58;

  const reasonEffect = {
    bank_timeout: 0.16,
    network_error: 0.12,
    checkout_abandoned: 0.02,
    otp_failed: -0.04,
    insufficient_funds: -0.10,
    card_declined: -0.14,
    unknown: -0.05,
  };

  probability += reasonEffect[failureReason] ?? 0;
  probability -= retryCount * 0.10;
  probability += Math.min(customerHistory, 8) * 0.025;
  probability -= previousFailures * 0.035;

  if (amount < 100000) probability += 0.03;
  else if (amount > 5000000) probability -= 0.04;

  if (timeSinceFailureMinutes > 48 * 60) probability -= 0.06;
  else if (timeSinceFailureMinutes < 60) probability += 0.03;

  return Math.max(0.08, Math.min(0.92, probability));
}

function generateTrainingRecord(merchantId) {
  const amount = generateAmountPaise();
  const failureReason = generateFailureReason();
  const retryCount = generateRetryCount();
  const customerHistory = generateCustomerHistory();
  const previousFailures = generatePreviousFailures();
  const timeSinceFailureMinutes = generateTimeSinceFailureMinutes();
  const probability = calculateSyntheticRecoveryProbability({
    amount, failureReason, retryCount, customerHistory, previousFailures, timeSinceFailureMinutes,
  });

  return {
    merchant: merchantId,
    amount,
    paymentMethod: generatePaymentMethod(),
    failureReason,
    retryCount,
    timeSinceFailureMinutes,
    customerHistory,
    previousFailures,
    recovered: Math.random() < probability,
    dataSource: "synthetic",
  };
}

function generateFailedAt() {
  const daysAgo = randomInt(0, 13);
  const hoursAgo = randomInt(0, 23);
  const minutesAgo = randomInt(0, 59);
  const msAgo = ((daysAgo * 24 + hoursAgo) * 60 + minutesAgo) * 60 * 1000;
  return new Date(Date.now() - msAgo);
}

export async function seedForMerchant(merchantId, { demoPhone, demoName, count = SYNTHETIC_PAYMENT_COUNT, trainingCount = SYNTHETIC_TRAINING_RECORD_COUNT, force = false } = {}) {
  // Seed once per merchant. Restarts, logins, dashboard refreshes, and repeated
  // seed requests must not regenerate or overwrite the merchant's dataset.
  const existingSyntheticCount = await Payment.countDocuments({ merchant: merchantId, isSynthetic: true });
  const existingTrainingCount = await TrainingRecord.countDocuments({ merchant: merchantId, dataSource: "synthetic" });
  if (!force && existingSyntheticCount >= count && existingTrainingCount >= trainingCount) {
    const existingDemo = await Customer.exists({ merchant: merchantId, isDemoCustomer: true });
    return { syntheticCount: existingSyntheticCount, trainingCount: existingTrainingCount, demoCreated: Boolean(existingDemo), alreadyInitialized: true };
  }

  // A forced re-seed is an explicit development/admin operation. It only ever
  // touches this merchant's own synthetic data.
  if (force) {
    await Payment.deleteMany({ merchant: merchantId, isSynthetic: true });
    await Customer.deleteMany({ merchant: merchantId, isDemoCustomer: false });
    await TrainingRecord.deleteMany({ merchant: merchantId, dataSource: "synthetic" });
  }

  const paymentsToCreate = Math.max(0, count - existingSyntheticCount);
  const paymentDocs = [];
  for (let i = 0; i < paymentsToCreate; i++) {
    const customer = await Customer.create({
      merchant: merchantId,
      name: generateName(),
      phone: generatePhone(i),
      successfulPaymentsCount: generateSuccessfulPaymentsCount(),
      previousFailures: generatePreviousFailures(),
      isDemoCustomer: false,
    });

    paymentDocs.push({
      merchant: merchantId,
      customer: customer._id,
      amount: generateAmountPaise(),
      paymentMethod: generatePaymentMethod(),
      status: "failed",
      failureReason: generateFailureReason(),
      retryCount: generateRetryCount(),
      isSynthetic: true,
      dataSource: "synthetic",
      failedAt: generateFailedAt(),
    });
  }
  if (paymentDocs.length > 0) {
    await Payment.insertMany(paymentDocs);
  }

  const trainingRecordsToCreate = Math.max(0, trainingCount - existingTrainingCount);
  if (trainingRecordsToCreate > 0) {
    const trainingDocs = Array.from({ length: trainingRecordsToCreate }, () => generateTrainingRecord(merchantId));
    await TrainingRecord.insertMany(trainingDocs);
  }

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
      dataSource: "razorpay_test",
    });
    demoCreated = true;
  }

  const finalTrainingCount = await TrainingRecord.countDocuments({ merchant: merchantId, dataSource: "synthetic" });
  return { syntheticCount: paymentDocs.length, trainingCount: finalTrainingCount, demoCreated, alreadyInitialized: false };
}
