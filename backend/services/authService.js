import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_EXPIRES_IN = "7d";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export function isValidEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email.trim());
}

export function isStrongPassword(password) {
  return typeof password === "string" && PASSWORD_RE.test(password);
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}
