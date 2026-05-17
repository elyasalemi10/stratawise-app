"use server";

import { z } from "zod";
import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { sendManagerMessageEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { ensureManagerUsername } from "@/lib/actions/manager-username";

// Inbox email helpers used by /inbox/inbox-content.tsx.
//
//   getInboxEmail(communicationLogId)
//     Returns the inbound communication_log row + the outbound row it was
//     a reply to (if any), with sender/recipient/subject/body for the
//     email-style detail view.
//
//   replyToInboxEmail({ communicationLogId, body })
//     Sends a reply via sendManagerMessageEmail, writes a new outbound
//     row to communication_log, audits the send. Recipient = the
//     inbound row's sender; subject = "Re: <subject>" (skipping
//     duplicate "Re:" prefixes).
//
//   associateInboxEmailToLot({ communicationLogId, oc_id, lot_id })
//     Manual fallback when In-Reply-To match failed. Updates the
//     inbound row's oc_id + lot_id + recipient_id so it shows up on
//     the lot's Communications tab.

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface InboxEmailDetail {
  id: string;
  sent_at: string | null;
  created_at: string;
  subject: string;
  body: string;
  sender_email: string;
  recipient_email: string;
  // Carried metadata if the inbound is associated to a lot.
  oc_id: string | null;
  lot_id: string | null;
  oc_name: string | null;
  lot_label: string | null;
  // The outbound row this is a reply to (when auto-match found one).
  outbound: {
    id: string;
    subject: string | null;
    sent_at: string | null;
    body: string | null;
  } | null;
}

export async function getInboxEmail(
  communicationLogId: string,
): Promise<Result<InboxEmailDetail>> {
  if (!communicationLogId) return { ok: false, error: "Missing email id" };
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: row, error } = await supabase
    .from("communication_log")
    .select(
      "id, sent_at, created_at, subject, body_full, body_preview, recipient_email, recipient_id, oc_id, lot_id, related_entity_type, related_entity_id, direction, channel, recipient_phone",
    )
    .eq("id", communicationLogId)
    .single();

  if (error || !row) return { ok: false, error: "Email not found" };
  if (row.recipient_id !== profile.id) {
    return { ok: false, error: "You don't have access to this email" };
  }

  // Sender lives on recipient_email for inbound rows (we stored the manager's
  // address there because that's where the reply landed). For an inbound,
  // the OWNER's address is on subject's metadata... actually we DO need a
  // sender field. Looking at the insert code: subject is the inbound
  // subject, recipient_email is the manager's address. The owner's sender
  // address goes on the audit row but we didn't store it on the comm_log.
  // For now we pull it from notifications.metadata.sender_email — joined below.
  const { data: notif } = await supabase
    .from("notifications")
    .select("metadata")
    .eq("profile_id", profile.id)
    .filter("metadata->>communication_log_id", "eq", communicationLogId)
    .maybeSingle();
  const senderEmail =
    ((notif as { metadata: { sender_email?: string } | null } | null)?.metadata
      ?.sender_email as string | undefined) ?? "";

  let outbound: InboxEmailDetail["outbound"] = null;
  if (row.related_entity_type === "communication_log" && row.related_entity_id) {
    const { data: out } = await supabase
      .from("communication_log")
      .select("id, subject, sent_at, body_full")
      .eq("id", row.related_entity_id as string)
      .maybeSingle();
    if (out) {
      outbound = {
        id: out.id as string,
        subject: (out.subject as string | null) ?? null,
        sent_at: (out.sent_at as string | null) ?? null,
        body: (out.body_full as string | null) ?? null,
      };
    }
  }

  let ocName: string | null = null;
  let lotLabel: string | null = null;
  if (row.oc_id) {
    const { data: oc } = await supabase
      .from("owners_corporations")
      .select("name")
      .eq("id", row.oc_id as string)
      .maybeSingle();
    ocName = (oc as { name: string | null } | null)?.name ?? null;
  }
  if (row.lot_id) {
    const { data: lot } = await supabase
      .from("lots")
      .select("lot_number, unit_number")
      .eq("id", row.lot_id as string)
      .maybeSingle();
    if (lot) {
      const unit = (lot as { unit_number: string | null }).unit_number;
      lotLabel = `Lot ${(lot as { lot_number: number }).lot_number}${unit ? ` · Unit ${unit}` : ""}`;
    }
  }

  return {
    ok: true,
    data: {
      id: row.id as string,
      sent_at: (row.sent_at as string | null) ?? null,
      created_at: row.created_at as string,
      subject: (row.subject as string) ?? "",
      body: ((row.body_full as string | null) ?? (row.body_preview as string | null) ?? ""),
      sender_email: senderEmail,
      recipient_email: (row.recipient_email as string) ?? "",
      oc_id: (row.oc_id as string | null) ?? null,
      lot_id: (row.lot_id as string | null) ?? null,
      oc_name: ocName,
      lot_label: lotLabel,
      outbound,
    },
  };
}

// ─── Reply to an inbox email ───────────────────────────────────────────

const replySchema = z.object({
  communicationLogId: z.string().uuid(),
  body: z.string().trim().min(1).max(20000),
});

export async function replyToInboxEmail(
  input: z.input<typeof replySchema>,
): Promise<Result<{ id: string }>> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const detail = await getInboxEmail(parsed.data.communicationLogId);
  if (!detail.ok) return detail;

  const { data } = detail;
  if (!data.sender_email) {
    return { ok: false, error: "Couldn't determine the original sender." };
  }

  await ensureManagerUsername();

  const replySubject = data.subject.toLowerCase().startsWith("re:")
    ? data.subject
    : `Re: ${data.subject}`;

  const result = await sendManagerMessageEmail({
    managerProfileId: profile.id,
    to: data.sender_email,
    subject: replySubject,
    bodyText: parsed.data.body,
  });

  if ("error" in result) return { ok: false, error: result.error };

  const externalId = "id" in result ? result.id : null;

  const { data: outbound, error: insertErr } = await supabase
    .from("communication_log")
    .insert({
      oc_id: data.oc_id,
      lot_id: data.lot_id,
      sender_profile_id: profile.id,
      channel: "email",
      type: "manager_message",
      direction: "outbound",
      recipient_email: data.sender_email,
      subject: replySubject,
      body_preview: parsed.data.body.slice(0, 200),
      body_full: parsed.data.body,
      status: "dryRun" in result ? "queued" : "sent",
      external_id: externalId,
      sent_at: new Date().toISOString(),
      related_entity_type: "communication_log",
      related_entity_id: data.id,
    })
    .select("id")
    .single();

  if (insertErr || !outbound) {
    return { ok: false, error: "Reply sent but the log row didn't save." };
  }

  await logAudit({
    profileId: profile.id,
    ocId: data.oc_id ?? undefined,
    action: "send",
    entityType: "email",
    entityId: outbound.id as string,
    after: {
      reply_to: data.id,
      recipient_email: data.sender_email,
      subject: replySubject,
    },
    metadata: data.lot_id ? { lot_id: data.lot_id } : undefined,
  });

  return { ok: true, data: { id: outbound.id as string } };
}

// ─── Manual associate (fallback when auto-match failed) ────────────────

const associateSchema = z.object({
  communicationLogId: z.string().uuid(),
  oc_id: z.string().uuid(),
  lot_id: z.string().uuid().nullable(),
});

export async function associateInboxEmailToLot(
  input: z.input<typeof associateSchema>,
): Promise<Result<{ id: string }>> {
  const parsed = associateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: existing } = await supabase
    .from("communication_log")
    .select("id, recipient_id")
    .eq("id", parsed.data.communicationLogId)
    .single();
  if (!existing || existing.recipient_id !== profile.id) {
    return { ok: false, error: "You don't have access to this email" };
  }

  const { error } = await supabase
    .from("communication_log")
    .update({
      oc_id: parsed.data.oc_id,
      lot_id: parsed.data.lot_id,
    })
    .eq("id", parsed.data.communicationLogId);
  if (error) return { ok: false, error: error.message };

  // Mirror onto the notification so future opens of the inbox carry the
  // updated oc_id (a notification's oc_id powers the breadcrumb context).
  await supabase
    .from("notifications")
    .update({ oc_id: parsed.data.oc_id })
    .eq("profile_id", profile.id)
    .filter("metadata->>communication_log_id", "eq", parsed.data.communicationLogId);

  await logAudit({
    profileId: profile.id,
    ocId: parsed.data.oc_id,
    action: "associate",
    entityType: "email",
    entityId: parsed.data.communicationLogId,
    after: {
      oc_id: parsed.data.oc_id,
      lot_id: parsed.data.lot_id,
    },
    metadata: parsed.data.lot_id ? { lot_id: parsed.data.lot_id } : undefined,
  });

  return { ok: true, data: { id: parsed.data.communicationLogId } };
}

// ─── OC / Lot lookups for the associate picker ─────────────────────────

export interface OcPickerOption {
  id: string;
  name: string;
}

export interface LotPickerOption {
  id: string;
  label: string;
  owner_name: string | null;
}

export async function listOcsForAssociate(): Promise<OcPickerOption[]> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  if (!profile.management_company_id) return [];
  const { data } = await supabase
    .from("owners_corporations")
    .select("id, name")
    .eq("management_company_id", profile.management_company_id)
    .order("name", { ascending: true })
    .limit(500);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r.name as string) ?? "",
  }));
}

export async function listLotsForAssociate(
  ocId: string,
): Promise<LotPickerOption[]> {
  await requireCompanyRole();
  const supabase = createServerClient();

  const { data } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number")
    .eq("oc_id", ocId)
    .order("lot_number", { ascending: true });
  const lots = data ?? [];

  // Pull owner names for the label.
  const lotIds = lots.map((l) => l.id as string);
  const ownerLookup: Record<string, string | null> = {};
  if (lotIds.length > 0) {
    const { data: owners } = await supabase
      .from("lot_owners")
      .select("lot_id, name")
      .in("lot_id", lotIds);
    for (const o of owners ?? []) {
      ownerLookup[o.lot_id as string] = (o.name as string | null) ?? null;
    }
  }

  return lots.map((l) => {
    const unit = l.unit_number as string | null;
    const label = `Lot ${l.lot_number}${unit ? ` · Unit ${unit}` : ""}`;
    return {
      id: l.id as string,
      label,
      owner_name: ownerLookup[l.id as string] ?? null,
    };
  });
}
