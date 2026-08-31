import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Single-owner authentication for a stateless serverless backend.
//
// There is no database and no session store, so the session lives entirely in
// a signed cookie: `<payload>.<HMAC-SHA256(payload)>`. The browser can read
// nothing useful out of it and cannot forge one without SESSION_SECRET, so
// flipping a value in devtools gets an attacker nowhere — every protected
// route re-verifies the signature server-side on every request.

const COOKIE_NAME = "unkwn_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Deliberately expensive password hashing: every login attempt costs ~100ms of
// server CPU, which is unnoticeable once but makes online brute force
// impractical. A stateless function can't keep an attempt counter, so cost is
// the throttle.
const KDF_SALT = "unkwnphoto/login/v1";
const KDF_ROUNDS = 120_000;
const KDF_KEYLEN = 32;

/** The owner's password, or null when the site hasn't been configured yet. */
export function adminPassword(): string | null {
  const value = process.env.ADMIN_PASSWORD;
  return value && value.length > 0 ? value : null;
}

/** True once the owner has set ADMIN_PASSWORD in the Vercel dashboard. */
export function authConfigured(): boolean {
  return adminPassword() !== null;
}

// SESSION_SECRET is optional: without it we derive a key from the password so
// the owner only has to set one variable. Changing the password then
// invalidates every existing session, which is the behaviour you want anyway.
function signingKey(): string {
  const explicit = process.env.SESSION_SECRET;
  if (explicit && explicit.length > 0) return explicit;
  return `unkwnphoto/derived/${adminPassword() ?? ""}`;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

function equalConstantTime(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so compare lengths separately.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Constant-time password check. Always false when nothing is configured. */
export function passwordMatches(given: unknown): boolean {
  const expected = adminPassword();
  if (!expected || typeof given !== "string") return false;
  const a = crypto.pbkdf2Sync(given, KDF_SALT, KDF_ROUNDS, KDF_KEYLEN, "sha256");
  const b = crypto.pbkdf2Sync(expected, KDF_SALT, KDF_ROUNDS, KDF_KEYLEN, "sha256");
  return crypto.timingSafeEqual(a, b);
}

function serializeCookie(value: string, maxAgeSeconds: number): string {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly", // JavaScript — including any injected script — cannot read it
    "SameSite=Strict", // blocks cross-site requests, which is our CSRF defence
    `Max-Age=${maxAgeSeconds}`
  ];
  // Secure would make the cookie invisible over plain http on localhost.
  if (process.env.VERCEL) parts.push("Secure");
  return parts.join("; ");
}

export function issueSession(res: VercelResponse): void {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + MAX_AGE_SECONDS * 1000 })
  ).toString("base64url");
  res.setHeader("Set-Cookie", serializeCookie(`${payload}.${sign(payload)}`, MAX_AGE_SECONDS));
}

export function clearSession(res: VercelResponse): void {
  res.setHeader("Set-Cookie", serializeCookie("", 0));
}

function readSessionCookie(req: VercelRequest): string | null {
  const parsed = (req.cookies as Record<string, string> | undefined)?.[COOKIE_NAME];
  if (parsed) return parsed;
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return rest.join("=");
  }
  return null;
}

/** Verifies the cookie signature and expiry. The only source of truth. */
export function isAuthenticated(req: VercelRequest): boolean {
  if (!authConfigured()) return false;
  const raw = readSessionCookie(req);
  if (!raw) return false;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!equalConstantTime(signature, sign(payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      exp?: unknown;
    };
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

/**
 * Gate for every mutating route. Responds and returns false when the caller
 * isn't the owner — note it fails CLOSED if ADMIN_PASSWORD was never set, so
 * an unconfigured deployment is locked rather than wide open.
 */
export function requireAuth(req: VercelRequest, res: VercelResponse): boolean {
  if (!authConfigured()) {
    res.status(503).json({
      error:
        "Admin access isn't configured yet. Add an ADMIN_PASSWORD environment variable in the Vercel project settings, then redeploy."
    });
    return false;
  }
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Please sign in." });
    return false;
  }
  return true;
}
