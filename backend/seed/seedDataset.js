// CLI seeding — mainly useful for local testing outside the browser. In the
// app itself, use the "Add Data" button on the dashboard instead, which
// calls the same seedForMerchant() logic scoped to whichever merchant is
// logged in.
//
// This script seeds for the FIRST merchant account it finds (or the one
// matching SEED_MERCHANT_EMAIL in .env, if set) — sign up in the app first.
//
// Usage:
//   node seed/seedDataset.js
//
// Set DEMO_PHONE / DEMO_NAME in backend/.env to also create the one real
// demo customer used for the live Razorpay flow. Never commit your real
// phone number — DEMO_PHONE stays in .env, which is gitignored.

import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import { seedForMerchant } from "../services/seedService.js";

dotenv.config();

async function run() {
  await connectDB();

  const query = process.env.SEED_MERCHANT_EMAIL
    ? { email: process.env.SEED_MERCHANT_EMAIL.toLowerCase() }
    : {};
  const merchant = await User.findOne(query).sort({ createdAt: 1 });

  if (!merchant) {
    console.error(
      "[seed] No merchant account found. Sign up in the app first (or set SEED_MERCHANT_EMAIL in .env to target a specific account)."
    );
    process.exit(1);
  }

  console.log(`[seed] seeding data for merchant: ${merchant.businessName} (${merchant.email})`);
  const result = await seedForMerchant(merchant._id, {});
  console.log(`[seed] inserted ${result.syntheticCount} synthetic failed payments.`);
  console.log(result.demoCreated ? "[seed] created real demo customer." : "[seed] DEMO_PHONE not set — skipped real demo customer.");

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
