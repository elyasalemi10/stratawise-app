import "server-only";

// Microsoft Graph client for Outlook send-as + inbound. Mirrors
// gmail-client.ts in shape and contract so transportSend() can route to
// either transport without per-call branching.
//
// Auth model: tenant-scoped client credentials. Each customer's
// Workspace admin grants consent ONCE via the admin-consent flow (see
// /onboarding/outlook callback); we store their tenantId on
// management_companies.mail_provider_config.tenant_id. From then on we
// mint a tenant-scoped Graph access token via the v2.0/token endpoint
// with `grant_type=client_credentials` + `scope=.default`. Tokens last
// 60 min; we don't cache them long-term , minting per call is cheap
// enough at our send rate and avoids cache-staleness bugs.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const LOGIN_BASE = "https://login.microsoftonline.com";

export function isOutlookConfigured(): boolean {
  return !!(process.env.OUTLOOK_CLIENT_ID && process.env.OUTLOOK_CLIENT_SECRET);
}

export interface OutlookAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

interface GraphTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface GraphErrorPayload {
  error?: {
    code?: string;
    message?: string;
    innerError?: { code?: string };
  };
}

// Mint an access token scoped to `tenantId`. Throws on failure with the
// raw Graph error message so callers can surface it verbatim.
async function getGraphTokenForTenant(tenantId: string): Promise<string> {
  const clientId = process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Outlook credentials are not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(`${LOGIN_BASE}/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph token error (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as GraphTokenResponse;
  if (!json.access_token) throw new Error("Graph token response missing access_token");
  return json.access_token;
}

async function graphFetch(
  tenantId: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getGraphTokenForTenant(tenantId);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${GRAPH_BASE}${path}`, { ...init, headers });
}

// ─── Test connection ──────────────────────────────────────────────────
export type TestOutlookResult =
  | { ok: true; mailbox: string; displayName: string | null }
  | { ok: false; error: string; reason: string };

export async function testOutlookConnection(
  tenantId: string,
  mailbox: string,
): Promise<TestOutlookResult> {
  try {
    const res = await graphFetch(tenantId, `/users/${encodeURIComponent(mailbox)}`);
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as GraphErrorPayload;
      return {
        ok: false,
        error: payload.error?.message ?? `Graph error ${res.status}`,
        reason: payload.error?.code ?? `http_${res.status}`,
      };
    }
    const data = (await res.json()) as { mail?: string; userPrincipalName: string; displayName?: string };
    return {
      ok: true,
      mailbox: data.mail ?? data.userPrincipalName,
      displayName: data.displayName ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      reason: "request_failed",
    };
  }
}

// ─── Send mail ────────────────────────────────────────────────────────
export type OutlookSendResult =
  | { ok: true; rfc822MessageId: string | null }
  | { ok: false; error: string; retryable: boolean };

export async function sendViaOutlook(params: {
  tenantId: string;
  mailbox: string;
  to: string;
  subject: string;
  htmlBody: string;
  attachments?: OutlookAttachment[];
}): Promise<OutlookSendResult> {
  const message = {
    subject: params.subject,
    body: {
      contentType: "HTML" as const,
      content: params.htmlBody,
    },
    toRecipients: [{ emailAddress: { address: params.to } }],
    attachments: (params.attachments ?? []).map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.filename,
      contentType: a.contentType,
      contentBytes: a.content.toString("base64"),
    })),
  };

  try {
    const res = await graphFetch(
      params.tenantId,
      `/users/${encodeURIComponent(params.mailbox)}/sendMail`,
      {
        method: "POST",
        body: JSON.stringify({ message, saveToSentItems: true }),
      },
    );
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as GraphErrorPayload;
      const msg = payload.error?.message ?? `Graph error ${res.status}`;
      const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
      if (retryable) {
        // Single retry after 1s, matching the Gmail client's contract.
        await new Promise((r) => setTimeout(r, 1000));
        const retry = await graphFetch(
          params.tenantId,
          `/users/${encodeURIComponent(params.mailbox)}/sendMail`,
          {
            method: "POST",
            body: JSON.stringify({ message, saveToSentItems: true }),
          },
        );
        if (retry.ok) return { ok: true, rfc822MessageId: null };
        const retryPayload = (await retry.json().catch(() => ({}))) as GraphErrorPayload;
        return {
          ok: false,
          error: retryPayload.error?.message ?? msg,
          retryable: false,
        };
      }
      return { ok: false, error: msg, retryable: false };
    }
    // sendMail returns 202 Accepted with no body. The RFC822 Message-ID
    // header is generated by Outlook AFTER queueing , there's no way to
    // get it back synchronously, unlike Gmail's API. Returning null means
    // inbound matching by In-Reply-To won't work for Outlook-sent
    // messages; we'll match by subject + sender in a fallback path.
    return { ok: true, rfc822MessageId: null };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      retryable: false,
    };
  }
}

// ─── Subscription lifecycle (inbound) ─────────────────────────────────
export async function createOutlookSubscription(
  tenantId: string,
  mailbox: string,
  notificationUrl: string,
  clientState: string,
): Promise<
  | { ok: true; subscriptionId: string; expiresAt: string }
  | { ok: false; error: string }
> {
  // Max validity is 4230 minutes (≈ 70.5h) for Mail resources.
  const expirationIso = new Date(Date.now() + 4200 * 60 * 1000).toISOString();
  try {
    const res = await graphFetch(tenantId, "/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        changeType: "created",
        notificationUrl,
        resource: `/users/${mailbox}/messages?$filter=isDraft eq false`,
        expirationDateTime: expirationIso,
        clientState,
      }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as GraphErrorPayload;
      return { ok: false, error: payload.error?.message ?? `Graph error ${res.status}` };
    }
    const data = (await res.json()) as { id: string; expirationDateTime: string };
    return {
      ok: true,
      subscriptionId: data.id,
      expiresAt: data.expirationDateTime,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function renewOutlookSubscription(
  tenantId: string,
  subscriptionId: string,
): Promise<{ ok: true; expiresAt: string } | { ok: false; error: string }> {
  const expirationIso = new Date(Date.now() + 4200 * 60 * 1000).toISOString();
  try {
    const res = await graphFetch(tenantId, `/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({ expirationDateTime: expirationIso }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as GraphErrorPayload;
      return { ok: false, error: payload.error?.message ?? `Graph error ${res.status}` };
    }
    const data = (await res.json()) as { expirationDateTime: string };
    return { ok: true, expiresAt: data.expirationDateTime };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function stopOutlookSubscription(
  tenantId: string,
  subscriptionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await graphFetch(tenantId, `/subscriptions/${subscriptionId}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      const payload = (await res.json().catch(() => ({}))) as GraphErrorPayload;
      return { ok: false, error: payload.error?.message ?? `Graph error ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ─── Fetch message + attachments (inbound webhook path) ───────────────
export interface FetchedOutlookMessage {
  id: string;
  subject: string;
  from: string;
  toRecipients: string[];
  bodyText: string;
  bodyHtml: string | null;
  receivedAt: string;
  inReplyTo: string | null;
  hasAttachments: boolean;
}

export async function getOutlookMessage(
  tenantId: string,
  mailbox: string,
  messageId: string,
): Promise<
  | { ok: true; message: FetchedOutlookMessage }
  | { ok: false; error: string }
> {
  try {
    const res = await graphFetch(
      tenantId,
      `/users/${encodeURIComponent(mailbox)}/messages/${messageId}?$select=id,subject,from,toRecipients,body,bodyPreview,receivedDateTime,internetMessageHeaders,hasAttachments`,
    );
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as GraphErrorPayload;
      return { ok: false, error: payload.error?.message ?? `Graph error ${res.status}` };
    }
    const data = (await res.json()) as {
      id: string;
      subject?: string;
      from?: { emailAddress?: { address?: string } };
      toRecipients?: Array<{ emailAddress?: { address?: string } }>;
      body?: { content?: string; contentType?: string };
      bodyPreview?: string;
      receivedDateTime?: string;
      internetMessageHeaders?: Array<{ name?: string; value?: string }>;
      hasAttachments?: boolean;
    };
    const inReplyHeader = (data.internetMessageHeaders ?? []).find(
      (h) => h.name?.toLowerCase() === "in-reply-to",
    )?.value;
    const inReplyTo = inReplyHeader
      ? inReplyHeader.replace(/^<|>$/g, "").trim() || null
      : null;
    const bodyHtml = data.body?.contentType === "html" ? (data.body.content ?? null) : null;
    const bodyText =
      data.body?.contentType === "text"
        ? (data.body.content ?? "")
        : bodyHtml
          ? bodyHtml
              .replace(/<style[\s\S]*?<\/style>/gi, "")
              .replace(/<script[\s\S]*?<\/script>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
          : (data.bodyPreview ?? "");
    return {
      ok: true,
      message: {
        id: data.id,
        subject: data.subject ?? "",
        from: (data.from?.emailAddress?.address ?? "").toLowerCase(),
        toRecipients: (data.toRecipients ?? [])
          .map((r) => r.emailAddress?.address?.toLowerCase() ?? "")
          .filter(Boolean),
        bodyText,
        bodyHtml,
        receivedAt:
          data.receivedDateTime ?? new Date().toISOString(),
        inReplyTo,
        hasAttachments: !!data.hasAttachments,
      },
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface OutlookAttachmentMeta {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

export async function listOutlookAttachments(
  tenantId: string,
  mailbox: string,
  messageId: string,
): Promise<
  | { ok: true; attachments: OutlookAttachmentMeta[] }
  | { ok: false; error: string }
> {
  try {
    const res = await graphFetch(
      tenantId,
      `/users/${encodeURIComponent(mailbox)}/messages/${messageId}/attachments?$select=id,name,contentType,size`,
    );
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as GraphErrorPayload;
      return { ok: false, error: payload.error?.message ?? `Graph error ${res.status}` };
    }
    const data = (await res.json()) as {
      value: Array<{ id: string; name: string; contentType: string; size: number }>;
    };
    return { ok: true, attachments: data.value };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function getOutlookAttachmentBytes(
  tenantId: string,
  mailbox: string,
  messageId: string,
  attachmentId: string,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; error: string }> {
  try {
    const res = await graphFetch(
      tenantId,
      `/users/${encodeURIComponent(mailbox)}/messages/${messageId}/attachments/${attachmentId}`,
    );
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as GraphErrorPayload;
      return { ok: false, error: payload.error?.message ?? `Graph error ${res.status}` };
    }
    const data = (await res.json()) as { contentBytes?: string };
    if (!data.contentBytes) return { ok: false, error: "attachment_no_content" };
    return { ok: true, bytes: Buffer.from(data.contentBytes, "base64") };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
