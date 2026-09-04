// Shapes and labels for the email log. Outside the "use server" boundary so
// the client can import the labels; see insurance-shared.ts for why that
// distinction is load-bearing.

/** What the provider last told us about a message. These come from the
 *  Resend webhook (see api/webhooks/resend), not from our own optimism at
 *  send time, which is why "sent" and "delivered" are different rows. */
export type EmailStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "bounced"
  | "failed";

/** Never render the raw value. */
export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  bounced: "Bounced",
  failed: "Failed",
};

/** Maps to the status tokens, never a Tailwind ramp. */
export const EMAIL_STATUS_TONE: Record<EmailStatus, "success" | "warning" | "destructive" | "neutral" | "info"> = {
  queued: "neutral",
  sent: "info",
  delivered: "success",
  opened: "success",
  bounced: "destructive",
  failed: "destructive",
};

/** The kinds of message the app sends, as stored in communication_log.type. */
export const EMAIL_TYPE_LABEL: Record<string, string> = {
  levy_notice: "Levy notice",
  levy_reminder: "Levy reminder",
  second_reminder: "Second reminder",
  final_notice: "Final notice",
  meeting_notice: "Meeting notice",
  meeting_minutes: "Meeting minutes",
  invitation: "Portal invitation",
  payment_received: "Payment receipt",
  manager_message: "Message from manager",
  maintenance: "Maintenance",
  compliance: "Compliance reminder",
  insurance: "Insurance",
  phone_call: "Phone call",
  sms: "SMS",
};

export function emailTypeLabel(type: string | null): string {
  if (!type) return "Email";
  return (
    EMAIL_TYPE_LABEL[type] ??
    // Anything not in the map is still a stored key, so it is title-cased
    // rather than shown as a snake_case token.
    type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

export interface EmailLogAttachment {
  label: string;
  /** Route that serves the file. Always an app route, never an R2 URL:
   *  attachments are authorised per request. */
  href: string;
}

export interface EmailLogRow {
  id: string;
  sentAt: string | null;
  subject: string | null;
  type: string | null;
  recipientEmail: string | null;
  /** Who sent it. Null for anything the system issued on a schedule. */
  senderName: string | null;
  ocName: string | null;
  lotLabel: string | null;
  status: EmailStatus;
  errorMessage: string | null;
  attachments: EmailLogAttachment[];
}

export interface EmailLogPage {
  rows: EmailLogRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const EMAIL_LOG_PAGE_SIZE = 25;
