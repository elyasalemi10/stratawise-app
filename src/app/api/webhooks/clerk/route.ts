import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { createServerClient } from "@/lib/supabase";

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

// Default notification types to seed for new users
const NOTIFICATION_TYPES = [
  "levy_issued",
  "payment_received",
  "payment_overdue",
  "meeting_notice",
  "meeting_minutes",
  "maintenance_update",
  "announcement",
  "complaint_update",
  "escalation_step",
  "document_uploaded",
];

interface ClerkEmailAddress {
  email_address: string;
  id: string;
}

interface ClerkUserEvent {
  id: string;
  email_addresses: ClerkEmailAddress[];
  primary_email_address_id: string;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  unsafe_metadata?: { intended_role?: string } | null;
}

type ProfileRole = "super_admin" | "strata_manager" | "lot_owner";

// Map signup-time intended_role to the profiles.role enum. The sign-up page
// emits "strata_manager" or "lot_owner" directly; anything else (missing,
// malformed, super_admin attempted) falls back to lot_owner.
function resolveSignupRole(value: unknown): ProfileRole {
  if (value === "strata_manager") return "strata_manager";
  return "lot_owner";
}

async function verifyWebhook(request: NextRequest) {
  if (!WEBHOOK_SECRET) {
    throw new Error("CLERK_WEBHOOK_SECRET is not set");
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new Error("Missing svix headers");
  }

  const body = await request.text();
  const wh = new Webhook(WEBHOOK_SECRET);

  const payload = wh.verify(body, {
    "svix-id": svixId,
    "svix-timestamp": svixTimestamp,
    "svix-signature": svixSignature,
  }) as { type: string; data: ClerkUserEvent };

  return payload;
}

function getPrimaryEmail(data: ClerkUserEvent): string {
  const primary = data.email_addresses.find(
    (e) => e.id === data.primary_email_address_id
  );
  return primary?.email_address ?? data.email_addresses[0]?.email_address ?? "";
}

// ─── user.created ───────────────────────────────────────────────

async function handleUserCreated(data: ClerkUserEvent) {
  const supabase = createServerClient();
  const email = getPrimaryEmail(data);

  // Resolve profileId. Three possible paths:
  //   1. SELECT finds an existing row → use it (concurrent ensureProfile
  //      already inserted)
  //   2. SELECT misses → INSERT succeeds → use the new id
  //   3. SELECT misses → INSERT loses the race with ensureProfile (Postgres
  //      23505 unique-constraint violation) → re-SELECT → use existing
  //
  // Whichever path lands us with an `existing.id`, fall through to the
  // single UPDATE branch below — that keeps the "refresh fields from the
  // Clerk webhook payload" logic in one place.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_id", data.id)
    .single();

  let profileId: string | null = existing?.id ?? null;

  if (!profileId) {
    const role = resolveSignupRole(data.unsafe_metadata?.intended_role);
    const { data: created, error } = await supabase
      .from("profiles")
      .insert({
        clerk_id: data.id,
        email,
        first_name: data.first_name,
        last_name: data.last_name,
        avatar_url: data.image_url,
        role,
      })
      .select("id")
      .single();

    if (error) {
      // 23505 = duplicate key. A concurrent caller (typically ensureProfile
      // running on a protected page-load right after signup) committed the
      // insert in the brief window between our SELECT and INSERT. Recover
      // by re-reading the row and falling through to the UPDATE branch.
      if (error.code === "23505") {
        console.warn("profiles: concurrent insert race recovered", {
          path: "webhook",
          clerk_id: data.id,
        });
        const { data: raced } = await supabase
          .from("profiles")
          .select("id")
          .eq("clerk_id", data.id)
          .single();
        profileId = raced?.id ?? null;
      } else {
        console.error("Failed to create profile:", error);
      }
    } else {
      profileId = created?.id ?? null;
    }
  }

  if (!profileId) {
    // Either the non-23505 INSERT error fired, or the race-recovery SELECT
    // also turned up empty (extremely unlikely). Bail without seeding —
    // the next page-load via ensureProfile will retry.
    return;
  }

  // Single UPDATE branch — runs whether the row pre-existed (path 1),
  // was just inserted by us (path 2), or was inserted by ensureProfile
  // and we recovered after 23505 (path 3). The webhook is the
  // authoritative refresh point for these Clerk-sourced fields.
  await supabase
    .from("profiles")
    .update({
      email,
      first_name: data.first_name,
      last_name: data.last_name,
      avatar_url: data.image_url,
    })
    .eq("id", profileId);

  // Seed default notification preferences
  const preferences = NOTIFICATION_TYPES.flatMap((type) => [
    { profile_id: profileId, notification_type: type, channel: "email", enabled: true },
    { profile_id: profileId, notification_type: type, channel: "in_app", enabled: true },
    { profile_id: profileId, notification_type: type, channel: "sms", enabled: false },
    { profile_id: profileId, notification_type: type, channel: "voice", enabled: false },
  ]);

  const { error: prefError } = await supabase
    .from("notification_preferences")
    .upsert(preferences, { onConflict: "profile_id,notification_type,channel" });

  if (prefError) {
    console.error("Failed to seed notification preferences:", prefError);
  }

  // Audit log
  await supabase.from("audit_log").insert({
    profile_id: profileId,
    action: "create",
    entity_type: "profile",
    entity_id: profileId,
    after_state: { clerk_id: data.id, email, first_name: data.first_name, last_name: data.last_name },
  });
}

// ─── user.updated ───────────────────────────────────────────────

async function handleUserUpdated(data: ClerkUserEvent) {
  const supabase = createServerClient();
  const email = getPrimaryEmail(data);

  // Get current profile state for before_state
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, avatar_url")
    .eq("clerk_id", data.id)
    .single();

  if (!profile) {
    // Profile doesn't exist yet — create it instead
    await handleUserCreated(data);
    return;
  }

  const beforeState = {
    email: profile.email,
    first_name: profile.first_name,
    last_name: profile.last_name,
    avatar_url: profile.avatar_url,
  };

  const afterState = {
    email,
    first_name: data.first_name,
    last_name: data.last_name,
    avatar_url: data.image_url,
  };

  // Update profile
  const { error } = await supabase
    .from("profiles")
    .update(afterState)
    .eq("id", profile.id);

  if (error) {
    console.error("Failed to update profile:", error);
    return;
  }

  // Audit log
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    action: "update",
    entity_type: "profile",
    entity_id: profile.id,
    before_state: beforeState,
    after_state: afterState,
  });
}

// ─── user.deleted ───────────────────────────────────────────────

async function handleUserDeleted(data: ClerkUserEvent) {
  const supabase = createServerClient();

  // Get full profile for before_state
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("clerk_id", data.id)
    .single();

  if (!profile) {
    console.error("Profile not found for deleted user:", data.id);
    return;
  }

  const beforeState = { ...profile };

  // Anonymise — do NOT delete
  const { error } = await supabase
    .from("profiles")
    .update({
      status: "anonymised",
      anonymised_at: new Date().toISOString(),
      first_name: "Former",
      last_name: "User",
      email: `anonymised-${profile.id}@msm.internal`,
      phone: null,
      postal_address: null,
      avatar_url: null,
    })
    .eq("id", profile.id);

  if (error) {
    console.error("Failed to anonymise profile:", error);
    return;
  }

  // End all active subdivision memberships
  await supabase
    .from("subdivision_members")
    .update({ left_at: new Date().toISOString() })
    .eq("profile_id", profile.id)
    .is("left_at", null);

  // Pause any active escalation instances linked to this user's levies
  const { data: memberLots } = await supabase
    .from("subdivision_members")
    .select("lot_id")
    .eq("profile_id", profile.id);

  if (memberLots && memberLots.length > 0) {
    const lotIds = memberLots.map((m) => m.lot_id).filter(Boolean);

    if (lotIds.length > 0) {
      // Find levy notices for these lots
      const { data: levies } = await supabase
        .from("levy_notices")
        .select("id")
        .in("lot_id", lotIds);

      if (levies && levies.length > 0) {
        const levyIds = levies.map((l) => l.id);

        await supabase
          .from("escalation_instances")
          .update({
            status: "paused",
            paused_at: new Date().toISOString(),
            paused_reason: "User account deleted/anonymised",
          })
          .in("levy_notice_id", levyIds)
          .eq("status", "active");
      }
    }
  }

  // Audit log
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    action: "anonymise",
    entity_type: "profile",
    entity_id: profile.id,
    before_state: beforeState,
    after_state: {
      status: "anonymised",
      first_name: "Former",
      last_name: "User",
      email: `anonymised-${profile.id}@msm.internal`,
    },
  });
}

// ─── Route handler ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { type, data } = await verifyWebhook(request);

    switch (type) {
      case "user.created":
        await handleUserCreated(data);
        break;
      case "user.updated":
        await handleUserUpdated(data);
        break;
      case "user.deleted":
        await handleUserDeleted(data);
        break;
      default:
        // Ignore other event types
        break;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json(
      { error: "Webhook verification failed" },
      { status: 400 }
    );
  }
}
