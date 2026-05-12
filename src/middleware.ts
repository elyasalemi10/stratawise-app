import { NextResponse, type NextRequest } from "next/server";
import { createServerClient as ssrCreateServerClient } from "@supabase/ssr";

// Public routes — no auth required.
const PUBLIC_PATHS = [
  "/",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/legal",
  "/api/webhooks",
  "/logout",
  "/sign-out",
  "/signout",
  "/log-out",
  "/dev",
  "/invite",
  "/test",
];

// Auth-flow pages that signed-in users should bounce *out* of — e.g. an
// authenticated user landing on /sign-in is sent to /dashboard so they
// don't see the form they don't need. /reset-password and /verify-email
// are NOT in this list because they require an active session.
const SIGNED_IN_REDIRECT_AWAY = ["/sign-in", "/sign-up", "/forgot-password", "/"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function shouldRedirectSignedIn(pathname: string): boolean {
  return SIGNED_IN_REDIRECT_AWAY.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export async function middleware(request: NextRequest) {
  // Two jobs: refresh the auth cookie (so server components see fresh state)
  // and gate non-public routes.
  let response = NextResponse.next({ request });

  const supabase = ssrCreateServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() must be called for cookie refresh. Do NOT remove.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Unauthenticated user on a protected route → /sign-in?next=<path>
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Already-signed-in user on /sign-in /sign-up /forgot-password / →
  // bounce to /dashboard so they don't see the form they no longer need.
  // /reset-password is excluded because it requires a session (the magic
  // link sets one). /verify-email is excluded because verification still
  // needs to happen.
  if (user && shouldRedirectSignedIn(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
