import { z } from "zod";

// ─── Connection lifecycle ──────────────────────────────────────

export const BASIQ_CONNECTION_STATUSES = [
  "pending",
  "active",
  "expired",
  "revoked",
  "failed",
  "syncing",
] as const;
export type BasiqConnectionStatus =
  (typeof BASIQ_CONNECTION_STATUSES)[number];

export const BASIQ_REAUTH_NOTIFICATION_TYPES = [
  "reauth_30d",
  "reauth_14d",
  "reauth_7d",
  "reauth_3d",
  "reauth_1d",
  "expired",
  "gap_reconciliation",
] as const;
export type BasiqReauthNotificationType =
  (typeof BASIQ_REAUTH_NOTIFICATION_TYPES)[number];

// ─── Webhook event names (confirmed by Elyas against the Basiq dashboard) ──

export const BASIQ_WEBHOOK_EVENTS = [
  "transactions.updated", // new transactions added to a connection
  "connection.invalidated", // refresh failed, MFA changed, consent revoked — inspect status
  "account.updated", // account metadata change (not balance)
] as const;
export type BasiqWebhookEvent = (typeof BASIQ_WEBHOOK_EVENTS)[number];

// ─── Parsed description ────────────────────────────────────────

export interface ParsedBasiqDescription {
  cleaned_description: string;
  sender_identity: string | null;
  reference: string | null; // extracted levy reference (normalised "LEV-{n}") if present
  bpay_crn: string | null; // captured but unused until Prompt 4
  raw: string;
}

// ─── Basiq API payload shapes ──────────────────────────────────
// These mirror Basiq API v3.0 response bodies. The BasiqApiClient
// returns these shapes; the real HTTP client parses them from JSON.

export const basiqTransactionPayloadSchema = z.object({
  id: z.string(), // Basiq's transaction id — becomes our basiq_transaction_id
  account: z.string(), // Basiq account id
  connection: z.string().optional(),
  description: z.string().nullable().default(""),
  amount: z.string(), // Basiq returns stringified decimal; we Number() it
  direction: z.enum(["credit", "debit"]).optional(),
  balance: z.string().nullable().optional(),
  postDate: z.string().nullable().optional(), // ISO8601
  transactionDate: z.string().nullable().optional(), // ISO8601 (value date)
  status: z.string().optional(),
  institution: z.string().optional(),
});
export type BasiqTransactionPayload = z.infer<
  typeof basiqTransactionPayloadSchema
>;

export const basiqInstitutionSchema = z.object({
  id: z.string(), // e.g. "AU00000"
  name: z.string(),
  shortName: z.string().optional().nullable(),
  institutionType: z.string().optional().nullable(),
  tier: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
});
export type BasiqInstitution = z.infer<typeof basiqInstitutionSchema>;

export const basiqConnectionApiSchema = z.object({
  id: z.string(),
  status: z.string(),
  institution: z
    .object({ id: z.string(), name: z.string().optional() })
    .or(z.string()),
  accounts: z.array(z.object({ id: z.string() })).optional(),
  lastUsed: z.string().optional().nullable(),
});
export type BasiqConnectionApi = z.infer<typeof basiqConnectionApiSchema>;

// Basiq account — what GET /users/{userId}/accounts returns. The shape
// varies mildly per institution; we only rely on the fields needed for
// BSB/account-number binding.
export const basiqAccountApiSchema = z.object({
  id: z.string(),
  accountNumber: z.string().nullable().optional(),
  accountHolder: z.string().nullable().optional(),
  class: z
    .object({
      type: z.string().optional(),
      product: z.string().optional(),
    })
    .or(z.string())
    .optional()
    .nullable(),
  connection: z.string().optional().nullable(),
  institution: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  // Basiq's AU-branded responses may include BSB as a separate field;
  // when absent, we extract from `accountNumber`.
  bsb: z.string().optional().nullable(),
});
export type BasiqAccountApi = z.infer<typeof basiqAccountApiSchema>;

export const basiqJobSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  steps: z
    .array(
      z.object({
        title: z.string(),
        status: z.string(),
        result: z.unknown().optional().nullable(),
      }),
    )
    .optional(),
  links: z
    .object({
      source: z.string().optional(),
    })
    .partial()
    .optional(),
});
export type BasiqJob = z.infer<typeof basiqJobSchema>;

// ─── Server-action return shapes ───────────────────────────────

export interface BasiqConnectionStatusResult {
  hasConnection: boolean;
  connectionId: string | null;
  status: BasiqConnectionStatus | null;
  institutionName: string | null;
  institutionShortName: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  consentExpiresAt: string | null;
  daysUntilExpiry: number | null; // null when no connection, negative when expired
  nominatedRepresentativeName: string | null;
}

export interface ForceSyncResult {
  syncedCount: number;
  newTransactionCount: number;
  newTransactionIds: string[];
  errors: string[];
  rateLimited: boolean;
}

export interface PollResult {
  connectionId: string;
  fetched: number;
  inserted: number;
  /** Basiq-side idempotency: rpc_insert_basiq_transaction returned
   *  was_duplicate=true (basiq_transaction_id already in DB). Distinct
   *  from the cross-source flag below. */
  duplicates: number;
  autoMatched: number;
  /** PP5-A: rows that were inserted, then flagged by the bank-side detector
   *  as a suspected cross-source duplicate of an existing row (different
   *  source, +/-2-day window, hash-equal description). Auto-match was
   *  skipped for these rows. */
  crossSourceDuplicatesFlagged: number;
  error: string | null;
}

export interface GapReportResult {
  gapReportId: string;
  gapHours: number;
  backfilledCount: number;
  autoMatchedCount: number;
  manualReviewCount: number;
  committeeNotified: boolean;
  suppressionUntil: string;
}

export interface BasiqConnectionDetail {
  id: string;
  ocId: string;
  basiqUserId: string;
  basiqExternalConnectionId: string;
  basiqInstitutionId: string;
  institutionName: string;
  institutionShortName: string | null;
  status: BasiqConnectionStatus;
  consentGrantedAt: string | null;
  consentExpiresAt: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  lastWebhookReceivedAt: string | null;
  nominatedRepresentativeName: string | null;
  nominatedRepresentativeProfileId: string | null;
  createdAt: string;
  createdBy: string;
  linkedBankAccounts: Array<{
    id: string;
    accountName: string;
    fundType: "administrative" | "capital_works";
  }>;
}

// ─── Form schemas ──────────────────────────────────────────────

export const startBasiqConsentSchema = z.object({
  oc_id: z.string().uuid(),
  institution_id: z.string().min(1),
  nominated_rep_name: z.string().min(1).max(200),
  return_to: z.string().optional().nullable(),
});
export type StartBasiqConsentInput = z.infer<typeof startBasiqConsentSchema>;

export const completeBasiqConsentSchema = z.object({
  state: z.string().min(1),
  jobId: z.string().min(1).optional().nullable(),
});
export type CompleteBasiqConsentInput = z.infer<
  typeof completeBasiqConsentSchema
>;

export const forceSyncBasiqConnectionSchema = z.object({
  oc_id: z.string().uuid(),
});
export type ForceSyncBasiqConnectionInput = z.infer<
  typeof forceSyncBasiqConnectionSchema
>;

// ─── Helpers ───────────────────────────────────────────────────

// Levy-reference parsing now lives in src/lib/reconciliation/reference.ts
// (LEV_REF_REGEX_GLOBAL + detectSingleLevyReference). Importers use that
// module directly. Form-input validation uses the strict anchored LEV-\d+
// in src/lib/validations/reconciliation.ts.
export const BPAY_CRN_REGEX = /\bBPAY[^\d]{0,10}(\d{4,20})\b/i;

export function isTerminalStatus(status: BasiqConnectionStatus): boolean {
  return status === "expired" || status === "revoked" || status === "failed";
}

export function isOperationalStatus(status: BasiqConnectionStatus): boolean {
  return status === "active" || status === "syncing";
}
