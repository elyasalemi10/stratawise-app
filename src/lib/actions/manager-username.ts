"use server";

import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import {
  isValidUsername,
  isWithinCooldown,
  USERNAME_CHANGE_COOLDOWN_DAYS,
} from "@/lib/manager-username";
import {
  findAvailableUsername,
  isUsernameAvailable,
} from "@/lib/manager-username-server";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// Ensures the signed-in manager has an email_username. Idempotent — no-op when one
// already exists. Run lazily from places that need the address (e.g. before sending
// an outbound email from this manager).
export async function ensureManagerUsername(): Promise<Result<{ username: string }>> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: row, error: fetchErr } = await supabase
    .from("profiles")
    .select("id, email_username, first_name, last_name")
    .eq("id", profile.id)
    .single();
  if (fetchErr || !row) return { ok: false, error: "Profile not found" };
  if (row.email_username) return { ok: true, data: { username: row.email_username } };

  const candidate = await findAvailableUsername(row.first_name, row.last_name);
  if (!candidate) {
    return {
      ok: false,
      error: "Could not derive a username from your name — please set one in settings.",
    };
  }

  const { error: updErr } = await supabase
    .from("profiles")
    .update({
      email_username: candidate,
      email_username_changed_at: new Date().toISOString(),
    })
    .eq("id", profile.id);
  if (updErr) return { ok: false, error: "Failed to set username" };

  await logAudit({
    profileId: profile.id,
    action: "create",
    entityType: "profile_username",
    entityId: profile.id,
    after: { email_username: candidate, derived: true },
    metadata: { source: "auto-onboarding" },
  });

  return { ok: true, data: { username: candidate } };
}

export async function checkUsernameAvailable(
  candidate: string,
): Promise<Result<{ available: boolean }>> {
  await requireCompanyRole();
  if (!isValidUsername(candidate)) {
    return { ok: false, error: "Use 3-40 lowercase letters, numbers, dots, dashes, or underscores." };
  }
  return { ok: true, data: { available: await isUsernameAvailable(candidate) } };
}

export async function renameManagerUsername(
  newUsername: string,
): Promise<Result<{ username: string }>> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  if (!isValidUsername(newUsername)) {
    return {
      ok: false,
      error: "Use 3-40 lowercase letters, numbers, dots, dashes, or underscores.",
    };
  }

  const { data: row, error: fetchErr } = await supabase
    .from("profiles")
    .select("id, email_username, email_username_changed_at")
    .eq("id", profile.id)
    .single();
  if (fetchErr || !row) return { ok: false, error: "Profile not found" };

  if (row.email_username && row.email_username.toLowerCase() === newUsername.toLowerCase()) {
    return { ok: true, data: { username: row.email_username } };
  }

  if (isWithinCooldown(row.email_username_changed_at)) {
    return {
      ok: false,
      error: `You can only change your username once every ${USERNAME_CHANGE_COOLDOWN_DAYS} days.`,
    };
  }

  if (!(await isUsernameAvailable(newUsername))) {
    return { ok: false, error: "That username is taken." };
  }

  const previous = row.email_username;
  const { error: updErr } = await supabase
    .from("profiles")
    .update({
      email_username: newUsername,
      email_username_changed_at: new Date().toISOString(),
    })
    .eq("id", profile.id);
  if (updErr) return { ok: false, error: "Failed to update username" };

  // Forward old username so legacy inbound mail still reaches this manager.
  if (previous) {
    const { error: aliasErr } = await supabase.from("profile_username_aliases").insert({
      username: previous,
      profile_id: profile.id,
    });
    if (aliasErr) {
      console.error("[manager-username] failed to persist alias:", aliasErr.message);
    }
  }

  await logAudit({
    profileId: profile.id,
    action: "update",
    entityType: "profile_username",
    entityId: profile.id,
    before: { email_username: previous },
    after: { email_username: newUsername },
  });

  return { ok: true, data: { username: newUsername } };
}
