import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser client — uses the anon key.
 * Safe for client components. Respects RLS policies.
 * Lazily initialized to avoid build-time errors when env vars aren't set.
 */
let _browserClient: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (!_browserClient) {
    _browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _browserClient;
}

/**
 * Server client — uses the service role key.
 * Bypasses RLS. Use ONLY in server actions, API routes, and Trigger.dev jobs.
 * NEVER expose this client to the browser.
 * Creates a new client per call (no singleton) to avoid shared state across requests.
 */
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
