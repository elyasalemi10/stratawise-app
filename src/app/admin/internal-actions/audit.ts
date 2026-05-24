"use server";

import { createServerClient } from "@/lib/supabase";
import { getCurrentProfile } from "@/lib/auth";

// Called from the MFA enrol / challenge clients (via Supabase Auth, which
// runs the actual TOTP exchange in the browser). They tell us when the
// dance completed so we can drop an audit_log row server-side. Supabase
// auth.audit_log_entries already records the factor-level events for
// compliance, but having our own row keeps the unified history in
// `audit_log` complete , same place we look for everything else.

export async function logMfaEvent(
  action: "mfa_enrolled" | "mfa_verified" | "mfa_enroll_failed" | "mfa_verify_failed",
  metadata: { reason?: string; factorId?: string } = {},
) {
  const profile = await getCurrentProfile();
  if (!profile) return;
  if (profile.role !== "super_admin") return;
  const supabase = createServerClient();
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: null,
    action,
    entity_type: "profile",
    entity_id: profile.id,
    metadata,
  });
}
