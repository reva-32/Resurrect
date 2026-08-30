import express from "express";
import User from "../models/User.js";
import { hashPassword, verifyPassword, signToken } from "../services/authService.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/signup", async (req, res) => {
  try {
    const { businessName, name, email, password } = req.body;
    if (!businessName || !name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    const passwordHash = await hashPassword(password);
    const user = await User.create({ businessName, name, email, passwordHash });

    const token = signToken(user);
    res.status(201).json({
      token,
      user: { id: user._id, businessName: user.businessName, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("[auth] signup error:", err.message);
    res.status(500).json({ error: "Signup failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });

    const token = signToken(user);
    res.json({
      token,
      user: { id: user._id, businessName: user.businessName, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("[auth] login error:", err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

export default router;
