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
//
// The derivation is deliberately slow, and that is the whole point. A session
// cookie is `payload.HMAC(payload, key)`, which anyone holding a cookie can
// verify offline. If the key were just the password concatenated with a
// string, each guess would cost one SHA-256 — so a stolen cookie would be an
// offline cracking oracle and the expensive login hashing below would buy
// nothing. Stretching the key first makes an offline guess cost exactly as
// much as an online one.
//
// Derived keys are memoised per process so warm invocations don't re-pay it.
let cachedSigningKey: { source: string; key: Buffer } | null = null;

function signingKey(): Buffer {
  const explicit = process.env.SESSION_SECRET;
  // An explicit secret is assumed to be high-entropy, so it needs no stretching.
  if (explicit && explicit.length > 0) return Buffer.from(explicit, "utf8");

  const source = adminPassword() ?? "";
  if (cachedSigningKey && cachedSigningKey.source === source) return cachedSigningKey.key;
  const key = crypto.pbkdf2Sync(
    source,
    "unkwnphoto/session-key/v1",
    KDF_ROUNDS,
    KDF_KEYLEN,
    "sha256"
  );
  cachedSigningKey = { source, key };
  return key;
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

// The expected hash never changes for a given deployment, so derive it once
// per process rather than on every attempt. That halves the CPU an anonymous
// caller can force this endpoint to burn.
let cachedExpectedHash: { source: string; hash: Buffer } | null = null;

function expectedPasswordHash(): Buffer | null {
  const expected = adminPassword();
  if (!expected) return null;
  if (cachedExpectedHash && cachedExpectedHash.source === expected) {
    return cachedExpectedHash.hash;
  }
  const hash = crypto.pbkdf2Sync(expected, KDF_SALT, KDF_ROUNDS, KDF_KEYLEN, "sha256");
  cachedExpectedHash = { source: expected, hash };
  return hash;
}

/** A real password is never this long; refuse before doing any work. */
const MAX_PASSWORD_LENGTH = 256;

/** Constant-time password check. Always false when nothing is configured. */
export function passwordMatches(given: unknown): boolean {
  const expected = expectedPasswordHash();
  if (!expected || typeof given !== "string") return false;
  if (given.length === 0 || given.length > MAX_PASSWORD_LENGTH) return false;
  const candidate = crypto.pbkdf2Sync(given, KDF_SALT, KDF_ROUNDS, KDF_KEYLEN, "sha256");
  return crypto.timingSafeEqual(candidate, expected);
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
 * Rejects a cross-site caller. SameSite=Strict already stops the browser
 * attaching the cookie to a cross-site request, so this is a second lock on
 * the same door — cheap, and it doesn't depend on the browser getting
 * SameSite right. A missing Origin header is fine: same-origin GETs and
 * non-browser clients don't send one.
 */
export function sameOrigin(req: VercelRequest): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
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
  if (!sameOrigin(req)) {
    res.status(403).json({ error: "Cross-site request refused." });
    return false;
  }
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
