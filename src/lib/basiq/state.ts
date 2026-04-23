import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// ============================================================================
// State token — stateless CSRF for the Basiq Consent UI round-trip
// ----------------------------------------------------------------------------
// We redirect the manager to consent.basiq.io and Basiq eventually calls our
// /api/basiq/callback. The `state` query param is our hook to: (a) guarantee
// the callback matches a consent session we actually started (CSRF), (b)
// route the post-consent redirect back to the right place (wizard step or
// bank-account page), and (c) identify the pending basiq_connections row
// without a server-side cache.
//
// Format: `${b64url(json)}.${b64url(hmac_sha256(secret, b64url(json)))}`
// Payload: { connectionId, nonce, returnTo, issuedAt }
//
// Why HMAC rather than DB / cookie:
//   - DB: would require an extra schema round-trip for a transient nonce
//   - Cookie: works but a signed payload moving with the user through
//     Basiq's redirect chain is more explicit and survives cookie loss
//   - HMAC: stateless, verifiable, replay-guarded by the 1-hour TTL
// ============================================================================

const STATE_TTL_SECONDS = 60 * 60; // 1 hour — consent flow rarely takes longer
const VERSION = "v1";

interface StatePayload {
  v: string;
  connectionId: string;
  nonce: string;
  returnTo: string | null;
  issuedAt: number; // epoch seconds
}

function getSecret(): Buffer {
  const s = process.env.BASIQ_STATE_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "BASIQ_STATE_SECRET must be set and at least 32 characters long",
    );
  }
  return Buffer.from(s, "utf8");
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

export function issueStateToken(args: {
  connectionId: string;
  returnTo?: string | null;
}): string {
  const payload: StatePayload = {
    v: VERSION,
    connectionId: args.connectionId,
    nonce: randomBytes(16).toString("hex"),
    returnTo: args.returnTo ?? null,
    issuedAt: Math.floor(Date.now() / 1000),
  };
  const payloadBuf = Buffer.from(JSON.stringify(payload), "utf8");
  const payloadB64 = b64url(payloadBuf);
  const sig = createHmac("sha256", getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

export interface VerifiedState {
  connectionId: string;
  returnTo: string | null;
  issuedAt: number;
}

export function verifyStateToken(
  token: string,
): { valid: true; state: VerifiedState } | { valid: false; reason: string } {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "missing state" };
  }
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed state" };

  const [payloadB64, sigB64] = parts;
  const expected = createHmac("sha256", getSecret()).update(payloadB64).digest();
  const got = b64urlDecode(sigB64);
  if (got.length !== expected.length) {
    return { valid: false, reason: "signature length mismatch" };
  }
  if (!timingSafeEqual(got, expected)) {
    return { valid: false, reason: "signature mismatch" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return { valid: false, reason: "payload not json" };
  }
  const p = parsed as Partial<StatePayload> | null;
  if (
    !p ||
    p.v !== VERSION ||
    typeof p.connectionId !== "string" ||
    typeof p.nonce !== "string" ||
    typeof p.issuedAt !== "number"
  ) {
    return { valid: false, reason: "payload shape invalid" };
  }

  const age = Math.floor(Date.now() / 1000) - p.issuedAt;
  if (age > STATE_TTL_SECONDS) {
    return { valid: false, reason: "state expired" };
  }
  if (age < -60) {
    // allow 60s of clock skew
    return { valid: false, reason: "state issued in the future" };
  }

  return {
    valid: true,
    state: {
      connectionId: p.connectionId,
      returnTo: p.returnTo ?? null,
      issuedAt: p.issuedAt,
    },
  };
}
