import "server-only";
import { createServerClient as ssrCreateServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server client (SSR) — RLS-aware, reads auth from cookies.
 * Use in Server Components, Route Handlers, and Server Actions when you
 * need the current user (e.g. `supabase.auth.getUser()`) or RLS-scoped
 * queries. Cookie write-failures inside Server Components are silently
 * swallowed — the middleware refreshes the session cookie on every request.
 *
 * Lives in a separate file from supabase.ts so client components can still
 * import the browser/admin clients without pulling in next/headers (which
 * is server-only and breaks client bundles).
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
