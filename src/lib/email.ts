import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM_INVITES = process.env.RESEND_INVITES_FROM ?? "My Strata Management <noreply@myocm.com.au>";
const FROM_LEVIES = process.env.RESEND_LEVIES_FROM ?? "My Strata Management <noreply@myocm.com.au>";
const FROM_SYSTEM = process.env.RESEND_SYSTEM_FROM ?? "My Strata Management <noreply@myocm.com.au>";

interface SendInvitationEmailParams {
  to: string;
  inviteeName: string | null;
  role: "lot_owner" | "strata_manager";
  subdivisionName: string;
  subdivisionAddress: string;
  lotNumber?: number | null;
  inviteUrl: string;
  invitedByName?: string;
}

export async function sendInvitationEmail({
  to,
  inviteeName,
  role,
  subdivisionName,
  subdivisionAddress,
  lotNumber,
  inviteUrl,
  invitedByName,
}: SendInvitationEmailParams) {
  const roleLabel = role === "lot_owner" ? "lot owner" : "strata manager";
  const greeting = inviteeName ? `Hi ${inviteeName},` : "Hi,";
  const lotLine = lotNumber ? `<p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Lot: <strong>${lotNumber}</strong></p>` : "";
  const invitedByLine = invitedByName ? ` by ${invitedByName}` : "";

  const { error } = await getResend().emails.send({
    from: FROM_INVITES,
    to,
    subject: `You've been invited to ${subdivisionName}`,
    html: `
      <div style="font-family:'Inter',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 0;">
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#1a1f2e;">You've been invited</h2>
        <p style="margin:0 0 20px;color:#1a1f2e;font-size:14px;line-height:1.6;">
          ${greeting} you've been invited${invitedByLine} to join as a <strong>${roleLabel}</strong>.
        </p>
        <div style="background:#f8f9fb;border:1px solid #e2e5ea;border-radius:6px;padding:16px;margin:0 0 24px;">
          <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#1a1f2e;">${subdivisionName}</p>
          <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">${subdivisionAddress}</p>
          ${lotLine}
        </div>
        <a href="${inviteUrl}" style="display:inline-block;background:#2b7fff;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 24px;border-radius:6px;">
          Accept invitation
        </a>
        <p style="margin:24px 0 0;color:#6b7280;font-size:12px;line-height:1.5;">
          This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("Failed to send invitation email:", error);
    return { error: error.message };
  }

  return { success: true };
}

// ─── Levy Notice Email ─────────────────────────────────────

interface SendLevyEmailParams {
  to: string;
  ownerName: string | null;
  subdivisionName: string;
  subdivisionAddress: string;
  companyLogoUrl?: string | null;
  referenceNumber: string;
  dueDate: string;
  totalAmount: string;
  periodLabel: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
}

export async function sendLevyEmail({
  to,
  ownerName,
  subdivisionName,
  subdivisionAddress,
  companyLogoUrl,
  referenceNumber,
  dueDate,
  totalAmount,
  periodLabel,
  pdfBuffer,
  pdfFilename,
}: SendLevyEmailParams) {
  const greeting = ownerName ? `Hi ${ownerName},` : "Hi,";
  const logoHtml = companyLogoUrl
    ? `<img src="${companyLogoUrl}" alt="" style="max-height:48px;max-width:160px;margin-bottom:16px;" />`
    : "";

  const { error } = await getResend().emails.send({
    from: FROM_LEVIES,
    to,
    subject: `Levy Notice — ${subdivisionName} — ${periodLabel}`,
    html: `
      <div style="font-family:'Inter',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 0;">
        ${logoHtml}
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#1a1f2e;">Levy Notice</h2>
        <p style="margin:0 0 20px;color:#1a1f2e;font-size:14px;line-height:1.6;">
          ${greeting} a new levy notice has been issued for <strong>${subdivisionAddress}</strong>.
        </p>
        <div style="background:#f8f9fb;border:1px solid #e2e5ea;border-radius:6px;padding:16px;margin:0 0 24px;">
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Reference</p>
          <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1a1f2e;">${referenceNumber}</p>
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Period</p>
          <p style="margin:0 0 12px;font-size:14px;color:#1a1f2e;">${periodLabel}</p>
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Amount due</p>
          <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#1a1f2e;">${totalAmount}</p>
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Due date</p>
          <p style="margin:0;font-size:14px;font-weight:600;color:#00bd7d;">${dueDate}</p>
        </div>
        <p style="margin:0;color:#1a1f2e;font-size:14px;">
          Your levy notice is attached as a PDF. Please refer to the notice for payment details.
        </p>
      </div>
    `,
    attachments: [
      {
        filename: pdfFilename,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  if (error) {
    console.error("Failed to send levy email:", error);
    return { error: error.message };
  }

  return { success: true };
}

// ─── Bank-feed system emails (Prompt 3) ───────────────────────────
// Plaintext-ish HTML. Copy polish is deferred to Prompt 6; these are
// the minimum needed to honour the 30/14/7/3/1-day reauth cadence, the
// expired notification, the gap reconciliation notice, and the
// committee notification on gaps > 30 days.

type BasiqEmailResult = { success: true } | { error: string };

async function sendSystemEmail(
  to: string,
  subject: string,
  bodyHtml: string,
): Promise<BasiqEmailResult> {
  // In dev with no RESEND_API_KEY, log instead of sending.
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email-stub] to=${to} subject="${subject}"`);
    return { success: true };
  }
  const { error } = await getResend().emails.send({
    from: FROM_SYSTEM,
    to,
    subject,
    html: bodyHtml,
  });
  if (error) {
    console.error("Failed to send system email:", error);
    return { error: error.message };
  }
  return { success: true };
}

export async function sendBasiqReauthReminderEmail(params: {
  to: string;
  subdivisionName: string;
  daysRemaining: number;
  reauthUrl: string;
}): Promise<BasiqEmailResult> {
  const { to, subdivisionName, daysRemaining, reauthUrl } = params;
  const subject = `Bank feed reauthorisation required in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} — ${subdivisionName}`;
  const html = `
    <div style="font-family:'Inter',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px 0;">
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#1a1f2e;">Bank feed expiring soon</h2>
      <p style="margin:0 0 16px;color:#1a1f2e;font-size:14px;line-height:1.5;">
        The automatic bank feed for <strong>${subdivisionName}</strong> will expire in
        <strong>${daysRemaining} day${daysRemaining === 1 ? "" : "s"}</strong>. Reauthorise to keep transactions syncing.
      </p>
      <a href="${reauthUrl}" style="display:inline-block;background:#2b7fff;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:6px;">
        Reauthorise now
      </a>
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">If the feed expires, CSV import remains available as a fallback.</p>
    </div>
  `;
  return sendSystemEmail(to, subject, html);
}

export async function sendBasiqConsentExpiredEmail(params: {
  to: string;
  subdivisionName: string;
  reauthUrl: string;
}): Promise<BasiqEmailResult> {
  const { to, subdivisionName, reauthUrl } = params;
  const subject = `Bank feed disconnected — ${subdivisionName}`;
  const html = `
    <div style="font-family:'Inter',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px 0;">
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#b91c1c;">Bank feed disconnected</h2>
      <p style="margin:0 0 16px;color:#1a1f2e;font-size:14px;line-height:1.5;">
        The automatic bank feed for <strong>${subdivisionName}</strong> has expired. New transactions will not be imported until you reauthorise.
      </p>
      <a href="${reauthUrl}" style="display:inline-block;background:#2b7fff;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:6px;">
        Reauthorise now
      </a>
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">CSV import remains available as a fallback.</p>
    </div>
  `;
  return sendSystemEmail(to, subject, html);
}

export async function sendBasiqGapReconciliationEmail(params: {
  to: string;
  subdivisionName: string;
  gapHours: number;
  backfilledCount: number;
  autoMatchedCount: number;
  manualReviewCount: number;
  reportUrl: string;
}): Promise<BasiqEmailResult> {
  const {
    to,
    subdivisionName,
    gapHours,
    backfilledCount,
    autoMatchedCount,
    manualReviewCount,
    reportUrl,
  } = params;
  const subject = `Bank feed reconnected — reconciliation gap report for ${subdivisionName}`;
  const html = `
    <div style="font-family:'Inter',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px 0;">
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#1a1f2e;">Bank feed reconnected</h2>
      <p style="margin:0 0 12px;color:#1a1f2e;font-size:14px;line-height:1.5;">
        The bank feed for <strong>${subdivisionName}</strong> was disconnected for <strong>${gapHours} hour${gapHours === 1 ? "" : "s"}</strong>.
      </p>
      <ul style="margin:0 0 16px;padding-left:20px;color:#1a1f2e;font-size:14px;line-height:1.6;">
        <li>${backfilledCount} transaction${backfilledCount === 1 ? "" : "s"} imported during reconnection</li>
        <li>${autoMatchedCount} auto-matched</li>
        <li>${manualReviewCount} awaiting manual review</li>
      </ul>
      <p style="margin:0 0 16px;color:#1a1f2e;font-size:14px;line-height:1.5;">
        Arrears notifications are paused for 48 hours while you review.
      </p>
      <a href="${reportUrl}" style="display:inline-block;background:#2b7fff;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:6px;">
        View gap report
      </a>
    </div>
  `;
  return sendSystemEmail(to, subject, html);
}

export async function sendBasiqCommitteeGapNotificationEmail(params: {
  to: string;
  subdivisionName: string;
  gapHours: number;
}): Promise<BasiqEmailResult> {
  const { to, subdivisionName, gapHours } = params;
  const days = Math.round(gapHours / 24);
  const subject = `Extended bank-feed outage — ${subdivisionName}`;
  const html = `
    <div style="font-family:'Inter',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px 0;">
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#b45309;">Extended bank-feed outage</h2>
      <p style="margin:0 0 12px;color:#1a1f2e;font-size:14px;line-height:1.5;">
        The automatic bank feed for <strong>${subdivisionName}</strong> was disconnected for approximately <strong>${days} days</strong>.
      </p>
      <p style="margin:0 0 0;color:#1a1f2e;font-size:14px;line-height:1.5;">
        During this time, arrears notifications may have been issued based on stale reconciliation state. A detailed gap report is available in the MSM dashboard.
      </p>
    </div>
  `;
  return sendSystemEmail(to, subject, html);
}
