import {
  BPAY_CRN_REGEX,
  type BasiqTransactionPayload,
  type ParsedBasiqDescription,
} from "@/lib/validations/basiq";
import { detectSingleLevyReference } from "@/lib/reconciliation/reference";

// ============================================================================
// Bank-specific description parsers
// ----------------------------------------------------------------------------
// Basiq returns raw `description` strings that vary per institution. Each
// bank below has its own entry point so parser improvements can land
// incrementally. Per-bank quirks (e.g. CBA's "TRANSFER FROM …" prefix, NAB's
// all-caps, ANZ's truncation) are NOT yet encoded — we don't fabricate
// patterns we haven't verified. Every bank currently routes to
// `parseGeneric`, which extracts a normalised levy reference ("LEV-{n}")
// and (where obvious) a sender identity.
//
// See PRE_LAUNCH_CLEANUP.md — each bank has a TODO listing the confirmation
// work required before launch.
// ============================================================================

// Institution IDs used by Basiq's connector catalogue (AU region). These
// strings are the literal values returned in GET /institutions responses.
// They MUST match the `institution.id` field Basiq emits for the
// per-institution switch below to hit the right parser.
export const BASIQ_INSTITUTION_IDS = {
  CBA: "AU00000",
  NAB: "AU00001",
  ANZ: "AU00002",
  WBC: "AU00003", // Westpac
  MACQUARIE: "AU00004",
  ING: "AU00005",
  BENDIGO: "AU00006",
} as const;
// TODO: confirm each ID against `GET /institutions` in the Basiq sandbox
// before launch. The map above is a best-effort placeholder; the correct
// IDs are whatever Basiq's own institutions endpoint returns at runtime.
// Flagged in PRE_LAUNCH_CLEANUP.md.

export function parseBasiqDescription(
  institutionId: string | null | undefined,
  raw: BasiqTransactionPayload,
): ParsedBasiqDescription {
  switch (institutionId) {
    case BASIQ_INSTITUTION_IDS.CBA:
      return parseCBA(raw);
    case BASIQ_INSTITUTION_IDS.NAB:
      return parseNAB(raw);
    case BASIQ_INSTITUTION_IDS.ANZ:
      return parseANZ(raw);
    case BASIQ_INSTITUTION_IDS.WBC:
      return parseWBC(raw);
    case BASIQ_INSTITUTION_IDS.MACQUARIE:
      return parseMacquarie(raw);
    case BASIQ_INSTITUTION_IDS.ING:
      return parseING(raw);
    case BASIQ_INSTITUTION_IDS.BENDIGO:
      return parseBendigo(raw);
    default:
      return parseGeneric(raw);
  }
}

// ─── Per-bank entry points ─────────────────────────────────────
// Each is a thin wrapper around parseGeneric until the bank's specific
// description format is verified against real sandbox transactions.

function parseCBA(raw: BasiqTransactionPayload): ParsedBasiqDescription {
  // TODO(pre-launch): verify CBA description format. Common patterns
  // observed in public data: "TRANSFER FROM <NAME> <account>" for NPP,
  // "DIRECT DEBIT <biller>" for recurring, "EFTPOS" prefix for card.
  return parseGeneric(raw);
}

function parseNAB(raw: BasiqTransactionPayload): ParsedBasiqDescription {
  // TODO(pre-launch): verify NAB description format. NAB often
  // capitalises and suffixes with a reference — needs real samples.
  return parseGeneric(raw);
}

function parseANZ(raw: BasiqTransactionPayload): ParsedBasiqDescription {
  // TODO(pre-launch): verify ANZ description format. ANZ is known to
  // truncate longer descriptions at ~32 chars — truncation-aware
  // reference extraction may be needed.
  return parseGeneric(raw);
}

function parseWBC(raw: BasiqTransactionPayload): ParsedBasiqDescription {
  // TODO(pre-launch): verify Westpac description format.
  return parseGeneric(raw);
}

function parseMacquarie(
  raw: BasiqTransactionPayload,
): ParsedBasiqDescription {
  // TODO(pre-launch): verify Macquarie description format.
  return parseGeneric(raw);
}

function parseING(raw: BasiqTransactionPayload): ParsedBasiqDescription {
  // TODO(pre-launch): verify ING description format.
  return parseGeneric(raw);
}

function parseBendigo(raw: BasiqTransactionPayload): ParsedBasiqDescription {
  // TODO(pre-launch): verify Bendigo & Adelaide description format.
  return parseGeneric(raw);
}

// ─── Generic fallback ──────────────────────────────────────────
// Extracts a normalised levy reference "LEV-{n}" (required for auto-match)
// and a best-effort sender identity + BPAY CRN. Aggressive whitespace
// normalisation makes the output stable across whichever bank produced the
// string.

function parseGeneric(
  raw: BasiqTransactionPayload,
): ParsedBasiqDescription {
  const rawText = raw.description ?? "";
  const cleaned = rawText.replace(/\s+/g, " ").trim();

  const reference = extractLevyReference(cleaned);
  const bpay = extractBpayCrn(cleaned);
  const sender = extractSenderIdentity(cleaned);

  return {
    cleaned_description: cleaned,
    sender_identity: sender,
    reference,
    bpay_crn: bpay,
    raw: rawText,
  };
}

// ─── Extraction primitives ─────────────────────────────────────

function extractLevyReference(s: string): string | null {
  return detectSingleLevyReference(s);
}

function extractBpayCrn(s: string): string | null {
  const m = s.match(BPAY_CRN_REGEX);
  return m && m[1] ? m[1] : null;
}

// Best-effort sender identity: look for an explicit "FROM <X>" segment
// first, otherwise pull an initial sequence of capitalised words the way
// most AU banks format originator names. Returns null rather than
// guessing when neither pattern fits.
function extractSenderIdentity(s: string): string | null {
  const fromMatch = s.match(/\bFROM\s+([A-Z][A-Z0-9 &'./-]{1,60})/);
  if (fromMatch) return fromMatch[1].trim();

  const capsMatch = s.match(/^([A-Z][A-Z0-9 &'./-]{2,60})(?=\s{2,}|\s[-–—]\s|$)/);
  if (capsMatch) return capsMatch[1].trim();

  return null;
}
