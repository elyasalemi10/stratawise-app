"use server";

import { z } from "zod";
import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { sendSms, normaliseAuMobile } from "@/lib/sms";
import { sendManagerMessageEmail } from "@/lib/email";
import { ensureManagerUsername } from "@/lib/actions/manager-username";

// Communications tab server actions (Item 15). Each path:
//   1. Validates with Zod
//   2. Performs the side-effect (SMS / email / call-log entry)
//   3. Writes a row to communication_log
//   4. Writes an audit_log row via logAudit

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ─── Log a phone call ───────────────────────────────────────────────────────

const logPhoneCallSchema = z.object({
  oc_id: z.string().uuid(),
  lot_id: z.string().uuid(),
  recipient_phone: z.string().trim().min(1).max(40),
  direction: z.enum(["outbound", "inbound"]),
  duration_seconds: z.number().int().min(0).max(60 * 60 * 12).nullable().optional(),
  notes: z.string().trim().min(1).max(2000),
});

export async function logPhoneCall(
  input: z.input<typeof logPhoneCallSchema>,
): Promise<Result<{ id: string }>> {
  const parsed = logPhoneCallSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: row, error } = await supabase
    .from("communication_log")
    .insert({
      oc_id: parsed.data.oc_id,
      lot_id: parsed.data.lot_id,
      sender_profile_id: profile.id,
      channel: "voice",
      type: "phone_call",
      direction: parsed.data.direction,
      duration_seconds: parsed.data.duration_seconds ?? null,
      recipient_phone: parsed.data.recipient_phone,
      body_preview: parsed.data.notes.slice(0, 200),
      body_full: parsed.data.notes,
      status: "logged",
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !row) return { ok: false, error: "Could not save the call log." };

  await logAudit({
    profileId: profile.id,
    ocId: parsed.data.oc_id,
    action: "create",
    entityType: "phone_call",
    entityId: row.id as string,
    after: {
      lot_id: parsed.data.lot_id,
      recipient_phone: parsed.data.recipient_phone,
      direction: parsed.data.direction,
      duration_seconds: parsed.data.duration_seconds ?? null,
    },
    metadata: { lot_id: parsed.data.lot_id },
  });

  return { ok: true, data: { id: row.id as string } };
}

// ─── Send SMS ──────────────────────────────────────────────────────────────
// Manager confirmation is enforced by the popover UI (this action ASSUMES the
// confirmation step happened). SMS cost is the reason — every send is billable
// so we never auto-fire from a background job.

const sendSmsSchema = z.object({
  oc_id: z.string().uuid(),
  lot_id: z.string().uuid(),
  recipient_phone: z.string().trim().min(1).max(40),
  body: z.string().trim().min(1).max(1000),
  confirmed: z.literal(true),
});

export async function sendLotSms(
  input: z.input<typeof sendSmsSchema>,
): Promise<Result<{ id: string }>> {
  const parsed = sendSmsSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Please confirm the SMS send before submitting.",
    };

  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const normalised = normaliseAuMobile(parsed.data.recipient_phone);
  if (!normalised) return { ok: false, error: "Recipient mobile number is not valid." };

  const smsResult = await sendSms({
    to: normalised,
    body: parsed.data.body,
  });

  const { data: row, error } = await supabase
    .from("communication_log")
    .insert({
      oc_id: parsed.data.oc_id,
      lot_id: parsed.data.lot_id,
      sender_profile_id: profile.id,
      channel: "sms",
      type: "manager_message",
      direction: "outbound",
      recipient_phone: normalised,
      body_preview: parsed.data.body.slice(0, 200),
      body_full: parsed.data.body,
      status: smsResult.ok ? (smsResult.dryRun ? "queued" : "sent") : "failed",
      external_id: smsResult.id ?? null,
      error_message: smsResult.ok ? null : smsResult.error ?? null,
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !row) {
    return { ok: false, error: smsResult.ok ? "SMS sent but the log row didn't save." : smsResult.error ?? "Could not send SMS." };
  }

  await logAudit({
    profileId: profile.id,
    ocId: parsed.data.oc_id,
    action: "send",
    entityType: "sms",
    entityId: row.id as string,
    after: {
      lot_id: parsed.data.lot_id,
      recipient_phone: normalised,
      length: parsed.data.body.length,
      status: smsResult.ok ? "sent" : "failed",
    },
    metadata: { lot_id: parsed.data.lot_id },
  });

  if (!smsResult.ok) return { ok: false, error: smsResult.error ?? "Could not send SMS." };
  return { ok: true, data: { id: row.id as string } };
}

// ─── Send Email ────────────────────────────────────────────────────────────
// FROM resolves to `<email_username>@<brand-domain>`; we lazy-derive the
// manager's username on first use via ensureManagerUsername.

const sendEmailSchema = z.object({
  oc_id: z.string().uuid(),
  lot_id: z.string().uuid(),
  recipient_email: z.string().email(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
});

export async function sendLotEmail(
  input: z.input<typeof sendEmailSchema>,
): Promise<Result<{ id: string }>> {
  const parsed = sendEmailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  // Best-effort username creation. If it fails we still send from the legacy
  // noreply address — the user can see the resulting log row and fix later.
  await ensureManagerUsername();

  const result = await sendManagerMessageEmail({
    managerProfileId: profile.id,
    to: parsed.data.recipient_email,
    subject: parsed.data.subject,
    bodyText: parsed.data.body,
  });

  let status: "sent" | "failed" | "queued" = "sent";
  let externalId: string | null = null;
  let errorMessage: string | null = null;

  if ("dryRun" in result) {
    status = "queued";
  } else if ("error" in result) {
    status = "failed";
    errorMessage = result.error;
  } else {
    externalId = result.id;
  }

  const { data: row, error } = await supabase
    .from("communication_log")
    .insert({
      oc_id: parsed.data.oc_id,
      lot_id: parsed.data.lot_id,
      sender_profile_id: profile.id,
      channel: "email",
      type: "manager_message",
      direction: "outbound",
      recipient_email: parsed.data.recipient_email,
      subject: parsed.data.subject,
      body_preview: parsed.data.body.slice(0, 200),
      body_full: parsed.data.body,
      status,
      external_id: externalId,
      error_message: errorMessage,
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !row) {
    return {
      ok: false,
      error: status === "failed" ? errorMessage ?? "Could not send email." : "Email sent but the log row didn't save.",
    };
  }

  await logAudit({
    profileId: profile.id,
    ocId: parsed.data.oc_id,
    action: "send",
    entityType: "email",
    entityId: row.id as string,
    after: {
      lot_id: parsed.data.lot_id,
      recipient_email: parsed.data.recipient_email,
      subject: parsed.data.subject,
      status,
    },
    metadata: { lot_id: parsed.data.lot_id },
  });

  if (status === "failed") return { ok: false, error: errorMessage ?? "Could not send email." };
  return { ok: true, data: { id: row.id as string } };
}

// ─── List communications for a lot ─────────────────────────────────────────

export interface LotCommunicationRow {
  id: string;
  created_at: string;
  channel: string;
  type: string;
  direction: string | null;
  subject: string | null;
  body_preview: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  duration_seconds: number | null;
  status: string;
  actor_name: string | null;
}

export async function listLotCommunications(lotId: string): Promise<LotCommunicationRow[]> {
  await requireCompanyRole();
  const supabase = createServerClient();

  const { data } = await supabase
    .from("communication_log")
    .select(
      "id, created_at, channel, type, direction, subject, body_preview, recipient_email, recipient_phone, duration_seconds, status, sender_profile_id",
    )
    .eq("lot_id", lotId)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = data ?? [];
  const actorIds = Array.from(
    new Set(rows.map((r) => r.sender_profile_id).filter((v): v is string => !!v)),
  );
  const actorMap: Record<string, string> = {};
  if (actorIds.length > 0) {
    const { data: actors } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", actorIds);
    (actors ?? []).forEach((a) => {
      actorMap[a.id as string] =
        [a.first_name, a.last_name].filter(Boolean).join(" ") || (a.email as string) || "System";
    });
  }

  return rows.map((r) => ({
    id: r.id as string,
    created_at: r.created_at as string,
    channel: r.channel as string,
    type: r.type as string,
    direction: (r.direction as string) ?? null,
    subject: (r.subject as string) ?? null,
    body_preview: (r.body_preview as string) ?? null,
    recipient_email: (r.recipient_email as string) ?? null,
    recipient_phone: (r.recipient_phone as string) ?? null,
    duration_seconds: (r.duration_seconds as number) ?? null,
    status: r.status as string,
    actor_name: r.sender_profile_id ? actorMap[r.sender_profile_id as string] ?? null : null,
  }));
}
