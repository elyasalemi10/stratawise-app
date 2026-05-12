import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM_INVITES = process.env.RESEND_INVITES_FROM ?? "Strata Wise <noreply@myocm.com.au>";
const FROM_LEVIES = process.env.RESEND_LEVIES_FROM ?? "Strata Wise <noreply@myocm.com.au>";
const FROM_SYSTEM = process.env.RESEND_SYSTEM_FROM ?? "Strata Wise <noreply@myocm.com.au>";

// EMAIL_DRY_RUN gate (PP6-C-1 retrofit). Set EMAIL_DRY_RUN=true in dev/staging
// .env.local to short-circuit all sends with a console.log; production leaves
// it unset (defaults to false → real sends). Replaces the older
// `!RESEND_API_KEY` gate which doesn't work in dev where the key is set.
function isDryRun(): boolean {
  return process.env.EMAIL_DRY_RUN === "true";
}

// Uniform result type for the 4 new owner-facing senders introduced in
// PP6-C-1. Existing 5 senders (invitation/levy/basiq×3) keep their original
// `{ success } | { error }` shape — retrofit is limited to the DRY_RUN gate.
export type EmailSendResult =
  | { success: true; id: string | null }
  | { dryRun: true }
  | { error: string };

interface SendInvitationEmailParams {
  to: string;
  inviteeName: string | null;
  role: "lot_owner" | "strata_manager";
  subdivisionName: string;
  subdivisionAddress: string;
  lotNumber?: number | null;
  inviteUrl: string;
  invitedByName?: string;
  companyLogoUrl?: string | null;
}

// ─── Email verification (6-digit OTP) ──────────────────────────────────────
// Sent on sign-up and on resend requests. Our own gate — separate from
// Supabase Auth's built-in confirmation link (which is disabled). The code
// is plain 6-digit numeric, 10-minute expiry stored in email_verification_codes.

interface SendVerificationCodeEmailParams {
  to: string;
  name: string | null;
  code: string;
}

export async function sendVerificationCodeEmail({
  to,
  name,
  code,
}: SendVerificationCodeEmailParams): Promise<{ success: true } | { error: string }> {
  const greeting = name ? `Hi ${name},` : "Hi,";

  if (isDryRun()) {
    console.log(`[email-dry-run] type=verification to=${to} code=${code}`);
    return { success: true };
  }

  const { error } = await getResend().emails.send({
    from: FROM_SYSTEM,
    to,
    subject: `Your Strata Wise verification code: ${code}`,
    html: `
      <div style="font-family:'Inter',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 0;">
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#1a1f2e;">Verify your email</h2>
        <p style="margin:0 0 20px;color:#1a1f2e;font-size:14px;line-height:1.6;">
          ${greeting} use the code below to verify your Strata Wise account. It expires in 10 minutes.
        </p>
        <div style="background:#f8f9fb;border:1px solid #e2e5ea;border-radius:6px;padding:24px;margin:0 0 24px;text-align:center;">
          <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:8px;color:#1a1f2e;font-family:'SF Mono','Courier New',monospace;">${code}</p>
        </div>
        <p style="margin:24px 0 0;color:#6b7280;font-size:12px;line-height:1.5;">
          If you didn't request this code, you can safely ignore this email.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("Failed to send verification code email:", error);
    return { error: error.message ?? "Failed to send email" };
  }
  return { success: true as const };
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
  companyLogoUrl,
}: SendInvitationEmailParams) {
  const roleLabel = role === "lot_owner" ? "lot owner" : "strata manager";
  const greeting = inviteeName ? `Hi ${inviteeName},` : "Hi,";
  const lotLine = lotNumber ? `<p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Lot: <strong>${lotNumber}</strong></p>` : "";
  const invitedByLine = invitedByName ? ` by ${invitedByName}` : "";

  if (isDryRun()) {
    console.log(`[email-dry-run] type=invitation to=${to} subject="You've been invited to ${subdivisionName}"`);
    return { success: true };
  }

  const { error } = await getResend().emails.send({
    from: FROM_INVITES,
    to,
    subject: `You've been invited to ${subdivisionName}`,
    html: `
      <div style="font-family:'Inter',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 0;">
        ${logoImg(companyLogoUrl)}
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
  const logoHtml = logoImg(companyLogoUrl);

  if (isDryRun()) {
    console.log(`[email-dry-run] type=levy_notice to=${to} ref=${referenceNumber} subject="Levy Notice — ${subdivisionName} — ${periodLabel}"`);
    return { success: true };
  }

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
  // Dry-run gate (PP6-C-1) — also covers the original "no API key in dev"
  // case for backward compatibility (an unset key is still treated as
  // dry-run, so existing dev workflows without a key keep working).
  if (isDryRun() || !process.env.RESEND_API_KEY) {
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
  companyLogoUrl?: string | null;
}): Promise<BasiqEmailResult> {
  const { to, subdivisionName, daysRemaining, reauthUrl, companyLogoUrl } = params;
  const subject = `Bank feed reauthorisation required in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} — ${subdivisionName}`;
  const html = `
    <div style="font-family:'Inter',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px 0;">
      ${logoImg(companyLogoUrl)}
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
  companyLogoUrl?: string | null;
}): Promise<BasiqEmailResult> {
  const { to, subdivisionName, reauthUrl, companyLogoUrl } = params;
  const subject = `Bank feed disconnected — ${subdivisionName}`;
  const html = `
    <div style="font-family:'Inter',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px 0;">
      ${logoImg(companyLogoUrl)}
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
  companyLogoUrl?: string | null;
}): Promise<BasiqEmailResult> {
  const {
    to,
    subdivisionName,
    gapHours,
    backfilledCount,
    autoMatchedCount,
    manualReviewCount,
    reportUrl,
    companyLogoUrl,
  } = params;
  const subject = `Bank feed reconnected — reconciliation gap report for ${subdivisionName}`;
  const html = `
    <div style="font-family:'Inter',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px 0;">
      ${logoImg(companyLogoUrl)}
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
  companyLogoUrl?: string | null;
}): Promise<BasiqEmailResult> {
  const { to, subdivisionName, gapHours, companyLogoUrl } = params;
  const days = Math.round(gapHours / 24);
  const subject = `Extended bank-feed outage — ${subdivisionName}`;
  const html = `
    <div style="font-family:'Inter',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px 0;">
      ${logoImg(companyLogoUrl)}
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#b45309;">Extended bank-feed outage</h2>
      <p style="margin:0 0 12px;color:#1a1f2e;font-size:14px;line-height:1.5;">
        The automatic bank feed for <strong>${subdivisionName}</strong> was disconnected for approximately <strong>${days} days</strong>.
      </p>
      <p style="margin:0 0 0;color:#1a1f2e;font-size:14px;line-height:1.5;">
        During this time, arrears notifications may have been issued based on stale reconciliation state. A detailed gap report is available in the Strata Wise dashboard.
      </p>
    </div>
  `;
  return sendSystemEmail(to, subject, html);
}

// ─── PP6-C-1: owner-facing transactional emails ──────────────────────────
// Inline HTML template literals (per PP6-0 ratification). Each sender
// returns the uniform EmailSendResult so emit helpers in
// src/lib/notifications.ts can persist the Resend message id into
// communication_log.external_id.

interface SharedSenderHeader {
  to: string;
  ownerName: string | null;
  subdivisionName: string;
  subdivisionAddress: string;
  // PP6-D-D-fix-logo: company logo URL resolved via the helper in
  // src/lib/notifications.ts:resolveCompanyLogo. Null/undefined →
  // text-only header (current management_companies typically have
  // logo_url=NULL until the manager UI for upload ships in 6.5).
  companyLogoUrl?: string | null;
}

function greeting(ownerName: string | null): string {
  return ownerName ? `Hi ${ownerName},` : "Hi,";
}

// PP6-D-D-fix-logo: shared <img> renderer for the company logo. Returns
// empty string when no logo is configured — callers can inline this at
// the top of any email body without conditionals.
function logoImg(url: string | null | undefined): string {
  return url
    ? `<img src="${url}" alt="" style="max-height:48px;max-width:160px;margin-bottom:16px;" />`
    : "";
}

function brandShell(innerHtml: string, logoUrl?: string | null): string {
  return `
    <div style="font-family:'Inter',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 0;">
      ${logoImg(logoUrl)}
      ${innerHtml}
    </div>
  `;
}

// ─── sendPaymentReceivedEmail ──────────────────────────────────────────

export interface SendPaymentReceivedEmailParams extends SharedSenderHeader {
  amount: number;
  paymentDate: string;
  description: string;
  lotLabel: string;
  reference: string | null;
  subdivisionShortCode: string;
}

export async function sendPaymentReceivedEmail(
  params: SendPaymentReceivedEmailParams,
): Promise<EmailSendResult> {
  const { to, ownerName, subdivisionName, subdivisionAddress, amount, paymentDate, description, lotLabel, reference, subdivisionShortCode, companyLogoUrl } = params;
  const subject = `Payment received — ${subdivisionName}`;

  if (isDryRun()) {
    console.log(`[email-dry-run] type=payment_received to=${to} amount=${amount.toFixed(2)} subject="${subject}"`);
    return { dryRun: true };
  }

  const refLine = reference
    ? `<p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Reference</p><p style="margin:0 0 12px;font-size:14px;color:#1a1f2e;">${escapeHtml(reference)}</p>`
    : "";

  const ctaBlock = buildCtaBlock(
    subdivisionShortCode,
    "my-payments",
    "View payment history",
    "Log in to Strata Wise to view your full payment history.",
  );

  const html = brandShell(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#1a1f2e;">Payment received</h2>
    <p style="margin:0 0 20px;color:#1a1f2e;font-size:14px;line-height:1.6;">
      ${greeting(ownerName)} we've recorded a payment against your account at <strong>${escapeHtml(subdivisionAddress)}</strong>.
    </p>
    <div style="background:#f8f9fb;border:1px solid #e2e5ea;border-radius:6px;padding:16px;margin:0 0 24px;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Lot</p>
      <p style="margin:0 0 12px;font-size:14px;color:#1a1f2e;">${escapeHtml(lotLabel)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Amount</p>
      <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#00bd7d;">$${amount.toFixed(2)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Date</p>
      <p style="margin:0 0 12px;font-size:14px;color:#1a1f2e;">${escapeHtml(paymentDate)}</p>
      ${refLine}
      ${description ? `<p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Description</p><p style="margin:0;font-size:14px;color:#1a1f2e;">${escapeHtml(description)}</p>` : ""}
    </div>
    ${ctaBlock}
  `, companyLogoUrl);

  const { data, error } = await getResend().emails.send({
    from: FROM_LEVIES,
    to,
    subject,
    html,
  });
  if (error) {
    console.error("Failed to send payment_received email:", error);
    return { error: error.message };
  }
  return { success: true, id: data?.id ?? null };
}

// ─── sendOverdueReminderEmail (PP6-C-1 step 1) ─────────────────────────

export interface SendOverdueReminderEmailParams extends SharedSenderHeader {
  referenceNumber: string;
  amountOutstanding: number;
  daysOverdue: number;
  dueDate: string;
  penaltyInterestAccrued: number; // 0 if no accrual yet
  subdivisionShortCode: string;   // for /my-arrears CTA link
  // PP7-A: optional PDF attachment. When set, attached via Resend
  // attachments[]. Caller (escalation engine) resolves the buffer via
  // getLevyNoticePdfBuffer(levyId, supabase); null means body-only fallback.
  pdfBuffer?: Buffer | null;
  pdfFilename?: string;
}

export async function sendOverdueReminderEmail(
  params: SendOverdueReminderEmailParams,
): Promise<EmailSendResult> {
  const { to, ownerName, subdivisionName, subdivisionAddress, referenceNumber, amountOutstanding, daysOverdue, dueDate, penaltyInterestAccrued, subdivisionShortCode, companyLogoUrl, pdfBuffer, pdfFilename } = params;
  const subject = `Your levy is overdue — ${subdivisionName}`;

  if (isDryRun()) {
    console.log(`[email-dry-run] type=overdue_reminder to=${to} ref=${referenceNumber} days=${daysOverdue} interest=${penaltyInterestAccrued.toFixed(2)} pdf=${pdfBuffer ? "yes" : "no"} subject="${subject}"`);
    return { dryRun: true };
  }

  const interestLine = penaltyInterestAccrued > 0
    ? `<p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Interest accrued</p><p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#dc2626;">$${penaltyInterestAccrued.toFixed(2)}</p>`
    : "";

  // PP6-D-D-fix: CTA hyperlink to the owner's my-arrears page. Fallback to
  // plain text when NEXT_PUBLIC_APP_URL is unset (avoids rendering a broken
  // anchor with a relative href).
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const ctaBlock = appBaseUrl
    ? `<p style="margin:0 0 16px;color:#1a1f2e;font-size:14px;line-height:1.6;">
        Click below to see your arrears, payment options, and full ledger.
      </p>
      <a href="${appBaseUrl}/subdivisions/${escapeHtml(subdivisionShortCode)}/my-arrears" style="display:inline-block;background:#2b7fff;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 24px;border-radius:6px;margin:0 0 24px;">
        View outstanding balance
      </a>`
    : `<p style="margin:0 0 24px;color:#1a1f2e;font-size:14px;">
        Log in to Strata Wise to view your outstanding balance, payment options, and full ledger.
      </p>`;

  const html = brandShell(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#1a1f2e;">Levy overdue — friendly reminder</h2>
    <p style="margin:0 0 20px;color:#1a1f2e;font-size:14px;line-height:1.6;">
      ${greeting(ownerName)} our records show a levy at <strong>${escapeHtml(subdivisionAddress)}</strong> is now <strong>${daysOverdue} days</strong> past its due date. If you've already paid, you can disregard this notice — it may take a day or two to reflect on our system.
    </p>
    <div style="background:#fef9f3;border:1px solid #fde7d0;border-radius:6px;padding:16px;margin:0 0 24px;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Reference</p>
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#1a1f2e;">${escapeHtml(referenceNumber)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Original due date</p>
      <p style="margin:0 0 12px;font-size:14px;color:#1a1f2e;">${escapeHtml(dueDate)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Amount outstanding</p>
      <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#1a1f2e;">$${amountOutstanding.toFixed(2)}</p>
      ${interestLine}
    </div>
    ${ctaBlock}
    <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
      Continued non-payment may result in further reminders and late fees in line with your strata rules.
    </p>
  `, companyLogoUrl);

  const { data, error } = await getResend().emails.send({
    from: FROM_LEVIES,
    to,
    subject,
    html,
    ...(pdfBuffer
      ? {
          attachments: [
            {
              filename: pdfFilename ?? `${referenceNumber}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        }
      : {}),
  });
  if (error) {
    console.error("Failed to send overdue_reminder email:", error);
    return { error: error.message };
  }
  return { success: true, id: data?.id ?? null };
}

// ─── sendClaimMatchedEmail ─────────────────────────────────────────────

export interface SendClaimMatchedEmailParams extends SharedSenderHeader {
  amount: number;
  claimDate: string;
  paymentMethod: string;
  lotLabel: string;
  subdivisionShortCode: string;
}

export async function sendClaimMatchedEmail(
  params: SendClaimMatchedEmailParams,
): Promise<EmailSendResult> {
  const { to, ownerName, subdivisionName, subdivisionAddress, amount, claimDate, paymentMethod, lotLabel, subdivisionShortCode, companyLogoUrl } = params;
  const subject = `Your payment has been confirmed — ${subdivisionName}`;

  if (isDryRun()) {
    console.log(`[email-dry-run] type=claim_matched to=${to} amount=${amount.toFixed(2)} subject="${subject}"`);
    return { dryRun: true };
  }

  const ctaBlock = buildCtaBlock(
    subdivisionShortCode,
    "my-payments",
    "View payment confirmation",
    "Log in to Strata Wise to view this confirmed payment.",
  );

  const html = brandShell(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#1a1f2e;">Payment confirmed</h2>
    <p style="margin:0 0 20px;color:#1a1f2e;font-size:14px;line-height:1.6;">
      ${greeting(ownerName)} the payment claim you submitted for <strong>${escapeHtml(subdivisionAddress)}</strong> has been matched and applied to your account.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px;margin:0 0 24px;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Lot</p>
      <p style="margin:0 0 12px;font-size:14px;color:#1a1f2e;">${escapeHtml(lotLabel)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Amount</p>
      <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#00bd7d;">$${amount.toFixed(2)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Claimed date</p>
      <p style="margin:0 0 12px;font-size:14px;color:#1a1f2e;">${escapeHtml(claimDate)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Method</p>
      <p style="margin:0;font-size:14px;color:#1a1f2e;">${escapeHtml(paymentMethod)}</p>
    </div>
    ${ctaBlock}
  `, companyLogoUrl);

  const { data, error } = await getResend().emails.send({
    from: FROM_LEVIES,
    to,
    subject,
    html,
  });
  if (error) {
    console.error("Failed to send claim_matched email:", error);
    return { error: error.message };
  }
  return { success: true, id: data?.id ?? null };
}

// ─── sendClaimRejectedEmail ────────────────────────────────────────────

export interface SendClaimRejectedEmailParams extends SharedSenderHeader {
  amount: number;
  claimDate: string;
  rejectionReason: string;
  lotLabel: string;
  subdivisionShortCode: string;
}

export async function sendClaimRejectedEmail(
  params: SendClaimRejectedEmailParams,
): Promise<EmailSendResult> {
  const { to, ownerName, subdivisionName, subdivisionAddress, amount, claimDate, rejectionReason, lotLabel, subdivisionShortCode, companyLogoUrl } = params;
  const subject = `Update on your payment claim — ${subdivisionName}`;

  if (isDryRun()) {
    console.log(`[email-dry-run] type=claim_rejected to=${to} amount=${amount.toFixed(2)} subject="${subject}"`);
    return { dryRun: true };
  }

  const ctaBlock = buildCtaBlock(
    subdivisionShortCode,
    "my-arrears",
    "Resubmit or view details",
    "Log in to Strata Wise to view your outstanding balance and resubmit the claim.",
  );

  const html = brandShell(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#1a1f2e;">Update on your payment claim</h2>
    <p style="margin:0 0 20px;color:#1a1f2e;font-size:14px;line-height:1.6;">
      ${greeting(ownerName)} after review, the payment claim you submitted for <strong>${escapeHtml(subdivisionAddress)}</strong> has not been matched. The details and the manager's note are below.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px;margin:0 0 16px;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Lot</p>
      <p style="margin:0 0 12px;font-size:14px;color:#1a1f2e;">${escapeHtml(lotLabel)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Amount</p>
      <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#1a1f2e;">$${amount.toFixed(2)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Claimed date</p>
      <p style="margin:0;font-size:14px;color:#1a1f2e;">${escapeHtml(claimDate)}</p>
    </div>
    <div style="background:#f8f9fb;border:1px solid #e2e5ea;border-radius:6px;padding:16px;margin:0 0 24px;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Reason from your strata manager</p>
      <p style="margin:0;font-size:14px;line-height:1.5;color:#1a1f2e;">${escapeHtml(rejectionReason)}</p>
    </div>
    ${ctaBlock}
  `, companyLogoUrl);

  const { data, error } = await getResend().emails.send({
    from: FROM_LEVIES,
    to,
    subject,
    html,
  });
  if (error) {
    console.error("Failed to send claim_rejected email:", error);
    return { error: error.message };
  }
  return { success: true, id: data?.id ?? null };
}

// ─── PP6-C-2: manager-facing transactional email ─────────────────────────

export interface SendNewClaimSubmittedEmailParams {
  to: string;
  managerName: string | null;
  subdivisionName: string;
  lotLabel: string;
  ownerName: string | null;
  amount: number;
  claimDate: string;
  paymentMethod: string;
  notes: string | null;
  subdivisionShortCode: string;
  companyLogoUrl?: string | null;
}

export async function sendNewClaimSubmittedEmail(
  params: SendNewClaimSubmittedEmailParams,
): Promise<EmailSendResult> {
  const { to, managerName, subdivisionName, lotLabel, ownerName, amount, claimDate, paymentMethod, notes, subdivisionShortCode, companyLogoUrl } = params;
  const subject = `New owner payment claim — ${subdivisionName} ${lotLabel}`;

  if (isDryRun()) {
    console.log(`[email-dry-run] type=new_claim_submitted to=${to} amount=${amount.toFixed(2)} subject="${subject}"`);
    return { dryRun: true };
  }

  const greetingLine = managerName ? `Hi ${managerName},` : "Hi,";
  const ownerLabel = ownerName ?? "An owner";
  const notesBlock = notes && notes.trim().length > 0
    ? `<p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Owner notes</p><p style="margin:0;font-size:14px;line-height:1.5;color:#1a1f2e;">${escapeHtml(notes)}</p>`
    : "";

  const ctaBlock = buildCtaBlock(
    subdivisionShortCode,
    "reconciliation/claims",
    "Review claim",
    "Log in to Strata Wise to review this claim in the reconciliation queue.",
  );

  const html = brandShell(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#1a1f2e;">New payment claim</h2>
    <p style="margin:0 0 20px;color:#1a1f2e;font-size:14px;line-height:1.6;">
      ${greetingLine} ${escapeHtml(ownerLabel)} has submitted a payment claim for <strong>${escapeHtml(subdivisionName)}</strong> that needs your review.
    </p>
    <div style="background:#f8f9fb;border:1px solid #e2e5ea;border-radius:6px;padding:16px;margin:0 0 16px;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Lot</p>
      <p style="margin:0 0 12px;font-size:14px;color:#1a1f2e;">${escapeHtml(lotLabel)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Amount</p>
      <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#1a1f2e;">$${amount.toFixed(2)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Claimed date</p>
      <p style="margin:0 0 12px;font-size:14px;color:#1a1f2e;">${escapeHtml(claimDate)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Method</p>
      <p style="margin:0;font-size:14px;color:#1a1f2e;">${escapeHtml(paymentMethod)}</p>
    </div>
    ${notesBlock ? `<div style="background:#f8f9fb;border:1px solid #e2e5ea;border-radius:6px;padding:16px;margin:0 0 24px;">${notesBlock}</div>` : ""}
    ${ctaBlock}
    <p style="margin:24px 0 0;color:#6b7280;font-size:12px;line-height:1.5;">
      You're receiving this because you're a strata manager for ${escapeHtml(subdivisionName)}.
    </p>
  `, companyLogoUrl);

  // Use FROM_SYSTEM for managerial system-generated notifications.
  // Currently both FROM_LEVIES and FROM_SYSTEM resolve to the same address
  // in env config, but the semantic split matters for future per-domain
  // sender identity (e.g. system@myocm.com.au vs payments@myocm.com.au).
  const { data, error } = await getResend().emails.send({
    from: FROM_SYSTEM,
    to,
    subject,
    html,
  });
  if (error) {
    console.error("Failed to send new_claim_submitted email:", error);
    return { error: error.message };
  }
  return { success: true, id: data?.id ?? null };
}

// ─── HTML escape helper ────────────────────────────────────────────────
// Applied to user-controlled string interpolations in the new senders to
// guard against accidental injection from owner names, subdivision
// addresses, or rejection-reason free text.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─── CTA hyperlink helper (PP6.5) ─────────────────────────────────────
// Builds an HTML CTA block to a dashboard path. Falls back to a plain-
// text instruction when NEXT_PUBLIC_APP_URL is unset (avoids broken
// anchors with relative hrefs in inline-HTML mail clients).
function buildCtaBlock(
  subdivisionShortCode: string,
  path: string,
  ctaLabel: string,
  fallbackText: string,
): string {
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  if (!appBaseUrl) {
    return `<p style="margin:0 0 24px;color:#1a1f2e;font-size:14px;">${escapeHtml(fallbackText)}</p>`;
  }
  return `<a href="${appBaseUrl}/subdivisions/${escapeHtml(subdivisionShortCode)}/${path}" style="display:inline-block;background:#2b7fff;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 24px;border-radius:6px;margin:0 0 24px;">
    ${escapeHtml(ctaLabel)}
  </a>`;
}

// ─── PP6.5: escalation step senders ────────────────────────────────────
// Step 2 (second reminder; 28+ days overdue; opt-out-able via
// notification_preferences.notification_type='second_reminder') and
// step 3 (final notice; mandatory; bypasses opt-out via
// MANDATORY_NOTIFICATION_TYPES = { 'levy_final_notice' }).

export interface SendSecondReminderEmailParams extends SharedSenderHeader {
  referenceNumber: string;
  amountOutstanding: number;
  daysOverdue: number;
  dueDate: string;
  penaltyInterestAccrued: number;
  subdivisionShortCode: string;
  pdfBuffer?: Buffer | null;
  pdfFilename?: string;
}

export async function sendSecondReminderEmail(
  params: SendSecondReminderEmailParams,
): Promise<EmailSendResult> {
  const {
    to, ownerName, subdivisionName, subdivisionAddress,
    referenceNumber, amountOutstanding, daysOverdue, dueDate,
    penaltyInterestAccrued, subdivisionShortCode, companyLogoUrl,
    pdfBuffer, pdfFilename,
  } = params;
  const subject = `Second reminder — levy overdue ${daysOverdue}+ days — ${subdivisionName}`;

  if (isDryRun()) {
    console.log(`[email-dry-run] type=second_reminder to=${to} ref=${referenceNumber} days=${daysOverdue} pdf=${pdfBuffer ? "yes" : "no"} subject="${subject}"`);
    return { dryRun: true };
  }

  const interestLine = penaltyInterestAccrued > 0
    ? `<p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Interest accrued</p><p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#dc2626;">$${penaltyInterestAccrued.toFixed(2)}</p>`
    : "";

  const ctaBlock = buildCtaBlock(
    subdivisionShortCode,
    "my-arrears",
    "View outstanding balance",
    "Log in to Strata Wise to view your outstanding balance and payment options.",
  );

  const html = brandShell(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#b45309;">Second reminder — levy ${daysOverdue}+ days overdue</h2>
    <p style="margin:0 0 20px;color:#1a1f2e;font-size:14px;line-height:1.6;">
      ${greeting(ownerName)} our records still show an unpaid levy at <strong>${escapeHtml(subdivisionAddress)}</strong>. It is now more than <strong>${daysOverdue} days</strong> overdue and penalty interest is accruing.
    </p>
    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:16px;margin:0 0 24px;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Reference</p>
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#1a1f2e;">${escapeHtml(referenceNumber)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Original due date</p>
      <p style="margin:0 0 12px;font-size:14px;color:#1a1f2e;">${escapeHtml(dueDate)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Amount outstanding</p>
      <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#1a1f2e;">$${amountOutstanding.toFixed(2)}</p>
      ${interestLine}
    </div>
    ${ctaBlock}
    <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
      If payment is not received, the matter may proceed to a final notice and further recovery action under your strata rules.
    </p>
  `, companyLogoUrl);

  const { data, error } = await getResend().emails.send({
    from: FROM_LEVIES,
    to,
    subject,
    html,
    ...(pdfBuffer
      ? {
          attachments: [
            {
              filename: pdfFilename ?? `${referenceNumber}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        }
      : {}),
  });
  if (error) {
    console.error("Failed to send second_reminder email:", error);
    return { error: error.message };
  }
  return { success: true, id: data?.id ?? null };
}

export interface SendFinalNoticeEmailParams extends SharedSenderHeader {
  referenceNumber: string;
  amountOutstanding: number;
  daysOverdue: number;
  dueDate: string;
  penaltyInterestAccrued: number;
  subdivisionShortCode: string;
  // Final notice attaches a MERGED PDF: cover page (rendered via
  // sendFinalNoticeEmail's caller) + original levy notice. Caller builds
  // the merged buffer via src/lib/pdf/merge.ts.
  pdfBuffer?: Buffer | null;
  pdfFilename?: string;
}

export async function sendFinalNoticeEmail(
  params: SendFinalNoticeEmailParams,
): Promise<EmailSendResult> {
  const {
    to, ownerName, subdivisionName, subdivisionAddress,
    referenceNumber, amountOutstanding, daysOverdue, dueDate,
    penaltyInterestAccrued, subdivisionShortCode, companyLogoUrl,
    pdfBuffer, pdfFilename,
  } = params;
  const subject = `FINAL NOTICE — outstanding levy — ${subdivisionName}`;

  if (isDryRun()) {
    console.log(`[email-dry-run] type=levy_final_notice to=${to} ref=${referenceNumber} days=${daysOverdue} pdf=${pdfBuffer ? "yes" : "no"} subject="${subject}"`);
    return { dryRun: true };
  }

  const interestLine = penaltyInterestAccrued > 0
    ? `<p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Interest accrued</p><p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#dc2626;">$${penaltyInterestAccrued.toFixed(2)}</p>`
    : "";

  const ctaBlock = buildCtaBlock(
    subdivisionShortCode,
    "my-arrears",
    "View outstanding balance",
    "Log in to Strata Wise to view your outstanding balance and pay the levy immediately.",
  );

  const html = brandShell(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#b91c1c;">FINAL NOTICE — levy outstanding</h2>
    <p style="margin:0 0 20px;color:#1a1f2e;font-size:14px;line-height:1.6;">
      ${greeting(ownerName)} this is a <strong>final notice</strong> for the unpaid levy at <strong>${escapeHtml(subdivisionAddress)}</strong>. The levy is now more than <strong>${daysOverdue} days</strong> overdue.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px;margin:0 0 24px;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Reference</p>
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#1a1f2e;">${escapeHtml(referenceNumber)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Original due date</p>
      <p style="margin:0 0 12px;font-size:14px;color:#1a1f2e;">${escapeHtml(dueDate)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Amount outstanding</p>
      <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#b91c1c;">$${amountOutstanding.toFixed(2)}</p>
      ${interestLine}
    </div>
    ${ctaBlock}
    <p style="margin:0 0 8px;color:#1a1f2e;font-size:14px;line-height:1.5;">
      If full payment is not received promptly, the owners' corporation may commence recovery action — including, where appropriate, an application to VCAT or referral to a debt-recovery agent. Costs of recovery may be added to the debt under section 32 of the Owners Corporations Act 2006 (Vic).
    </p>
    <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
      This notice is sent as a statutory communication and cannot be opted out of.
    </p>
  `, companyLogoUrl);

  const { data, error } = await getResend().emails.send({
    from: FROM_LEVIES,
    to,
    subject,
    html,
    ...(pdfBuffer
      ? {
          attachments: [
            {
              filename: pdfFilename ?? `final-notice-${referenceNumber}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        }
      : {}),
  });
  if (error) {
    console.error("Failed to send levy_final_notice email:", error);
    return { error: error.message };
  }
  return { success: true, id: data?.id ?? null };
}
