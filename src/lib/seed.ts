/**
 * Seed script — promotes the first user to super_admin.
 *
 * Usage:
 *   npx tsx src/lib/seed.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * in .env.local (loaded via dotenv).
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function seed() {
  console.log("Fetching profiles...\n");

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, clerk_id, email, first_name, last_name, role")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch profiles:", error.message);
    process.exit(1);
  }

  if (!profiles || profiles.length === 0) {
    console.error("No profiles found. Sign up via Clerk first, then run this script.");
    process.exit(1);
  }

  // Show all profiles
  console.log("Profiles found:");
  profiles.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.email} (${p.first_name ?? ""} ${p.last_name ?? ""}) — role: ${p.role}`);
  });

  // Promote the first profile to super_admin
  const target = profiles[0];

  if (target.role === "super_admin") {
    console.log(`\n${target.email} is already super_admin. Nothing to do.`);
    process.exit(0);
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ role: "super_admin" })
    .eq("id", target.id);

  if (updateError) {
    console.error("Failed to update role:", updateError.message);
    process.exit(1);
  }

  // Audit log
  await supabase.from("audit_log").insert({
    profile_id: target.id,
    action: "update",
    entity_type: "profile",
    entity_id: target.id,
    before_state: { role: target.role },
    after_state: { role: "super_admin" },
    metadata: { source: "seed_script" },
  });

  console.log(`\n✓ ${target.email} promoted to super_admin`);
}

seed();
