import { redirect } from "next/navigation";
import { requireSuperAdminAal1OrAbove } from "@/lib/admin-auth";
import { MfaChallengeClient } from "./mfa-challenge-client";

// Returning-user MFA challenge. They have a verified factor from a
// previous session but the current session is still AAL1 (just signed in
// with email + password). They enter their 6-digit code to promote the
// session to AAL2.

export default async function MfaChallengePage() {
  const r = await requireSuperAdminAal1OrAbove();
  if (r.kind === "redirect") redirect(r.to);
  if (r.aal === "aal2") redirect("/admin");
  if (!r.hasVerifiedTotp) redirect("/admin/mfa-enroll");

  return <MfaChallengeClient />;
}
