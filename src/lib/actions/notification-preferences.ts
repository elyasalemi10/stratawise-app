"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import {
  MANDATORY_NOTIFICATION_TYPES,
  MANAGERIAL_NOTIFICATION_TYPES,
  NOTIFICATION_TYPES,
} from "@/lib/notifications";

// ============================================================================
// updateNotificationPreferences (PP6-D-B)
// ----------------------------------------------------------------------------
// Owner-facing settings action for /settings/notifications. Batch-upserts
// notification_preferences rows for the calling profile.
//
// Two layers of validation:
//   1. Zod shape , type IN seedList, channel IN ['email', 'in_app'], boolean
//   2. Application-layer guards ,
//        - Reject any update that would disable a MANDATORY type
//          (statutory carve-out, e.g. levy_final_notice).
//        - Reject any update that would disable in-app for a MANAGERIAL
//          type (operational signal must always reach the manager's inbox).
//
// Both rejection paths return errorCode so the verification suite can
// distinguish Zod-shape errors from application-layer guard errors.
// ============================================================================

const updatePreferencesSchema = z.object({
  updates: z
    .array(
      z.object({
        type: z.enum(NOTIFICATION_TYPES),
        channel: z.enum(["email", "in_app"]),
        enabled: z.boolean(),
      }),
    )
    .min(1),
});

export type UpdateNotificationPreferencesInput = z.infer<
  typeof updatePreferencesSchema
>;

export type UpdateNotificationPreferencesResult =
  | { success: true; updated: number }
  | {
      error: string;
      errorCode?: "VALIDATION" | "MANDATORY_DISABLE" | "MANAGERIAL_INAPP_DISABLE" | "AUTH" | "DB_ERROR";
    };

export async function updateNotificationPreferences(
  input: UpdateNotificationPreferencesInput,
): Promise<UpdateNotificationPreferencesResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated", errorCode: "AUTH" };

  const parsed = updatePreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      errorCode: "VALIDATION",
    };
  }

  // Application-layer guards , Zod can't enforce cross-field rules cleanly.
  for (const u of parsed.data.updates) {
    // MANDATORY_DISABLE guard , defence-in-depth for the future case where
    // a NOTIFICATION_TYPES entry is also in MANDATORY_NOTIFICATION_TYPES.
    // Currently no such overlap (levy_final_notice is mandatory but not in
    // seed list , bypass in isNotificationOptedOut handles its non-opt-out
    // at send time). Guard activates automatically when PP6-C-3 ships
    // final notice as a seeded type.
    if (
      MANDATORY_NOTIFICATION_TYPES.has(u.type) &&
      u.channel === "email" &&
      !u.enabled
    ) {
      return {
        error: `${u.type} cannot be disabled , required by law`,
        errorCode: "MANDATORY_DISABLE",
      };
    }
    if (
      MANAGERIAL_NOTIFICATION_TYPES.has(u.type) &&
      u.channel === "in_app" &&
      !u.enabled
    ) {
      return {
        error: `${u.type} in-app cannot be disabled , operational signal`,
        errorCode: "MANAGERIAL_INAPP_DISABLE",
      };
    }
  }

  const supabase = createServerClient();
  const rows = parsed.data.updates.map((u) => ({
    profile_id: profile.id,
    notification_type: u.type,
    channel: u.channel,
    enabled: u.enabled,
  }));

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(rows, { onConflict: "profile_id,notification_type,channel" });

  if (error) {
    console.error("updateNotificationPreferences: upsert failed", error);
    return { error: error.message, errorCode: "DB_ERROR" };
  }

  // Audit: counts + types only (not full update array , keeps audit log
  // size bounded; specific values are recoverable from the row state).
  const typesUpdated = Array.from(
    new Set(parsed.data.updates.map((u) => u.type)),
  );
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: null,
    action: "communication.preferences_updated",
    entity_type: "notification_preferences",
    entity_id: profile.id,
    metadata: {
      count: parsed.data.updates.length,
      types_updated: typesUpdated,
    },
  });

  revalidatePath("/settings");
  return { success: true, updated: parsed.data.updates.length };
}
