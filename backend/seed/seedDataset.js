// Generates a compact, realistic synthetic dataset for the payment
// recovery demo.
//
// Synthetic data:
//   - 15 failed payments
//   - Customers, amounts, failure reasons and payment history are dynamic
//
// Real demo data:
//   - ONE real demo customer
//   - ONE ₹5,000 failed payment for the live Razorpay Payment Link flow
//
// Usage:
//   npm run seed
//
// Set DEMO_PHONE / DEMO_NAME in backend/.env before running.
//
// NEVER commit your real phone number.
// DEMO_PHONE stays in .env, which is gitignored.

import dotenv from "dotenv";
import mongoose from "mongoose";

import { connectDB } from "../config/db.js";
import Customer from "../models/Customer.js";
import Payment, {
  FAILURE_REASON_VALUES,
} from "../models/Payment.js";

dotenv.config();

const FIRST_NAMES = [
  "Rahul",
  "Priya",
  "Amit",
  "Sneha",
  "Vikram",
  "Anjali",
  "Rohan",
  "Neha",
  "Karan",
  "Divya",
  "Arjun",
  "Pooja",
  "Suresh",
  "Kavya",
  "Manish",
];

const LAST_NAMES = [
  "Sharma",
  "Verma",
  "Patel",
  "Iyer",
  "Reddy",
  "Nair",
  "Gupta",
  "Singh",
  "Rao",
  "Mehta",
  "Kulkarni",
  "Joshi",
];

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

function generatePhone(index) {
  return `+9190000${String(1000 + index).slice(-4)}`;
}

function generateSuccessfulPaymentsCount() {
  const probability = Math.random();

  if (probability < 0.15) {
    return 0;
  }

  if (probability < 0.35) {
    return randomInt(1, 2);
  }

  if (probability < 0.75) {
    return randomInt(3, 5);
  }

  return randomInt(6, 10);
}

function generateFailureReason() {
  // Always use the enum defined by Payment.js.
  // This prevents the seed data from becoming inconsistent
  // with the actual database schema.
  return randomFrom(FAILURE_REASON_VALUES);
}

function generateAmountPaise() {
  const bucket = Math.random();

  let rupees;

  if (bucket < 0.50) {
    // ₹500 – ₹5,000
    rupees = randomInt(500, 5000);
  } else if (bucket < 0.85) {
    // ₹5,001 – ₹25,000
    rupees = randomInt(5001, 25000);
  } else if (bucket < 0.97) {
    // ₹25,001 – ₹75,000
    rupees = randomInt(25001, 75000);
  } else {
    // ₹75,001 – ₹1,00,000
    rupees = randomInt(75001, 100000);
  }

  return rupees * 100;
}

function generateRetryCount() {
  const probability = Math.random();

  if (probability < 0.65) {
    return 0;
  }

  if (probability < 0.90) {
    return 1;
  }

  return 2;
}

function generateFailedAt() {
  const daysAgo = randomInt(0, 13);
  const hoursAgo = randomInt(0, 23);
  const minutesAgo = randomInt(0, 59);

  const millisecondsAgo =
    (((daysAgo * 24 + hoursAgo) * 60 + minutesAgo) *
      60 *
      1000);

  return new Date(Date.now() - millisecondsAgo);
}

async function seed() {
  await connectDB();

  console.log("[seed] clearing existing synthetic data...");

  // Remove old synthetic payments.
  await Payment.deleteMany({
    isSynthetic: true,
  });

  // Remove old synthetic customers.
  // The real demo customer is preserved.
  await Customer.deleteMany({
    isDemoCustomer: { $ne: true },
  });

  console.log(
    `[seed] creating ${SYNTHETIC_PAYMENT_COUNT} dynamic synthetic failed payments...`
  );

  const paymentDocs = [];

  for (let i = 0; i < SYNTHETIC_PAYMENT_COUNT; i++) {
    const customer = await Customer.create({
      name: generateName(),

      phone: generatePhone(i),

      successfulPaymentsCount:
        generateSuccessfulPaymentsCount(),

      isDemoCustomer: false,
    });

    paymentDocs.push({
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

  console.log(
    `[seed] inserted ${paymentDocs.length} synthetic failed payments.`
  );

  // ---------------------------------------------------------
  // REAL DEMO CUSTOMER
  // ---------------------------------------------------------

  const demoPhone = process.env.DEMO_PHONE;
  const demoName =
    process.env.DEMO_NAME || "Demo Customer";

  if (!demoPhone) {
    console.warn(
      "[seed] DEMO_PHONE not set in .env — skipping real demo customer."
    );

    console.warn(
      "[seed] Add DEMO_PHONE=+91XXXXXXXXXX to backend/.env and re-run seed."
    );
  } else {
    const existingDemo = await Customer.findOne({
      isDemoCustomer: true,
    });

    if (existingDemo) {
      await Payment.deleteMany({
        customer: existingDemo._id,
      });
    }

    const demoCustomer =
      await Customer.findOneAndUpdate(
        { isDemoCustomer: true },
        {
          name: demoName,
          phone: demoPhone,
          isDemoCustomer: true,
          successfulPaymentsCount: 3,
        },
        {
          upsert: true,
          new: true,
        }
      );

    await Payment.create({
      customer: demoCustomer._id,

      // ₹5,000 = 500,000 paise
      amount: 500000,

      status: "failed",

      // This value exists in Payment.js.
      failureReason: "bank_timeout",

      retryCount: 0,

      // This is the real Razorpay demo payment.
      isSynthetic: false,
    });

    console.log(
      `[seed] created real demo customer (${demoName}) with one ₹5,000 failed payment.`
    );
  }

  console.log("[seed] done.");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});