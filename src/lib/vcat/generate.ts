// Framework-agnostic VCAT fee-recovery pack generator. Safe to call from a
// Trigger.dev task. Assembles a ZIP of the documents VCAT expects for a fee
// recovery and uploads it to R2. Guardrail: refuses unless a compliant final
// notice has been served for at least 28 days.

import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import JSZip from "jszip";
import { createServerClient } from "@/lib/supabase";
import { fetchObject, uploadObject } from "@/lib/storage/r2";
import { computeInterest } from "@/lib/escalation/helpers";
import { VcatDoc, type VcatBlock, type VcatDocProps } from "@/lib/pdf/templates/vcat/vcat-doc";
import { fillApplicationForm } from "@/lib/vcat/application-form";

function money(n: number): string {
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function dateLong(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

async function renderDoc(props: VcatDocProps): Promise<Buffer> {
  const el = createElement(VcatDoc, props);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await renderToBuffer(el as any);
}

export interface BuildVcatPackInput {
  lotId: string;
  levyNoticeId: string;
  performerId: string | null;
}

export async function buildVcatPack(input: BuildVcatPackInput): Promise<{ packId?: string; zipKey?: string; error?: string }> {
  const supabase = createServerClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: notice } = await supabase
    .from("levy_notices")
    .select("id, oc_id, lot_id, reference_number, amount, amount_paid, due_date, status, pdf_url, period_start, period_end")
    .eq("id", input.levyNoticeId)
    .maybeSingle();
  if (!notice) return { error: "Levy notice not found" };

  // Guardrail: a compliant final notice, served at least 28 days ago.
  const { data: inst } = await supabase
    .from("escalation_instances")
    .select("id, final_notice_pdf_url, final_notice_served_at")
    .eq("levy_notice_id", notice.id)
    .not("final_notice_pdf_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!inst || !inst.final_notice_pdf_url) {
    return { error: "A final fee notice must be served before a VCAT pack can be prepared." };
  }
  const servedAt = inst.final_notice_served_at ? new Date(inst.final_notice_served_at as string) : null;
  const eligibleFrom = servedAt ? new Date(servedAt.getTime() + 28 * 86_400_000) : null;
  if (!eligibleFrom || eligibleFrom.getTime() > Date.now()) {
    return { error: `Recovery cannot proceed until 28 days after the final notice (eligible from ${eligibleFrom ? dateLong(eligibleFrom.toISOString()) : "n/a"}).` };
  }

  const { data: oc } = await supabase
    .from("owners_corporations")
    .select("name, plan_number, abn, address, suburb, state, postcode, interest_rate_monthly, interest_grace_period_days, interest_enabled, management_companies(name, logo_url, brand_color, phone, email, abn, address)")
    .eq("id", notice.oc_id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mc = (oc as any)?.management_companies ?? {};
  const ocAddress = [oc?.address, oc?.suburb, oc?.state, oc?.postcode].filter(Boolean).join(", ");
  const companyName = (mc.name as string) ?? "StrataWise";
  const logo = (mc.logo_url as string) ?? null;
  const brand = (mc.brand_color as string) ?? null;

  const { data: lot } = await supabase.from("lots").select("lot_number, unit_number, opening_balance").eq("id", notice.lot_id).maybeSingle();
  const { data: owner } = await supabase
    .from("lot_owners").select("name, postal_address, ownership_since, email")
    .eq("lot_id", notice.lot_id).order("created_at", { ascending: true }).limit(1).maybeSingle();

  const { data: allLevies } = await supabase
    .from("levy_notices")
    .select("reference_number, amount, amount_paid, due_date, status, period_start, period_end")
    .eq("lot_id", notice.lot_id)
    .order("due_date", { ascending: true });

  const { data: comms } = await supabase
    .from("communication_log")
    .select("type, channel, recipient_email, status, sent_at, created_at")
    .eq("lot_id", notice.lot_id)
    .eq("related_entity_type", "escalation_instance")
    .order("created_at", { ascending: true });

  const principal = Number(notice.amount) - Number(notice.amount_paid ?? 0);
  const ratePct = oc?.interest_enabled ? Number(oc?.interest_rate_monthly ?? 0) : 0;
  const interest = computeInterest({ principal, dueDate: notice.due_date as string, asOf: today, monthlyRatePct: ratePct, graceDays: Number(oc?.interest_grace_period_days ?? 0) });
  const totalClaim = Math.round((principal + interest.accrued) * 100) / 100;

  const lotLabel = lot ? `Lot ${lot.lot_number}${lot.unit_number ? ` (Unit ${lot.unit_number})` : ""}` : "Lot";
  const ocLine = `${oc?.name ?? "Owners Corporation"} ${oc?.plan_number ?? ""}`.trim();
  const ownerName = owner?.name ?? "";
  const ownerAddress = owner?.postal_address || ocAddress;

  const base = (title: string, blocks: VcatBlock[], opts?: { draft?: boolean; subtitle?: string }): VcatDocProps => ({
    companyName, companyLogoUrl: logo, brandColor: brand,
    title, subtitle: opts?.subtitle ?? null, reference: `${ocLine} , ${lotLabel}`, draft: opts?.draft, blocks,
  });

  // ── Build the branded documents ──
  const docs: Array<{ filename: string; buffer: Buffer }> = [];

  docs.push({ filename: "01-Cover-index.pdf", buffer: await renderDoc(base("VCAT application pack , contents", [
    { type: "para", text: "This pack supports an application to the Victorian Civil and Administrative Tribunal (VCAT) to recover unpaid Owners Corporation fees under the Owners Corporations Act 2006 (Vic). Verify every document before lodging." },
    { type: "table", head: ["#", "Document", "Date"], rows: [
      ["1", "Cover index (this page)", dateLong(today)],
      ["2", "Summary of Proofs (draft)", dateLong(today)],
      ["3", "Fee notice (s.31)", dateLong(notice.due_date as string)],
      ["4", "Final fee notice (s.32)", dateLong(inst.final_notice_served_at as string)],
      ["5", "Proof of service", dateLong(today)],
      ["6", "Statement of account", dateLong(today)],
      ["7", "Interest calculation", dateLong(today)],
      ["8", "Owners Corporation standing", dateLong(today)],
      ["9", "Respondent details", dateLong(today)],
      ["10", "VCAT application form (official, part-filled)", dateLong(today)],
    ] },
  ])) });

  docs.push({ filename: "02-Summary-of-proofs.pdf", buffer: await renderDoc(base("Summary of Proofs , Owners Corporation fee recovery", [
    { type: "kv", rows: [
      { label: "Applicant", value: ocLine },
      { label: "Respondent (lot owner)", value: ownerName },
      { label: "Premises", value: ocAddress },
      { label: "Lot", value: lotLabel },
    ] },
    { type: "heading", text: "Order sought" },
    { type: "kv", rows: [
      { label: "Fees and interest to the final fee notice", value: money(principal + interest.accrued) },
      { label: "Interest since the final fee notice", value: `accruing at ${money(interest.dailyRate)} per day` },
      { label: "Rate of interest", value: `${ratePct}% per month` },
      { label: "Interest approved by resolution at general meeting", value: "Yes / No (verify)" },
      { label: "Reasonable costs incurred", value: "(insert)" },
      { label: "Costs in the proceeding (including application fee)", value: "(insert)" },
    ] },
    { type: "heading", text: "Fee notices" },
    { type: "kv", rows: [
      { label: "Date of fee notice (s.31)", value: dateLong(notice.due_date as string) },
      { label: "Date of final fee notice (s.32)", value: dateLong(inst.final_notice_served_at as string) },
      { label: "Address served", value: ownerAddress },
    ] },
    { type: "para", text: "Copies of all fee notices issued in respect of the total amount claimed are attached. All items claimed are fees or charges the Owners Corporation is entitled to levy under ss 23, 23A and 24 of the Owners Corporations Act 2006 (Vic). Items that are not such a fee or charge have been deducted." },
  ], { draft: true, subtitle: "Statutory declaration form , pre-filled draft for the manager to verify, complete and sign." })) });

  // 03 + 04: the actual served notices (fetched from R2). Fall back to a note.
  let s31: Buffer | null = null;
  if (notice.pdf_url) { try { s31 = await fetchObject(notice.pdf_url as string); } catch { s31 = null; } }
  docs.push(s31
    ? { filename: "03-Fee-notice-s31.pdf", buffer: s31 }
    : { filename: "03-Fee-notice-s31.pdf", buffer: await renderDoc(base("Fee notice (s.31)", [{ type: "para", text: `The original fee notice ${notice.reference_number ?? ""} is not on file as a PDF. Attach the issued levy notice before filing.` }])) });

  let s32: Buffer | null = null;
  try { s32 = await fetchObject(inst.final_notice_pdf_url as string); } catch { s32 = null; }
  docs.push(s32
    ? { filename: "04-Final-fee-notice-s32.pdf", buffer: s32 }
    : { filename: "04-Final-fee-notice-s32.pdf", buffer: await renderDoc(base("Final fee notice (s.32)", [{ type: "para", text: "The final fee notice PDF could not be retrieved. Re-generate it before filing." }])) });

  docs.push({ filename: "05-Proof-of-service.pdf", buffer: await renderDoc(base("Proof of service", [
    { type: "para", text: "Record of notices served on the lot owner, drawn from the communication log." },
    { type: "table", head: ["Date", "Type", "Channel", "To", "Status"], rows: (comms ?? []).map((r) => [
      dateLong((r.sent_at as string) ?? (r.created_at as string)),
      String(r.type ?? ""),
      String(r.channel ?? ""),
      String(r.recipient_email ?? ""),
      String(r.status ?? ""),
    ]) },
  ])) });

  docs.push({ filename: "06-Statement-of-account.pdf", buffer: await renderDoc(base("Statement of account", [
    { type: "kv", rows: [{ label: "Opening balance", value: money(Number(lot?.opening_balance ?? 0)) }] },
    { type: "table", head: ["Reference", "Period", "Due", "Levied", "Paid", "Outstanding"], rows: (allLevies ?? []).map((l) => [
      String(l.reference_number ?? ""),
      `${dateLong(l.period_start as string)} , ${dateLong(l.period_end as string)}`,
      dateLong(l.due_date as string),
      money(Number(l.amount)),
      money(Number(l.amount_paid ?? 0)),
      money(Number(l.amount) - Number(l.amount_paid ?? 0)),
    ]) },
  ])) });

  docs.push({ filename: "07-Interest-calculation.pdf", buffer: await renderDoc(base("Interest calculation", [
    { type: "kv", rows: [
      { label: "Principal outstanding", value: money(principal) },
      { label: "Rate of interest", value: `${ratePct}% per month` },
      { label: "Days charged (after grace)", value: String(interest.daysCharged) },
      { label: "Daily accrual", value: `${money(interest.dailyRate)} per day` },
      { label: "Interest accrued to date", value: money(interest.accrued) },
      { label: "Total claim (principal + interest)", value: money(totalClaim) },
    ] },
    { type: "para", text: "Interest is calculated as simple interest on the outstanding principal from the due date (after any grace period), capped at the maximum rate permitted. Confirm the resolution authorising interest under s.29 before filing." },
  ])) });

  docs.push({ filename: "08-OC-standing.pdf", buffer: await renderDoc(base("Owners Corporation standing and authority", [
    { type: "kv", rows: [
      { label: "Owners Corporation", value: oc?.name ?? "" },
      { label: "Plan of subdivision", value: oc?.plan_number ?? "" },
      { label: "ABN", value: oc?.abn ?? "" },
      { label: "Registered address", value: ocAddress },
      { label: "Manager", value: companyName },
    ] },
    { type: "para", text: "No special resolution is required to commence fee recovery at VCAT. The Owners Corporation, through its appointed manager, is authorised to bring this application. Attach any internal authorisation your process requires." },
  ])) });

  docs.push({ filename: "09-Respondent-details.pdf", buffer: await renderDoc(base("Respondent details", [
    { type: "kv", rows: [
      { label: "Respondent (legal owner)", value: ownerName || "(verify , owner name missing)" },
      { label: "Service address", value: ownerAddress },
      { label: "Lot", value: lotLabel },
      { label: "Owner recorded since", value: owner?.ownership_since ? dateLong(owner.ownership_since as string) : "(verify , ownership date not recorded)" },
    ] },
    { type: "para", text: owner?.name ? "Confirm the respondent is the current registered proprietor before filing." : "WARNING: no owner name is recorded for this lot. Confirm the current registered proprietor before filing , a wrong respondent name can defeat the application." },
  ])) });

  // 10: official application form, best-effort fill.
  const appForm = await fillApplicationForm({
    claimAmount: money(totalClaim),
    premisesDetails: ocLine,
    premisesAddress: oc?.address ?? "",
    premisesSuburb: oc?.suburb ?? "",
    ocName: oc?.name ?? "",
    ocRegisteredNo: oc?.plan_number ?? "",
    contactName: companyName,
    contactNumber: (mc.phone as string) ?? "",
    contactEmail: (mc.email as string) ?? "",
  });
  if (appForm) docs.push({ filename: "10-VCAT-application-form.pdf", buffer: appForm });

  // ── Zip + upload ──
  const zip = new JSZip();
  for (const d of docs) zip.file(d.filename, d.buffer);
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  const { data: pack, error: packErr } = await supabase
    .from("vcat_packs")
    .insert({
      oc_id: notice.oc_id,
      lot_id: notice.lot_id,
      levy_notice_id: notice.id,
      escalation_instance_id: inst.id,
      status: "ready",
      created_by: input.performerId,
    })
    .select("id")
    .single();
  if (packErr || !pack) return { error: packErr?.message ?? "Could not record the pack" };

  const zipKey = `vcat-packs/${notice.oc_id}/${pack.id}.zip`;
  await uploadObject(zipKey, zipBuffer, "application/zip");
  await supabase.from("vcat_packs").update({ zip_key: zipKey }).eq("id", pack.id);

  return { packId: pack.id, zipKey };
}
