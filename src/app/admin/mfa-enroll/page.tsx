import { redirect } from "next/navigation";
import { requireSuperAdminAal1OrAbove } from "@/lib/admin-auth";
import { MfaEnrollClient } from "./mfa-enroll-client";

// Server-side gate: must be a signed-in super_admin. If they already have
// a verified TOTP factor we send them to the challenge page instead — no
// point re-enrolling. AAL2 means they've already verified this session,
// so push them straight to the admin home.

export default async function MfaEnrollPage() {
  const r = await requireSuperAdminAal1OrAbove();
  if (r.kind === "redirect") redirect(r.to);
  if (r.aal === "aal2") redirect("/admin");
  if (r.hasVerifiedTotp) redirect("/admin/mfa-challenge");

  return <MfaEnrollClient />;
}
