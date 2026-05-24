import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Microsoft admin-consent callback. The customer admin clicks the
// consent URL we generate (which includes ?state=<csrf>), grants
// permissions for their tenant, then Microsoft redirects them back
// here with ?tenant=<tenantId>&admin_consent=True&state=<csrf>.
//
// We:
//   1. Verify the state cookie matches (CSRF guard)
//   2. Resolve the signed-in manager profile
//   3. Persist the captured tenantId onto management_companies.mail_provider_config.tenant_id
//   4. Redirect back to /settings?tab=email with a success/error flag
//
// Failures (consent denied, state mismatch) redirect with ?outlook_error=...
// so the Email tab can show a banner.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS_URL = "/settings?tab=email";

function redirect(url: string) {
  return NextResponse.redirect(url, { status: 302 });
}

export async function GET(request: NextRequest) {
  const base = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;
  const tenantId = params.get("tenant");
  const adminConsent = params.get("admin_consent");
  const state = params.get("state");
  const errorParam = params.get("error");
  const errorDescription = params.get("error_description");

  // Microsoft surfaces denial / consent error in ?error=...
  if (errorParam) {
    const reason = encodeURIComponent(errorDescription ?? errorParam);
    return redirect(`${base}${SETTINGS_URL}&outlook_error=${reason}`);
  }

  if (!tenantId || adminConsent !== "True") {
    return redirect(`${base}${SETTINGS_URL}&outlook_error=missing_tenant_or_consent`);
  }

  // CSRF , state cookie was set when the admin clicked "Connect Microsoft
  // 365" in Settings. If it's missing or doesn't match, refuse.
  const expectedState = request.cookies.get("outlook_consent_state")?.value;
  if (!expectedState || expectedState !== state) {
    return redirect(`${base}${SETTINGS_URL}&outlook_error=state_mismatch`);
  }

  // Resolve current manager (the admin who initiated the flow). If no
  // session, redirect to sign-in and bring them back here.
  const sb = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return redirect(`${base}/sign-in?return=${encodeURIComponent(SETTINGS_URL)}`);
  }

  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, management_company_id, company_role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile || profile.company_role !== "admin" || !profile.management_company_id) {
    return redirect(`${base}${SETTINGS_URL}&outlook_error=not_admin`);
  }

  // Merge tenant_id onto whatever's already in mail_provider_config (eg.
  // a previously-saved firm domain). We don't flip mail_provider here ,
  // that happens when the admin completes the connect flow (saves their
  // mailbox + tests the connection).
  const { data: company } = await supabase
    .from("management_companies")
    .select("mail_provider_config")
    .eq("id", profile.management_company_id)
    .maybeSingle();
  const existingConfig = (company?.mail_provider_config ?? {}) as Record<string, unknown>;

  await supabase
    .from("management_companies")
    .update({
      mail_provider_config: {
        ...existingConfig,
        tenant_id: tenantId,
        admin_consent_at: new Date().toISOString(),
      },
    })
    .eq("id", profile.management_company_id);

  // Clear the CSRF cookie + redirect.
  const response = redirect(`${base}${SETTINGS_URL}&outlook_consent=granted`);
  response.cookies.delete("outlook_consent_state");
  return response;
}
