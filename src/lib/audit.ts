import "server-only";
import { createServerClient } from "@/lib/supabase";

// Central audit-log writer. Replaces inlined `supabase.from('audit_log').insert(...)`
// calls scattered through src/lib/actions/*. Always best-effort — a failed audit row
// must NEVER bubble back to the caller and reverse a successful mutation.

export type AuditEntityType =
  | "lot"
  | "lot_owner"
  | "tenant"
  | "consent"
  | "occupancy"
  | "invitation"
  | "invitation_accept"
  | "ownership_transfer"
  | "profile"
  | "profile_username"
  | "owners_corporation"
  | "levy_batch"
  | "levy_notice"
  | "payment"
  | "ledger_entry"
  | "bank_transaction"
  | "document"
  | "communication"
  | "phone_call"
  | "sms"
  | "email"
  | "team_member"
  | "management_company"
  | "bank_account"
  | "insurance_policy"
  | "meeting"
  | "minutes"
  | "rule"
  | "settlement"
  | "drn_mapping"
  | "consent_change"
  | (string & {}); // escape hatch for ad-hoc types — prefer adding to the union

export interface LogAuditArgs {
  profileId: string;
  action: string; // "create" | "update" | "delete" | "accept" | "send" | "void" | etc
  entityType: AuditEntityType;
  entityId?: string | null;
  ocId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

export async function logAudit(args: LogAuditArgs): Promise<void> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from("audit_log").insert({
      profile_id: args.profileId,
      oc_id: args.ocId ?? null,
      action: args.action,
      entity_type: args.entityType,
      entity_id: args.entityId ?? null,
      before_state: args.before ?? null,
      after_state: args.after ?? null,
      metadata: args.metadata ?? null,
      ip_address: args.ipAddress ?? null,
    });
    if (error) {
      console.error("[audit] insert failed:", error.message, {
        action: args.action,
        entityType: args.entityType,
        entityId: args.entityId,
      });
    }
  } catch (err) {
    console.error("[audit] insert threw:", err);
  }
}

// Computes a {before, after} pair limited to keys whose values actually changed.
// Use to keep before/after JSON compact in the audit log (don't dump full rows).
// Compares with Object.is so undefined/null/NaN behave intuitively. Arrays/objects
// compare via JSON.stringify — sufficient for the simple shapes we audit.
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  let changed = false;
  for (const key of Object.keys(after)) {
    const bv = before[key];
    const av = (after as Record<string, unknown>)[key];
    const equal =
      Object.is(bv, av) ||
      (typeof bv === "object" && typeof av === "object" && JSON.stringify(bv) === JSON.stringify(av));
    if (!equal) {
      b[key] = bv ?? null;
      a[key] = av ?? null;
      changed = true;
    }
  }
  return changed ? { before: b, after: a } : null;
}
