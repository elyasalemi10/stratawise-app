"use server";

import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

// ─── Result types ────────────────────────────────────────────────

export type SearchHitType =
  | "oc"
  | "lot_owner"
  | "document"
  | "levy"
  | "meeting"
  | "maintenance"
  | "complaint"
  | "insurance"
  | "notification"
  | "page";

export interface SearchHit {
  type: SearchHitType;
  id: string;
  title: string;
  subtitle?: string;
  /** Short tag for the result-row badge ("OC", "Lot owner", etc.). */
  badge: string;
  /** Where clicking the row navigates. */
  href: string;
}

export interface GlobalSearchResult {
  hits: SearchHit[];
  error?: string;
}

// ─── Static page entries ─────────────────────────────────────────
//
// These never depend on DB rows; they're always returned when the query
// matches the label. Useful for "I want to get to settings fast" muscle
// memory. The OC-scoped ones swap in the current OC's short_code at call
// site so they deep-link correctly.

const GLOBAL_PAGES: Array<{ title: string; href: string; aliases: string[] }> = [
  { title: "Settings", href: "/settings", aliases: ["profile", "account", "password"] },
  { title: "Inbox", href: "/inbox", aliases: ["notifications", "messages"] },
  { title: "Owners Corporations", href: "/ocs", aliases: ["ocs", "all ocs"] },
  { title: "Levies overview", href: "/levies", aliases: ["levies"] },
  { title: "Meetings overview", href: "/meetings", aliases: ["meetings"] },
];

function ocScopedPages(shortCode: string): Array<{ title: string; href: string; aliases: string[] }> {
  return [
    { title: "Dashboard", href: `/ocs/${shortCode}`, aliases: ["overview", "home"] },
    { title: "Lots", href: `/ocs/${shortCode}/lots`, aliases: ["units", "owners"] },
    { title: "Levies", href: `/ocs/${shortCode}/levies`, aliases: ["bills", "invoices"] },
    { title: "Budgets", href: `/ocs/${shortCode}/budgets`, aliases: ["budget"] },
    { title: "Documents", href: `/ocs/${shortCode}/documents`, aliases: ["files"] },
    { title: "Meetings", href: `/ocs/${shortCode}/meetings`, aliases: ["agm", "egm"] },
    { title: "Insurance", href: `/ocs/${shortCode}/insurance`, aliases: ["policy"] },
    { title: "Rules", href: `/ocs/${shortCode}/rules`, aliases: ["by-laws"] },
    { title: "Reconciliation", href: `/ocs/${shortCode}/reconciliation`, aliases: ["bank", "transactions"] },
    { title: "Reports", href: `/ocs/${shortCode}/reports`, aliases: ["statement"] },
    { title: "Bank account", href: `/ocs/${shortCode}/bank-account`, aliases: ["trust"] },
    { title: "Settings", href: `/ocs/${shortCode}/settings`, aliases: [] },
  ];
}

function pageMatches(needle: string, p: { title: string; aliases: string[] }): boolean {
  const q = needle.toLowerCase();
  if (p.title.toLowerCase().includes(q)) return true;
  return p.aliases.some((a) => a.toLowerCase().includes(q));
}

// ─── globalSearch ────────────────────────────────────────────────
//
// Single entry point that fans out parallel queries against every searchable
// table and merges the results. `ocShortCode` (passed by the client from the
// URL) scopes everything to one OC when present; absent means "anything in
// the caller's management company."
//
// All queries cap at 5 hits each , anything more dilutes the dropdown. Order
// returned: pages → OCs → lot owners → documents → levies → meetings →
// maintenance → complaints → insurance → notifications. The UI groups by
// `type` and renders in this priority order.

const PER_TYPE_LIMIT = 5;

export async function globalSearch(
  query: string,
  ocShortCode?: string | null,
): Promise<GlobalSearchResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { hits: [] };

  const profile = await requireCompanyRole().catch(() => null);
  if (!profile?.management_company_id) {
    return { hits: [], error: "No management company assigned" };
  }
  const supabase = createServerClient();
  const companyId = profile.management_company_id;
  const like = `%${trimmed.replace(/[%_]/g, (m) => "\\" + m)}%`;

  // Resolve the scope: a single ocId when the caller is inside an OC, or the
  // full company-wide list of ocIds for the dashboard view.
  let scopedOcIds: string[] | null = null;
  let currentOcId: string | null = null;
  let currentOcShort: string | null = null;
  if (ocShortCode) {
    const { data } = await supabase
      .from("owners_corporations")
      .select("id, short_code")
      .eq("management_company_id", companyId)
      .eq("short_code", ocShortCode)
      .maybeSingle();
    if (data) {
      currentOcId = data.id;
      currentOcShort = data.short_code;
      scopedOcIds = [data.id];
    }
  }
  if (!scopedOcIds) {
    const { data } = await supabase
      .from("owners_corporations")
      .select("id, short_code")
      .eq("management_company_id", companyId);
    scopedOcIds = (data ?? []).map((r) => r.id);
  }
  if (scopedOcIds.length === 0) {
    return { hits: [] };
  }

  // Short-code lookup for href construction. Cached across the request.
  const { data: ocCodeRows } = await supabase
    .from("owners_corporations")
    .select("id, short_code, name")
    .in("id", scopedOcIds);
  const ocCodeById = new Map<string, { code: string; name: string }>();
  for (const r of ocCodeRows ?? []) {
    ocCodeById.set(r.id, { code: r.short_code, name: r.name });
  }

  // Run every query in parallel. Each returns its own SearchHit[]; failures
  // degrade silently to [] so a missing table or migration doesn't tank the
  // entire search dropdown.
  const [
    ocRows,
    lotOwnerRows,
    documentRows,
    levyRows,
    meetingRows,
    maintenanceRows,
    complaintRows,
    insuranceRows,
    notificationRows,
  ] = await Promise.all([
    // OCs , only meaningful at company-wide scope.
    ocShortCode
      ? Promise.resolve({ data: null })
      : supabase
          .from("owners_corporations")
          .select("id, short_code, name, plan_number, address, trading_name")
          .eq("management_company_id", companyId)
          .or(`name.ilike.${like},plan_number.ilike.${like},address.ilike.${like},trading_name.ilike.${like},short_code.ilike.${like}`)
          .limit(PER_TYPE_LIMIT),

    // Lot owners , join via lots(oc_id). We can't do a nested filter cleanly
    // in PostgREST, so query lot_owners with embed.
    supabase
      .from("lot_owners")
      .select("id, name, email, phone, postal_address, tenant_name, tenant_email, lot:lots!inner(id, oc_id, lot_number, unit_number)")
      .or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like},postal_address.ilike.${like},tenant_name.ilike.${like},tenant_email.ilike.${like}`)
      .in("lot.oc_id", scopedOcIds)
      .limit(PER_TYPE_LIMIT),

    // Documents , uses the FTS RPC built earlier. The RPC filters by
    // management_company_id; we filter by oc_id client-side if scoped.
    supabase.rpc("search_documents", {
      p_management_company_id: companyId,
      p_query: trimmed,
    }),

    // Levies , match reference_number + bpay_crn.
    supabase
      .from("levy_notices")
      .select("id, oc_id, reference_number, bpay_crn, amount, due_date, status")
      .in("oc_id", scopedOcIds)
      .or(`reference_number.ilike.${like},bpay_crn.ilike.${like}`)
      .limit(PER_TYPE_LIMIT),

    // Meetings , title + reference_number.
    supabase
      .from("meetings")
      .select("id, oc_id, title, reference_number, meeting_type, date_time")
      .in("oc_id", scopedOcIds)
      .or(`title.ilike.${like},reference_number.ilike.${like}`)
      .limit(PER_TYPE_LIMIT),

    // Maintenance requests , title + description + reference_number.
    supabase
      .from("maintenance_requests")
      .select("id, oc_id, title, reference_number, status, priority")
      .in("oc_id", scopedOcIds)
      .or(`title.ilike.${like},description.ilike.${like},reference_number.ilike.${like}`)
      .limit(PER_TYPE_LIMIT),

    // Complaints , description + reference_number.
    supabase
      .from("complaints")
      .select("id, oc_id, reference_number, category, status, description")
      .in("oc_id", scopedOcIds)
      .or(`reference_number.ilike.${like},description.ilike.${like},category.ilike.${like}`)
      .limit(PER_TYPE_LIMIT),

    // Insurance , provider + policy_number + reference_number.
    supabase
      .from("insurance_policies")
      .select("id, oc_id, reference_number, provider, policy_type, policy_number")
      .in("oc_id", scopedOcIds)
      .or(`reference_number.ilike.${like},provider.ilike.${like},policy_number.ilike.${like},policy_type.ilike.${like}`)
      .limit(PER_TYPE_LIMIT),

    // Notifications , caller's own only, title + body.
    supabase
      .from("notifications")
      .select("id, title, body, link, oc_id, created_at")
      .eq("profile_id", profile.id)
      .or(`title.ilike.${like},body.ilike.${like}`)
      .limit(PER_TYPE_LIMIT),
  ]);

  const hits: SearchHit[] = [];

  // Pages , always first when they match (cheap navigation shortcuts).
  const pageCandidates = currentOcShort
    ? ocScopedPages(currentOcShort)
    : GLOBAL_PAGES;
  for (const p of pageCandidates) {
    if (pageMatches(trimmed, p)) {
      hits.push({
        type: "page",
        id: `page:${p.href}`,
        title: p.title,
        badge: "Page",
        href: p.href,
      });
      if (hits.filter((h) => h.type === "page").length >= PER_TYPE_LIMIT) break;
    }
  }

  // OCs.
  for (const r of (ocRows.data ?? []) as Array<{
    id: string; short_code: string; name: string; plan_number: string; address: string; trading_name: string | null;
  }>) {
    hits.push({
      type: "oc",
      id: r.id,
      title: r.trading_name ? `${r.name} (${r.trading_name})` : r.name,
      subtitle: [r.plan_number, r.address].filter(Boolean).join(" · "),
      badge: "OC",
      href: `/ocs/${r.short_code}`,
    });
  }

  // Lot owners. PostgREST returns the nested `lot` as an array even for a
  // to-one relationship via `!inner`, so we read the first element.
  type LotEmbed = { id: string; oc_id: string; lot_number: number; unit_number: string | null };
  type LotOwnerRow = {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    tenant_name: string | null;
    tenant_email: string | null;
    lot: LotEmbed | LotEmbed[] | null;
  };
  for (const r of (lotOwnerRows.data ?? []) as unknown as LotOwnerRow[]) {
    const lot = Array.isArray(r.lot) ? r.lot[0] : r.lot;
    if (!lot) continue;
    const oc = ocCodeById.get(lot.oc_id);
    if (!oc) continue;
    const lotLabel = `Lot ${lot.lot_number}${lot.unit_number ? ` · Unit ${lot.unit_number}` : ""}`;
    hits.push({
      type: "lot_owner",
      id: r.id,
      title: r.name?.trim() || r.tenant_name?.trim() || "(unnamed)",
      subtitle: [oc.name, lotLabel, r.email ?? r.tenant_email].filter(Boolean).join(" · "),
      badge: "Lot owner",
      href: `/ocs/${oc.code}/lots/${lot.id}`,
    });
  }

  // Documents from FTS RPC.
  type DocHit = {
    id: string; file_name: string; category: string; oc_id: string;
    oc_short_code: string | null; oc_name: string | null;
  };
  let docHits = (documentRows.data ?? []) as DocHit[];
  if (currentOcId) docHits = docHits.filter((d) => d.oc_id === currentOcId);
  for (const d of docHits.slice(0, PER_TYPE_LIMIT)) {
    hits.push({
      type: "document",
      id: d.id,
      title: d.file_name,
      subtitle: [d.oc_name, d.category && d.category !== "other" ? d.category : null].filter(Boolean).join(" · "),
      badge: "Document",
      href: d.oc_short_code ? `/ocs/${d.oc_short_code}/documents` : "/ocs",
    });
  }

  // Levies.
  for (const r of (levyRows.data ?? []) as Array<{
    id: string; oc_id: string; reference_number: string; bpay_crn: string | null; amount: number; status: string;
  }>) {
    const oc = ocCodeById.get(r.oc_id);
    if (!oc) continue;
    hits.push({
      type: "levy",
      id: r.id,
      title: r.reference_number,
      subtitle: `${oc.name} · $${Number(r.amount).toLocaleString("en-AU", { minimumFractionDigits: 2 })} · ${r.status}`,
      badge: "Levy",
      href: `/ocs/${oc.code}/levies`,
    });
  }

  // Meetings.
  for (const r of (meetingRows.data ?? []) as Array<{
    id: string; oc_id: string; title: string | null; reference_number: string; meeting_type: string | null; date_time: string;
  }>) {
    const oc = ocCodeById.get(r.oc_id);
    if (!oc) continue;
    hits.push({
      type: "meeting",
      id: r.id,
      title: r.title || r.reference_number,
      subtitle: [oc.name, r.meeting_type, new Date(r.date_time).toLocaleDateString("en-AU")].filter(Boolean).join(" · "),
      badge: "Meeting",
      href: `/ocs/${oc.code}/meetings`,
    });
  }

  // Maintenance.
  for (const r of (maintenanceRows.data ?? []) as Array<{
    id: string; oc_id: string; title: string; reference_number: string; status: string; priority: string;
  }>) {
    const oc = ocCodeById.get(r.oc_id);
    if (!oc) continue;
    hits.push({
      type: "maintenance",
      id: r.id,
      title: r.title,
      subtitle: [oc.name, r.reference_number, r.status, r.priority].filter(Boolean).join(" · "),
      badge: "Maintenance",
      href: `/ocs/${oc.code}/manage`,
    });
  }

  // Complaints.
  for (const r of (complaintRows.data ?? []) as Array<{
    id: string; oc_id: string; reference_number: string; category: string; status: string; description: string | null;
  }>) {
    const oc = ocCodeById.get(r.oc_id);
    if (!oc) continue;
    hits.push({
      type: "complaint",
      id: r.id,
      title: r.category || r.reference_number,
      subtitle: [oc.name, r.reference_number, r.status, r.description?.slice(0, 60)].filter(Boolean).join(" · "),
      badge: "Complaint",
      href: `/ocs/${oc.code}/manage`,
    });
  }

  // Insurance.
  for (const r of (insuranceRows.data ?? []) as Array<{
    id: string; oc_id: string; reference_number: string | null; provider: string; policy_type: string; policy_number: string | null;
  }>) {
    const oc = ocCodeById.get(r.oc_id);
    if (!oc) continue;
    hits.push({
      type: "insurance",
      id: r.id,
      title: `${r.provider} · ${r.policy_type}`,
      subtitle: [oc.name, r.policy_number, r.reference_number].filter(Boolean).join(" · "),
      badge: "Insurance",
      href: `/ocs/${oc.code}/insurance`,
    });
  }

  // Notifications.
  for (const r of (notificationRows.data ?? []) as Array<{
    id: string; title: string; body: string | null; link: string | null;
  }>) {
    hits.push({
      type: "notification",
      id: r.id,
      title: r.title,
      subtitle: r.body?.slice(0, 80) ?? "",
      badge: "Notification",
      href: r.link ?? "/inbox",
    });
  }

  return { hits };
}
