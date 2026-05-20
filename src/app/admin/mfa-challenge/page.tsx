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
  if (!r.hasVerifiedTotp) redirect("/admin/mfa-enroll");

  // NOTE: we deliberately do NOT redirect aal2 sessions back to /admin here.
  // Supabase's AAL read can disagree between consecutive server requests, and
  // /admin redirects here whenever it sees aal1 — pairing that with an
  // aal2→/admin redirect produced an infinite "too many redirects" loop. This
  // page is now terminal: it only ever renders the form. After a successful
  // verify the client navigates to /admin, which then renders normally.
  return <MfaChallengeClient />;
}
