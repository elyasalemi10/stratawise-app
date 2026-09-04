"use server";

import { requireCompanyRole, requireOCAccess, getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import {
  EMAIL_LOG_PAGE_SIZE,
  type EmailLogAttachment,
  type EmailLogPage,
  type EmailLogRow,
  type EmailStatus,
} from "@/lib/email-log-shared";

// ============================================================================
// The email log.
// ----------------------------------------------------------------------------
// Every outbound message is already written to communication_log at send
// time, and the Resend webhook updates its status as the provider reports
// back, so delivered / opened / bounced are the provider's word rather than
// ours. None of it was readable anywhere: a manager asked "did the owner get
// their notice" and the only answer was to look in Resend's dashboard.
//
// Two scopes, one query shape:
//   oc    everything sent on behalf of one Owners Corporation
//   mine  everything sent from this person's account, across every OC
//
// Paginated, because a hundred-lot OC issuing quarterly levies writes four
// hundred rows a year and nobody scrolls that.
// ============================================================================

/** Only outbound email. Phone calls and SMS live on the lot's
 *  communications tab, where they have their own affordances. */
const EMAIL_CHANNELS = ["email"];

interface RawRow {
  id: string;
  sent_at: string | null;
  created_at: string;
  subject: string | null;
  type: string | null;
  recipient_email: string | null;
  sender_profile_id: string | null;
  oc_id: string | null;
  lot_id: string | null;
  status: string | null;
  error_message: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
}

/**
 * What was attached, as links the app can authorise.
 *
 * communication_log does not store attachments: it stores what the message
 * was ABOUT. That is enough, because the attachment is always the document
 * that entity owns, and going through the app route means the same access
 * check runs as anywhere else. An R2 URL in this table would be a
 * permanent unauthenticated link to an owner's levy notice.
 */
function attachmentsFor(row: RawRow): EmailLogAttachment[] {
  if (!row.related_entity_id) return [];
  switch (row.related_entity_type) {
    case "levy_notice":
      return [{ label: "Levy notice (PDF)", href: `/api/levies/${row.related_entity_id}/pdf` }];
    case "document":
      return [{ label: "Attachment", href: `/api/documents/${row.related_entity_id}` }];
    case "meeting":
      return [{ label: "Meeting notice (PDF)", href: `/api/meetings/${row.related_entity_id}/notice` }];
    default:
      return [];
  }
}

function normaliseStatus(value: string | null): EmailStatus {
  switch (value) {
    case "queued":
    case "sent":
    case "delivered":
    case "opened":
    case "bounced":
    case "failed":
      return value;
    default:
      // A row written before the webhook existed, or one whose enum value we
      // do not recognise. "Sent" is what we know for certain: we handed it to
      // the provider.
      return "sent";
  }
}

async function buildPage(
  rows: RawRow[],
  total: number,
  page: number,
): Promise<EmailLogPage> {
  const supabase = createServerClient();

  // Three lookups for the whole page rather than three per row.
  const senderIds = [...new Set(rows.map((r) => r.sender_profile_id).filter(Boolean))] as string[];
  const ocIds = [...new Set(rows.map((r) => r.oc_id).filter(Boolean))] as string[];
  const lotIds = [...new Set(rows.map((r) => r.lot_id).filter(Boolean))] as string[];

  const [senders, ocs, lots] = await Promise.all([
    senderIds.length
      ? supabase.from("profiles").select("id, first_name, last_name").in("id", senderIds)
      : Promise.resolve({ data: [] }),
    ocIds.length
      ? supabase.from("owners_corporations").select("id, name").in("id", ocIds)
      : Promise.resolve({ data: [] }),
    lotIds.length
      ? supabase.from("lots").select("id, lot_number, unit_number").in("id", lotIds)
      : Promise.resolve({ data: [] }),
  ]);

  const senderById = new Map(
    ((senders.data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).map(
      (p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || null],
    ),
  );
  const ocById = new Map(
    ((ocs.data ?? []) as Array<{ id: string; name: string }>).map((o) => [o.id, o.name]),
  );
  const lotById = new Map(
    ((lots.data ?? []) as Array<{ id: string; lot_number: number; unit_number: string | null }>).map(
      (l) => [l.id, l.unit_number ? `Lot ${l.lot_number} (${l.unit_number})` : `Lot ${l.lot_number}`],
    ),
  );

  return {
    rows: rows.map<EmailLogRow>((r) => ({
      id: r.id,
      sentAt: r.sent_at ?? r.created_at,
      subject: r.subject,
      type: r.type,
      recipientEmail: r.recipient_email,
      senderName: r.sender_profile_id ? senderById.get(r.sender_profile_id) ?? null : null,
      ocName: r.oc_id ? ocById.get(r.oc_id) ?? null : null,
      lotLabel: r.lot_id ? lotById.get(r.lot_id) ?? null : null,
      status: normaliseStatus(r.status),
      errorMessage: r.error_message,
      attachments: attachmentsFor(r),
    })),
    total,
    page,
    pageSize: EMAIL_LOG_PAGE_SIZE,
  };
}

const SELECT =
  "id, sent_at, created_at, subject, type, recipient_email, sender_profile_id, oc_id, lot_id, status, error_message, related_entity_type, related_entity_id";

/** Everything sent on behalf of one OC. */
export async function getOCEmailLog(ocId: string, page = 0): Promise<EmailLogPage> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();
  const from = page * EMAIL_LOG_PAGE_SIZE;

  const { data, count } = await supabase
    .from("communication_log")
    .select(SELECT, { count: "exact" })
    .eq("oc_id", ocId)
    .eq("direction", "outbound")
    .in("channel", EMAIL_CHANNELS)
    .order("created_at", { ascending: false })
    .range(from, from + EMAIL_LOG_PAGE_SIZE - 1);

  return buildPage((data ?? []) as unknown as RawRow[], count ?? 0, page);
}

/** Everything sent from the signed-in person's account, across every OC. */
export async function getMyEmailLog(page = 0): Promise<EmailLogPage> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  const supabase = createServerClient();
  const from = page * EMAIL_LOG_PAGE_SIZE;

  const { data, count } = await supabase
    .from("communication_log")
    .select(SELECT, { count: "exact" })
    .eq("sender_profile_id", profile.id)
    .eq("direction", "outbound")
    .in("channel", EMAIL_CHANNELS)
    .order("created_at", { ascending: false })
    .range(from, from + EMAIL_LOG_PAGE_SIZE - 1);

  return buildPage((data ?? []) as unknown as RawRow[], count ?? 0, page);
}

/** Company-wide, for an admin looking across every OC they manage. */
export async function getCompanyEmailLog(page = 0): Promise<EmailLogPage> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();
  const from = page * EMAIL_LOG_PAGE_SIZE;

  const { data: ocRows } = await supabase
    .from("owners_corporations")
    .select("id")
    .eq("management_company_id", profile.management_company_id);
  const ocIds = ((ocRows ?? []) as Array<{ id: string }>).map((o) => o.id);
  if (ocIds.length === 0) {
    return { rows: [], total: 0, page, pageSize: EMAIL_LOG_PAGE_SIZE };
  }

  const { data, count } = await supabase
    .from("communication_log")
    .select(SELECT, { count: "exact" })
    .in("oc_id", ocIds)
    .eq("direction", "outbound")
    .in("channel", EMAIL_CHANNELS)
    .order("created_at", { ascending: false })
    .range(from, from + EMAIL_LOG_PAGE_SIZE - 1);

  return buildPage((data ?? []) as unknown as RawRow[], count ?? 0, page);
}
