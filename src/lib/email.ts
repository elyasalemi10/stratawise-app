import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM_EMAIL = "My Strata Management <noreply@myocm.com.au>";

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
    from: FROM_EMAIL,
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
