import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient as ssrCreateBrowserClient } from "@supabase/ssr";

/**
 * Browser client , RLS-aware, reads auth from browser cookies via @supabase/ssr.
 * Use in client components for queries that should respect the signed-in user.
 * Lazily initialized; safe to call repeatedly.
 */
let _browserClient: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (!_browserClient) {
    _browserClient = ssrCreateBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return _browserClient;
}

/**
 * Admin client , uses the service-role key, BYPASSES RLS.
 * Use ONLY in trusted server contexts: system operations, webhook handlers,
 * trigger jobs, and back-office actions where the app already validated
 * authorization at a higher level (via requireRole / requireOCAccess).
 *
 * NEVER expose this client to the browser. New per-call (no singleton).
 *
 * SSR cookie-aware server client lives in supabase-server.ts so this file
 * stays client-safe (next/headers is server-only).
 */
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
