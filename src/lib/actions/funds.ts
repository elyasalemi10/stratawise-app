"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { FUND_KIND_LABEL, type FundKind } from "@/lib/funds-shared";

export interface FundRow {
  id: string;
  name: string;
  kind: FundKind;
  /** Aggregate balance across this fund's bank accounts, following
   *  parent_account_id when the row is a linked share. */
  total_balance: number;
  /** Lots that contribute to this fund. */
  lot_count: number;
  /** Bank accounts attached. */
  bank_account_count: number;
}

export async function getFunds(ocId: string): Promise<FundRow[]> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data: funds } = await supabase
    .from("funds")
    .select("id, name, kind")
    .eq("oc_id", ocId)
    .order("name", { ascending: true });

  const fundList = (funds ?? []) as Array<{ id: string; name: string; kind: string }>;
  if (fundList.length === 0) return [];

  const fundIds = fundList.map((f) => f.id);
  const [{ data: entitlements }, { data: accounts }] = await Promise.all([
    supabase.from("fund_lot_entitlements").select("fund_id, lot_id").in("fund_id", fundIds),
    supabase
      .from("bank_accounts")
      .select("id, fund_id, parent_account_id, current_balance")
      .eq("oc_id", ocId),
  ]);

  const lotsByFund = new Map<string, number>();
  for (const e of (entitlements ?? [])) {
    const fid = (e as { fund_id: string }).fund_id;
    lotsByFund.set(fid, (lotsByFund.get(fid) ?? 0) + 1);
  }

  const balanceById = new Map<string, number>();
  for (const a of (accounts ?? [])) {
    const id = (a as { id: string }).id;
    const bal = Number((a as { current_balance: number | string | null }).current_balance ?? 0);
    balanceById.set(id, bal);
  }
  const balancesByFund = new Map<string, number>();
  const countsByFund = new Map<string, number>();
  for (const a of (accounts ?? [])) {
    const row = a as { id: string; fund_id: string | null; parent_account_id: string | null };
    if (!row.fund_id) continue;
    const effectiveBalance = row.parent_account_id
      ? (balanceById.get(row.parent_account_id) ?? 0)
      : (balanceById.get(row.id) ?? 0);
    balancesByFund.set(row.fund_id, (balancesByFund.get(row.fund_id) ?? 0) + effectiveBalance);
    countsByFund.set(row.fund_id, (countsByFund.get(row.fund_id) ?? 0) + 1);
  }

  return fundList.map((f) => ({
    id: f.id,
    name: f.name,
    kind: f.kind as FundKind,
    total_balance: balancesByFund.get(f.id) ?? 0,
    lot_count: lotsByFund.get(f.id) ?? 0,
    bank_account_count: countsByFund.get(f.id) ?? 0,
  }));
}

/**
 * Returns which of the three "named" fund kinds (admin / capital works /
 * maintenance plan) the OC already has. Used by the create-fund wizard
 * to grey out kinds the manager has already added.
 */
export async function getExistingFundKinds(ocId: string): Promise<FundKind[]> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();
  const { data } = await supabase
    .from("funds")
    .select("kind")
    .eq("oc_id", ocId)
    .in("kind", ["administrative", "capital_works", "maintenance_plan"]);
  return ((data ?? []) as Array<{ kind: FundKind }>).map((r) => r.kind);
}

export interface LotForFund {
  id: string;
  lot_number: number;
  unit_number: string | null;
  default_liability: number;
}

export async function getOcLots(ocId: string): Promise<LotForFund[]> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();
  const { data } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number, lot_liability, lot_entitlement")
    .eq("oc_id", ocId)
    .order("lot_number");
  return ((data ?? []) as Array<{ id: string; lot_number: number; unit_number: string | null; lot_liability: number | null; lot_entitlement: number | null }>).map((l) => ({
    id: l.id,
    lot_number: l.lot_number,
    unit_number: l.unit_number,
    default_liability: Number(l.lot_liability ?? l.lot_entitlement ?? 1),
  }));
}

export interface ExistingBankAccountOption {
  id: string;
  label: string;
  bsb: string | null;
  account_number: string | null;
}

export async function getOcBankAccountOptions(ocId: string): Promise<ExistingBankAccountOption[]> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();
  // Only physical accounts (no parent_account_id) , so the picker offers
  // "the actual bank accounts" rather than linked copies.
  const { data } = await supabase
    .from("bank_accounts")
    .select("id, account_name, bsb, account_number, bank_name")
    .eq("oc_id", ocId)
    .is("parent_account_id", null);
  return ((data ?? []) as Array<{ id: string; account_name: string | null; bsb: string | null; account_number: string | null; bank_name: string | null }>).map((a) => ({
    id: a.id,
    label: a.account_name || a.bank_name || (a.bsb && a.account_number ? `${a.bsb} ${a.account_number}` : "Bank account"),
    bsb: a.bsb,
    account_number: a.account_number,
  }));
}

export async function createFund(
  ocId: string,
  data: {
    kind: FundKind;
    /** Only used when kind === "custom". Ignored otherwise (system funds
     *  resolve their name from FUND_KIND_LABEL). */
    customName?: string;
    /** lot_id -> liability share. Lots omitted from the map are NOT
     *  members of this fund. */
    entitlements: Record<string, number>;
    bank: {
      kind: "new" | "shared";
      /** When kind = "new": the new account's details. */
      account_name?: string;
      bsb?: string;
      account_number?: string;
      bank_name?: string;
      /** When kind = "shared": the existing bank_account row this fund
       *  links to. The new bank_accounts row only carries fund_id +
       *  parent_account_id (no duplicated BSB/account/balance). */
      parent_account_id?: string;
    };
  },
): Promise<{ fundId?: string; error?: string }> {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);

  const resolvedName =
    data.kind === "custom"
      ? (data.customName ?? "").trim()
      : FUND_KIND_LABEL[data.kind];
  if (!resolvedName) return { error: "Fund needs a name." };
  if (Object.keys(data.entitlements).length === 0) {
    return { error: "Pick at least one lot for this fund." };
  }
  for (const [, v] of Object.entries(data.entitlements)) {
    if (!Number.isFinite(v) || v <= 0) {
      return { error: "Every member lot needs a liability above zero." };
    }
  }
  if (data.bank.kind === "new") {
    if (!data.bank.bsb || !data.bank.account_number) {
      return { error: "BSB and account number are required for a new bank account." };
    }
  } else if (!data.bank.parent_account_id) {
    return { error: "Pick an existing bank account to share with." };
  }

  const supabase = createServerClient();

  // Block duplicate system funds at the server too , the wizard hides
  // them but a stale tab could still try.
  if (data.kind !== "custom") {
    const { data: dup } = await supabase
      .from("funds")
      .select("id")
      .eq("oc_id", ocId)
      .eq("kind", data.kind)
      .maybeSingle();
    if (dup) return { error: `${FUND_KIND_LABEL[data.kind]} already exists for this OC.` };
  }

  const { data: fundRow, error: fundErr } = await supabase
    .from("funds")
    .insert({ oc_id: ocId, name: resolvedName, kind: data.kind, is_system: data.kind !== "custom" })
    .select("id")
    .single();
  if (fundErr || !fundRow) return { error: fundErr?.message ?? "Could not create fund." };
  const fundId = (fundRow as { id: string }).id;

  const entRows = Object.entries(data.entitlements).map(([lot_id, liability]) => ({
    fund_id: fundId,
    lot_id,
    liability,
  }));
  if (entRows.length > 0) {
    const { error: entErr } = await supabase.from("fund_lot_entitlements").insert(entRows);
    if (entErr) {
      await supabase.from("funds").delete().eq("id", fundId);
      return { error: entErr.message };
    }
  }

  // bank_accounts.fund_type stays for backward compatibility. Custom
  // funds map to "administrative" because the enum has no "custom"
  // value yet , the fund_id column is the new source of truth.
  const legacyFundType: "administrative" | "capital_works" | "maintenance_plan" =
    data.kind === "capital_works" || data.kind === "maintenance_plan"
      ? data.kind
      : "administrative";

  if (data.bank.kind === "new") {
    const { error: bankErr } = await supabase
      .from("bank_accounts")
      .insert({
        oc_id: ocId,
        fund_id: fundId,
        fund_type: legacyFundType,
        account_name: data.bank.account_name || resolvedName,
        bsb: data.bank.bsb,
        account_number: data.bank.account_number,
        bank_name: data.bank.bank_name ?? null,
      });
    if (bankErr) {
      await supabase.from("fund_lot_entitlements").delete().eq("fund_id", fundId);
      await supabase.from("funds").delete().eq("id", fundId);
      return { error: bankErr.message };
    }
  } else {
    const { error: bankErr } = await supabase
      .from("bank_accounts")
      .insert({
        oc_id: ocId,
        fund_id: fundId,
        fund_type: legacyFundType,
        parent_account_id: data.bank.parent_account_id,
        account_name: resolvedName,
      });
    if (bankErr) {
      await supabase.from("fund_lot_entitlements").delete().eq("fund_id", fundId);
      await supabase.from("funds").delete().eq("id", fundId);
      return { error: bankErr.message };
    }
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "create",
    entity_type: "fund",
    entity_id: fundId,
    after_state: { name: resolvedName, kind: data.kind, entitlement_count: entRows.length, bank_kind: data.bank.kind },
  });

  revalidatePath("/ocs/[ocCode]/funds", "page");
  return { fundId };
}
