import { createHmac, timingSafeEqual } from "node:crypto";

// ============================================================================
// Basiq webhook signature verification (HMAC-SHA256 over id.timestamp.body)
// ----------------------------------------------------------------------------
// Reference: https://api.basiq.io/docs/webhooks-security
//
// Headers Basiq sends:
//   webhook-id         — unique message id
//   webhook-timestamp  — unix epoch seconds
//   webhook-signature  — space-delimited list of "v1,<base64-signature>"
//
// Signed content is the literal string `${id}.${timestamp}.${rawBody}`.
// Signing key is derived from the webhook secret: strip the `whsec_` prefix,
// base64-decode the remainder.
//
// Tolerance check: reject timestamps more than 5 minutes from now (prevents
// replay). The Basiq doc recommends "a tolerance"; 5 min matches the common
// Standard Webhooks default (Basiq's signature scheme is compatible with
// that spec).
// ============================================================================

const TOLERANCE_SECONDS = 5 * 60;
const SIGNATURE_VERSION = "v1";

export interface WebhookVerifyInput {
  id: string | null;
  timestamp: string | null;
  signatureHeader: string | null;
  rawBody: string;
  secret: string; // the whsec_… value; may also be the bare base64 component
  now?: () => number; // for testing
}

export type WebhookVerifyResult =
  | { valid: true }
  | { valid: false; reason: string };

export function verifyBasiqWebhookSignature(
  input: WebhookVerifyInput,
): WebhookVerifyResult {
  if (!input.id) return { valid: false, reason: "missing webhook-id" };
  if (!input.timestamp) {
    return { valid: false, reason: "missing webhook-timestamp" };
  }
  if (!input.signatureHeader) {
    return { valid: false, reason: "missing webhook-signature" };
  }
  if (!input.secret) return { valid: false, reason: "missing secret" };

  // Timestamp replay check
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) {
    return { valid: false, reason: "timestamp not numeric" };
  }
  const nowSec = Math.floor((input.now?.() ?? Date.now()) / 1000);
  if (Math.abs(nowSec - ts) > TOLERANCE_SECONDS) {
    return { valid: false, reason: "timestamp outside tolerance window" };
  }

  // Decode signing key — strip whsec_ prefix if present, then base64 decode
  const rawSecret = input.secret.startsWith("whsec_")
    ? input.secret.slice("whsec_".length)
    : input.secret;
  let keyBytes: Buffer;
  try {
    keyBytes = Buffer.from(rawSecret, "base64");
  } catch {
    return { valid: false, reason: "secret not valid base64" };
  }
  if (keyBytes.length === 0) {
    return { valid: false, reason: "secret decoded to empty key" };
  }

  const signedContent = `${input.id}.${input.timestamp}.${input.rawBody}`;
  const expected = createHmac("sha256", keyBytes)
    .update(signedContent)
    .digest(); // raw bytes

  // Header may contain multiple signatures (for key rotation). Accept any.
  const candidates = input.signatureHeader.split(/\s+/).filter(Boolean);
  for (const candidate of candidates) {
    const parts = candidate.split(",");
    if (parts.length !== 2) continue;
    const [version, sigB64] = parts;
    if (version !== SIGNATURE_VERSION) continue;

    let sigBytes: Buffer;
    try {
      sigBytes = Buffer.from(sigB64, "base64");
    } catch {
      continue;
    }
    if (sigBytes.length !== expected.length) continue;
    if (timingSafeEqual(sigBytes, expected)) return { valid: true };
  }

  return { valid: false, reason: "no matching signature in header" };
}
