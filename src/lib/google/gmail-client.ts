import "server-only";
import { gmail } from "@googleapis/gmail";
import { JWT } from "google-auth-library";
import { GMAIL_SCOPES } from "./gmail-scopes";

// Gmail client wrapper.
//
// Auth model: Google Workspace Domain-Wide Delegation. The platform owns
// ONE service-account key (GMAIL_SERVICE_ACCOUNT_JSON); each customer
// Workspace super-admin authorises that service account's Client ID
// against the GMAIL_SCOPES list. We then impersonate any mailbox on the
// customer's domain via JWT `subject`.
//
// Quota: Gmail enforces 250 quota units / user / second (each
// users.messages.send burns ~100). We don't pay for Gmail API usage at all
// — quota overruns just fail with 429; the caller retries once after 1s.
// Project-wide daily quota (1.2B units) is effectively infinite.
//
// IMPORTANT: never construct a JWT outside `getGmail()` — every send /
// read MUST pass through this helper so the scope constant + subject
// impersonation are consistently applied.

interface ServiceAccountJson {
  client_email: string;
  private_key: string;
  project_id: string;
}

let parsedSA: ServiceAccountJson | null = null;

function loadServiceAccount(): ServiceAccountJson | null {
  if (parsedSA) return parsedSA;
  const raw = process.env.GMAIL_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    parsedSA = JSON.parse(raw) as ServiceAccountJson;
    return parsedSA;
  } catch (err) {
    console.error("[gmail] Failed to parse GMAIL_SERVICE_ACCOUNT_JSON:", err);
    return null;
  }
}

export function isGmailConfigured(): boolean {
  return !!loadServiceAccount();
}

/** Returns a Gmail API client impersonating the given mailbox. */
export function getGmailClient(managerEmail: string) {
  const sa = loadServiceAccount();
  if (!sa) {
    throw new Error("Gmail is not configured (GMAIL_SERVICE_ACCOUNT_JSON missing)");
  }
  const auth = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [...GMAIL_SCOPES],
    subject: managerEmail,
  });
  return gmail({ version: "v1", auth });
}

// ─── Send ─────────────────────────────────────────────────────────────────
// Composes an RFC822 message (headers + plain HTML body + optional
// attachments via mixed multipart) and POSTs to users.messages.send. The
// raw payload is base64url-encoded per Gmail's API contract.

export interface GmailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface SendViaGmailParams {
  managerEmail: string;
  to: string;
  subject: string;
  htmlBody: string;
  fromDisplayName?: string;
  attachments?: GmailAttachment[];
  /** Optional thread id for keeping replies threaded in Gmail. */
  threadId?: string;
}

export type GmailSendResult =
  | { ok: true; messageId: string; threadId: string; rfc822MessageId: string }
  | { ok: false; error: string; retryable: boolean };

function quotedPrintable(str: string): string {
  // Quick QP-safe escape used only inside the header (subject). Gmail
  // accepts bare UTF-8 in MIME bodies; subject lines are the only spot
  // where unescaped Unicode is unreliable.
  if (/[^\x20-\x7E]/.test(str)) {
    return `=?utf-8?B?${Buffer.from(str, "utf-8").toString("base64")}?=`;
  }
  return str;
}

function buildRawMessage(params: SendViaGmailParams): string {
  const boundary = `----stratawise_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
  const fromHeader = params.fromDisplayName
    ? `${quotedPrintable(params.fromDisplayName)} <${params.managerEmail}>`
    : params.managerEmail;

  const attachments = params.attachments ?? [];
  const hasAttachments = attachments.length > 0;

  const headers = [
    `From: ${fromHeader}`,
    `To: ${params.to}`,
    `Subject: ${quotedPrintable(params.subject)}`,
    `MIME-Version: 1.0`,
  ];

  if (!hasAttachments) {
    headers.push(`Content-Type: text/html; charset="UTF-8"`);
    headers.push(`Content-Transfer-Encoding: 7bit`);
    const message = headers.join("\r\n") + "\r\n\r\n" + params.htmlBody;
    return Buffer.from(message, "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  const parts = [
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    params.htmlBody,
  ];
  for (const att of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.contentType}; name="${att.filename}"`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      att.content.toString("base64").replace(/(.{76})/g, "$1\r\n"),
    );
  }
  parts.push(`--${boundary}--`);

  const message = headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n");
  return Buffer.from(message, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

interface GoogleApiError {
  code?: number;
  errors?: Array<{ reason?: string; message?: string }>;
  message?: string;
}

function isRateLimited(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as GoogleApiError;
  if (e.code === 429) return true;
  if (
    Array.isArray(e.errors) &&
    e.errors.some(
      (entry) =>
        entry.reason === "rateLimitExceeded" ||
        entry.reason === "userRateLimitExceeded",
    )
  ) {
    return true;
  }
  return false;
}

export async function sendViaGmail(
  params: SendViaGmailParams,
): Promise<GmailSendResult> {
  const sa = loadServiceAccount();
  if (!sa) {
    return { ok: false, error: "Gmail is not configured.", retryable: false };
  }
  const gmail = getGmailClient(params.managerEmail);
  const raw = buildRawMessage(params);

  const attempt = async () =>
    gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        ...(params.threadId ? { threadId: params.threadId } : {}),
      },
    });

  let lastErr: unknown = null;
  for (let i = 0; i < 2; i++) {
    try {
      const res = await attempt();
      const id = res.data.id ?? "";
      const threadId = res.data.threadId ?? "";
      // Gmail returns the internal id; the RFC822 Message-ID it stamped on
      // the outgoing email comes back via a follow-up metadata fetch. We
      // pull it once so the caller can store it on communication_log.
      // external_id — matches the In-Reply-To header on future replies.
      let rfc822 = "";
      try {
        const meta = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["Message-ID"],
        });
        const hdr = meta.data.payload?.headers?.find(
          (h) => h.name?.toLowerCase() === "message-id",
        );
        rfc822 = (hdr?.value ?? "").replace(/^<|>$/g, "");
      } catch (metaErr) {
        console.warn("[gmail] message metadata fetch failed", metaErr);
      }
      return {
        ok: true,
        messageId: id,
        threadId,
        rfc822MessageId: rfc822,
      };
    } catch (err) {
      lastErr = err;
      if (i === 0 && isRateLimited(err)) {
        // Per the spec: wait exactly 1s, retry once. If still 429, fail
        // with retryable=true so the dispatcher can fall back to Resend.
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      break;
    }
  }

  const errObj = lastErr as GoogleApiError | null;
  const reason = errObj?.errors?.[0]?.reason ?? "";
  const message =
    errObj?.errors?.[0]?.message ??
    errObj?.message ??
    "Gmail send failed.";
  return {
    ok: false,
    error: `${message}${reason ? ` (${reason})` : ""}`,
    retryable: isRateLimited(lastErr),
  };
}

// ─── Test connection ──────────────────────────────────────────────────────
// Called from /settings → Email tab. Verifies the service account can
// impersonate the given mailbox under the customer's DWD grant.

export type TestConnectionResult =
  | { ok: true; email: string; messagesTotal: number | null }
  | { ok: false; error: string; reason: string };

export async function testGmailConnection(
  managerEmail: string,
): Promise<TestConnectionResult> {
  try {
    const gmail = getGmailClient(managerEmail);
    const res = await gmail.users.getProfile({ userId: "me" });
    return {
      ok: true,
      email: res.data.emailAddress ?? managerEmail,
      messagesTotal: res.data.messagesTotal ?? null,
    };
  } catch (err) {
    const errObj = err as GoogleApiError;
    const reason = errObj?.errors?.[0]?.reason ?? "unknown";
    const message =
      errObj?.errors?.[0]?.message ??
      errObj?.message ??
      "Unable to reach Gmail.";
    return { ok: false, error: message, reason };
  }
}

// ─── Watch (mailbox push) + history-list ingest ──────────────────────────
// Used by the inbound flow:
//   watchMailbox()    → call once per mailbox per ~6 days (Gmail expires
//                       watches after 7 days). Returns historyId we should
//                       persist as the starting cursor.
//   listHistorySince() → on every Pub/Sub push, fetch the diff since the
//                        last historyId. Returns added message ids that
//                        we then fetch full bodies for.
//   getFullMessage()  → fetch one message including headers + body.

export async function watchMailbox(
  managerEmail: string,
  topicName: string,
): Promise<{ ok: true; historyId: string; expiration: string } | { ok: false; error: string }> {
  try {
    const gmail = getGmailClient(managerEmail);
    const res = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName,
        labelIds: ["INBOX"],
        labelFilterBehavior: "INCLUDE",
      },
    });
    return {
      ok: true,
      historyId: String(res.data.historyId ?? ""),
      expiration: String(res.data.expiration ?? ""),
    };
  } catch (err) {
    const message =
      (err as GoogleApiError)?.message ?? "Failed to start Gmail watch";
    return { ok: false, error: message };
  }
}

// Counter-part to watchMailbox — calls users.stop() so Gmail stops
// publishing history events to our Pub/Sub topic. MUST be called when a
// manager disconnects, otherwise inbound keeps landing in /inbox until the
// 7-day watch window naturally expires. Failures are non-fatal — we still
// delete the subscription row so the gmail-push webhook ignores any
// in-flight events.
export async function stopMailboxWatch(
  managerEmail: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const gmail = getGmailClient(managerEmail);
    await gmail.users.stop({ userId: "me" });
    return { ok: true };
  } catch (err) {
    const message =
      (err as GoogleApiError)?.message ?? "Failed to stop Gmail watch";
    return { ok: false, error: message };
  }
}

export async function listHistorySince(
  managerEmail: string,
  startHistoryId: string,
): Promise<{ ok: true; messageIds: string[]; latestHistoryId: string } | { ok: false; error: string }> {
  try {
    const gmail = getGmailClient(managerEmail);
    const res = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      labelId: "INBOX",
      historyTypes: ["messageAdded"],
    });
    const messageIds = new Set<string>();
    for (const h of res.data.history ?? []) {
      for (const m of h.messagesAdded ?? []) {
        if (m.message?.id) messageIds.add(m.message.id);
      }
    }
    return {
      ok: true,
      messageIds: Array.from(messageIds),
      latestHistoryId: String(res.data.historyId ?? startHistoryId),
    };
  } catch (err) {
    const message =
      (err as GoogleApiError)?.message ?? "Failed to list mailbox history";
    return { ok: false, error: message };
  }
}

export interface FetchedGmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  inReplyTo: string | null;
  text: string;
  html: string | null;
  receivedAt: string;
  // Inline metadata for any non-body part with a filename. The bytes are
  // NOT fetched here (each attachment is a separate Gmail API call); the
  // webhook iterates this list and pulls bytes via getMessageAttachment
  // only for the ones it wants to persist.
  attachments: Array<{
    attachmentId: string | null;
    filename: string;
    mimeType: string;
    size: number;
  }>;
}

function decodeBase64Url(input: string): string {
  const padded =
    input.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf-8");
}

function extractBody(
  payload: {
    mimeType?: string | null;
    body?: { data?: string | null; size?: number | null } | null;
    parts?: Array<{
      mimeType?: string | null;
      body?: { data?: string | null } | null;
      parts?: unknown;
    }> | null;
  } | null | undefined,
): { text: string; html: string | null } {
  if (!payload) return { text: "", html: null };
  // Single-part shortcut.
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") {
      return { text: stripHtml(decoded), html: decoded };
    }
    return { text: decoded, html: null };
  }
  let text = "";
  let html: string | null = null;
  const walk = (parts: typeof payload.parts) => {
    for (const part of parts ?? []) {
      if (part.body?.data) {
        const decoded = decodeBase64Url(part.body.data);
        if (part.mimeType === "text/plain" && !text) text = decoded;
        if (part.mimeType === "text/html" && !html) html = decoded;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (part.parts) walk(part.parts as any);
    }
  };
  walk(payload.parts);
  return { text: text || (html ? stripHtml(html) : ""), html };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Walks a Gmail payload tree and collects every "real" attachment — a
// part with a non-empty filename + an attachmentId. We deliberately
// accept inline images too (they often carry filenames for in-body
// rendering); the previous filter was too strict for forwarded emails
// where the attachment lives nested two levels deep under
// multipart/alternative.
function extractAttachments(
  payload: {
    mimeType?: string | null;
    filename?: string | null;
    body?: { attachmentId?: string | null; size?: number | null } | null;
    parts?: Array<{
      mimeType?: string | null;
      filename?: string | null;
      body?: { attachmentId?: string | null; size?: number | null } | null;
      parts?: unknown;
    }> | null;
  } | null | undefined,
): FetchedGmailMessage["attachments"] {
  const out: FetchedGmailMessage["attachments"] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (node: any) => {
    if (!node) return;
    // A non-body part with a filename AND attachmentId is an attachment.
    // Some messages put it at the root (single-attachment send) instead
    // of nested under .parts.
    if (
      node.filename &&
      node.body?.attachmentId &&
      node.mimeType !== "text/plain" &&
      node.mimeType !== "text/html"
    ) {
      out.push({
        attachmentId: node.body.attachmentId,
        filename: node.filename,
        mimeType: node.mimeType ?? "application/octet-stream",
        size: node.body.size ?? 0,
      });
    }
    if (Array.isArray(node.parts)) {
      for (const child of node.parts) walk(child);
    }
  };
  walk(payload);
  return out;
}

// Pulls the bytes for a single attachment. Gmail returns base64url —
// we decode to a Buffer for direct upload to R2.
export async function getMessageAttachment(
  managerEmail: string,
  messageId: string,
  attachmentId: string,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; error: string }> {
  try {
    const gmail = getGmailClient(managerEmail);
    const res = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });
    const data = res.data.data;
    if (!data) return { ok: false, error: "Attachment had no data" };
    const padded =
      data.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (data.length % 4)) % 4);
    return { ok: true, bytes: Buffer.from(padded, "base64") };
  } catch (err) {
    const message =
      (err as GoogleApiError)?.message ?? "Failed to fetch attachment";
    return { ok: false, error: message };
  }
}

export async function getFullMessage(
  managerEmail: string,
  messageId: string,
): Promise<{ ok: true; message: FetchedGmailMessage } | { ok: false; error: string }> {
  try {
    const gmail = getGmailClient(managerEmail);
    const res = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });
    const headers = res.data.payload?.headers ?? [];
    const headerLookup = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value ?? "";

    const fromHeader = headerLookup("from");
    const toHeader = headerLookup("to");
    const subject = headerLookup("subject");
    const inReplyToRaw = headerLookup("in-reply-to");
    const inReplyTo = inReplyToRaw
      ? inReplyToRaw.replace(/^<|>$/g, "").trim() || null
      : null;
    const receivedDate = headerLookup("date");
    const fromMatch = fromHeader.match(/<([^>]+)>/);
    const from = (fromMatch ? fromMatch[1] : fromHeader).toLowerCase().trim();
    const toMatch = toHeader.match(/<([^>]+)>/);
    const to = (toMatch ? toMatch[1] : toHeader).toLowerCase().trim();

    const body = extractBody(res.data.payload ?? undefined);
    const attachments = extractAttachments(res.data.payload ?? undefined);

    return {
      ok: true,
      message: {
        id: messageId,
        threadId: res.data.threadId ?? "",
        from,
        to,
        subject,
        inReplyTo,
        text: body.text,
        html: body.html,
        receivedAt: receivedDate
          ? new Date(receivedDate).toISOString()
          : new Date(Number(res.data.internalDate ?? Date.now())).toISOString(),
        attachments,
      },
    };
  } catch (err) {
    const message =
      (err as GoogleApiError)?.message ?? "Failed to fetch Gmail message";
    return { ok: false, error: message };
  }
}
