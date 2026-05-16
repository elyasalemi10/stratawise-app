import "server-only";

// Mobile Message API integration (Item 15 — Communications tab "Send SMS").
// Docs: https://mobilemessage.com.au/api-documentation
// Authentication: HTTP Basic with USERNAME + PASSWORD env vars.
// Endpoint: POST https://api.mobilemessage.com.au/v1/messages
//
// Manager confirmation is enforced UPSTREAM (the action requires an explicit
// `confirmed: true` flag because SMS sends cost money). This module just sends.

const ENDPOINT = "https://api.mobilemessage.com.au/v1/messages";

export interface SmsSendResult {
  ok: boolean;
  id?: string;
  error?: string;
  dryRun?: boolean;
}

function isDryRun(): boolean {
  // Same gate as email: any non-prod env where MOBILE_MESSAGE_DRY_RUN=true
  // or where credentials are absent → log + return without sending.
  if (process.env.SMS_DRY_RUN === "true") return true;
  if (!process.env.MOBILE_MESSAGE_USERNAME) return true;
  if (!process.env.MOBILE_MESSAGE_PASSWORD) return true;
  return false;
}

// Normalises AU mobile numbers to E.164 (+61…). Accepts "04xxxxxxxx",
// "+614xxxxxxxx", "614xxxxxxxx", with spaces / dashes. Returns null if the
// number isn't a recognisable AU mobile.
export function normaliseAuMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+61") && digits.length === 12 && digits[3] === "4") return digits;
  if (digits.startsWith("61") && digits.length === 11 && digits[2] === "4") return `+${digits}`;
  if (digits.startsWith("04") && digits.length === 10) return `+61${digits.slice(1)}`;
  if (digits.startsWith("4") && digits.length === 9) return `+61${digits}`;
  return null;
}

export async function sendSms(params: {
  to: string;
  body: string;
  senderName?: string;
}): Promise<SmsSendResult> {
  const to = normaliseAuMobile(params.to);
  if (!to) return { ok: false, error: "Invalid mobile number." };
  if (!params.body?.trim()) return { ok: false, error: "Message body is required." };

  if (isDryRun()) {
    console.log(`[sms-dry-run] to=${to} body=${params.body}`);
    return { ok: true, dryRun: true };
  }

  const auth = Buffer.from(
    `${process.env.MOBILE_MESSAGE_USERNAME}:${process.env.MOBILE_MESSAGE_PASSWORD}`,
  ).toString("base64");

  const sender =
    params.senderName ?? process.env.MOBILE_MESSAGE_SENDER ?? "StrataWise";

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        messages: [
          {
            to,
            message: params.body,
            sender,
          },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[sms] send failed:", res.status, text);
      return { ok: false, error: `SMS provider returned ${res.status}` };
    }
    const json = (await res.json().catch(() => null)) as { results?: Array<{ message_id?: string }> } | null;
    return { ok: true, id: json?.results?.[0]?.message_id };
  } catch (err) {
    console.error("[sms] send threw:", err);
    return { ok: false, error: "Could not send SMS — please try again." };
  }
}
