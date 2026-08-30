import { verifyToken } from "../services/authService.js";
import User from "../models/User.js";

// Protects a route — requires a valid "Authorization: Bearer <token>" header.
// On success, attaches req.user (without passwordHash).
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).select("-passwordHash");
    if (!user) return res.status(401).json({ error: "User no longer exists" });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
