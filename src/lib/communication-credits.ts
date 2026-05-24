import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Communication credits ledger , append-only record of billable outbound
// comms (SMS, postal mail). Email rides on the platform fee for now, so we
// expose a writer but only call it for the chargeable channels.
//
// Per-channel pricing lives here (single source of truth) until we ship a
// per-company override. Numbers are AUD cents; tune in one place.

export type CreditChannel = "sms" | "postal_mail" | "email";

// What we charge the management company per unit. Conservative defaults
// chosen to cover provider cost + headroom. Override per-company later when
// pricing tiers ship.
const DEFAULT_UNIT_PRICE_CENTS: Record<CreditChannel, number> = {
  sms: 12,           // ~$0.12 per segment
  postal_mail: 250,  // ~$2.50 per letter
  email: 0,          // rolled into platform fee
};

export function priceFor(channel: CreditChannel, units = 1): number {
  return DEFAULT_UNIT_PRICE_CENTS[channel] * units;
}

interface RecordChargeInput {
  managementCompanyId: string;
  ocId: string | null;
  communicationLogId: string | null;
  channel: CreditChannel;
  units?: number;
  costCents?: number;
  metadata?: Record<string, unknown> | null;
}

// Records a usage charge. Best-effort , failures log but don't propagate so a
// dropped billing row doesn't block the outbound communication itself.
export async function recordCommunicationCharge(
  supabase: SupabaseClient,
  input: RecordChargeInput,
): Promise<void> {
  const units = input.units ?? 1;
  const costCents = input.costCents ?? priceFor(input.channel, units);
  try {
    const { error } = await supabase.from("communication_credits").insert({
      management_company_id: input.managementCompanyId,
      oc_id: input.ocId,
      communication_log_id: input.communicationLogId,
      channel: input.channel,
      units,
      cost_cents: costCents,
      metadata: input.metadata ?? null,
    });
    if (error) {
      console.error("[credits] insert failed:", error.message);
    }
  } catch (err) {
    console.error("[credits] insert threw:", err);
  }
}

export interface CreditUsageSummary {
  channel: CreditChannel;
  units: number;
  cost_cents: number;
}

// Aggregate usage for a management company over a date range (inclusive
// start, exclusive end). Returns a per-channel summary.
export async function getCompanyUsage(
  supabase: SupabaseClient,
  managementCompanyId: string,
  from: string,
  to: string,
): Promise<CreditUsageSummary[]> {
  const { data, error } = await supabase
    .from("communication_credits")
    .select("channel, units, cost_cents")
    .eq("management_company_id", managementCompanyId)
    .gte("created_at", from)
    .lt("created_at", to);
  if (error || !data) return [];
  const byChannel = new Map<CreditChannel, CreditUsageSummary>();
  for (const row of data as Array<{ channel: CreditChannel; units: number; cost_cents: number }>) {
    const existing = byChannel.get(row.channel);
    if (existing) {
      existing.units += row.units;
      existing.cost_cents += row.cost_cents;
    } else {
      byChannel.set(row.channel, {
        channel: row.channel,
        units: row.units,
        cost_cents: row.cost_cents,
      });
    }
  }
  return Array.from(byChannel.values());
}
