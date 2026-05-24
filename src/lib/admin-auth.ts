import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createServerClient } from "@/lib/supabase";
import { getCurrentProfile } from "@/lib/auth";

// ── Super admin + MFA gate (server-side) ────────────────────────────────
//
// Three states a super admin can be in after sign-in:
//
//   1. Not signed in / not super_admin
//        → kick to "/" (sign-in) or "/dashboard" (regular role).
//   2. super_admin AND has no verified TOTP factor yet
//        → /admin/mfa-enroll , first-time setup.
//   3. super_admin WITH a verified TOTP factor BUT current session is AAL1
//        → /admin/mfa-challenge , re-verify after each sign-in.
//   4. super_admin AND session is AAL2
//        → cleared, render the requested admin page.
//
// `requireSuperAdminMfa()` returns the routing decision so layouts can
// redirect; pages call it for the side-effect of pinning AAL2 access.
//
// MFA factor state and AAL come from Supabase Auth directly , no extra
// schema needed. `listFactors()` returns verified TOTP factors. AAL is
// returned by `getAuthenticatorAssuranceLevel()`.

export type AdminGateResult =
  | { kind: "ok" }
  | { kind: "redirect"; to: "/" | "/dashboard" | "/admin/mfa-enroll" | "/admin/mfa-challenge" };

export async function evaluateSuperAdminGate(): Promise<AdminGateResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { kind: "redirect", to: "/" };
  if (profile.role !== "super_admin") {
    return { kind: "redirect", to: "/dashboard" };
  }

  const sb = await createSupabaseServerClient();
  const { data: factorData } = await sb.auth.mfa.listFactors();
  const verifiedTotp = (factorData?.totp ?? []).filter((f) => f.status === "verified");

  if (verifiedTotp.length === 0) {
    return { kind: "redirect", to: "/admin/mfa-enroll" };
  }

  const { data: aalData } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalData?.currentLevel !== "aal2") {
    return { kind: "redirect", to: "/admin/mfa-challenge" };
  }

  return { kind: "ok" };
}

// Allows the enroll / challenge pages themselves to authorise , they must
// be reachable while NOT at AAL2 so the user can actually complete the
// dance. They still require super_admin role + an AAL1 session.
export async function requireSuperAdminAal1OrAbove(): Promise<
  | { kind: "ok"; aal: "aal1" | "aal2"; hasVerifiedTotp: boolean }
  | { kind: "redirect"; to: "/" | "/dashboard" }
> {
  const profile = await getCurrentProfile();
  if (!profile) return { kind: "redirect", to: "/" };
  if (profile.role !== "super_admin") return { kind: "redirect", to: "/dashboard" };

  const sb = await createSupabaseServerClient();
  const { data: aalData } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  const aal = (aalData?.currentLevel ?? "aal1") as "aal1" | "aal2";

  const { data: factorData } = await sb.auth.mfa.listFactors();
  const hasVerifiedTotp = (factorData?.totp ?? []).some(
    (f) => f.status === "verified",
  );

  return { kind: "ok", aal, hasVerifiedTotp };
}
