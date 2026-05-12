import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createBrowserClient as ssrCreateBrowserClient,
  createServerClient as ssrCreateServerClient,
} from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Browser client — RLS-aware, reads auth from browser cookies via @supabase/ssr.
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
 * Server client (SSR) — RLS-aware, reads auth from cookies.
 * Use in Server Components, Route Handlers, and Server Actions when you
 * need the current user (e.g. `supabase.auth.getUser()`) or RLS-scoped
 * queries. Cookie write-failures inside Server Components are silently
 * swallowed — the middleware refreshes the session cookie on every request.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return ssrCreateServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components can't set cookies; middleware refreshes the
            // auth cookie on every request, so this is safe to swallow.
          }
        },
      },
    },
  );
}

/**
 * Admin client — uses the service-role key, BYPASSES RLS.
 * Use ONLY in trusted server contexts: system operations, webhook handlers,
 * trigger jobs, and back-office actions where the app already validated
 * authorization at a higher level (via requireRole / requireSubdivisionAccess).
 *
 * NEVER expose this client to the browser. New per-call (no singleton) to
 * avoid shared state across requests.
 */
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
