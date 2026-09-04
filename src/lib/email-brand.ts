import "server-only";
import { createServerClient } from "@/lib/supabase";

// ============================================================================
// What a manager's email looks like.
// ----------------------------------------------------------------------------
// Every template used to hard-code #0E314C and #CFA753, so an owner opening a
// levy notice saw StrataWise's colours on correspondence that is supposed to
// come from their manager. The firm already stores its palette (it picks one
// during onboarding and it is on every PDF), so the email should use it.
//
// Our gold is the FALLBACK, not the default: a firm that has not chosen
// anything gets StrataWise's palette rather than an unstyled email.
//
// Platform mail is deliberately excluded. A verification code or a password
// reset is from us, not from the manager, and dressing it in the firm's
// colours would misrepresent who sent it.
// ============================================================================

export interface EmailBrand {
  /** Headings, buttons, emphasis. */
  primary: string;
  /** Rules and secondary accents. */
  accent: string;
  logoUrl: string | null;
}

export const STRATAWISE_BRAND: EmailBrand = {
  primary: "#0E314C",
  accent: "#CFA753",
  logoUrl: null,
};

/** Only a 3 or 6 digit hex is allowed through, because the value lands
 *  unescaped inside a style attribute. */
function safeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : null;
}

function brandFrom(row: {
  brand_color?: string | null;
  brand_color_secondary?: string | null;
  logo_url?: string | null;
} | null): EmailBrand {
  const primary = safeHex(row?.brand_color) ?? STRATAWISE_BRAND.primary;
  return {
    primary,
    // A firm that set only one colour gets it used for both, rather than
    // its primary sitting next to our gold, which reads as two brands.
    accent: safeHex(row?.brand_color_secondary) ?? safeHex(row?.brand_color) ?? STRATAWISE_BRAND.accent,
    logoUrl: row?.logo_url ?? null,
  };
}

/** The palette for mail sent on behalf of an OC. Never throws: an email must
 *  not fail to send because the palette could not be read. */
export async function brandForOC(ocId: string | null | undefined): Promise<EmailBrand> {
  if (!ocId) return STRATAWISE_BRAND;
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("owners_corporations")
      .select("management_companies(brand_color, brand_color_secondary, logo_url)")
      .eq("id", ocId)
      .maybeSingle();
    const mc = (data as { management_companies?: {
      brand_color?: string | null;
      brand_color_secondary?: string | null;
      logo_url?: string | null;
    } | null } | null)?.management_companies ?? null;
    return brandFrom(mc);
  } catch (err) {
    console.error("[email-brand] brandForOC failed, falling back to platform colours:", err);
    return STRATAWISE_BRAND;
  }
}

/** The palette for mail sent on behalf of a management company directly. */
export async function brandForCompany(companyId: string | null | undefined): Promise<EmailBrand> {
  if (!companyId) return STRATAWISE_BRAND;
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("management_companies")
      .select("brand_color, brand_color_secondary, logo_url")
      .eq("id", companyId)
      .maybeSingle();
    return brandFrom(data as Parameters<typeof brandFrom>[0]);
  } catch (err) {
    console.error("[email-brand] brandForCompany failed, falling back to platform colours:", err);
    return STRATAWISE_BRAND;
  }
}

// ─── Stopping mail clients linking things we did not link ──────────────────

/**
 * Wrap text a mail client would otherwise turn into a link.
 *
 * Apple Mail and iOS detect anything address-shaped and render it as blue
 * underlined text pointing at Maps, so a levy notice showed the property
 * address as a live link the owner had not been given and could tap by
 * accident. Gmail does the same to phone numbers and dates.
 *
 * Two halves, because no single one works everywhere: `x-apple-data-detectors`
 * is the class Apple injects, and overriding it in the head only wins if the
 * inline styles here do not lose to it, so both are applied.
 */
export function noAutoLink(text: string): string {
  return `<span style="color:inherit;text-decoration:none;" class="nolink">${text}</span>`;
}

/** Goes in the document head. Suppresses detection at the source, which is
 *  cheaper than fighting the styling afterwards. */
const NO_DETECT_HEAD = `
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no" />
  <style>
    a[x-apple-data-detectors],
    .nolink a,
    span.nolink {
      color: inherit !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
      pointer-events: none;
    }
  </style>
`;

/**
 * The outer frame every manager-facing email shares: the firm's logo, a rule
 * in the firm's accent, and the head that stops clients inventing links.
 */
export function brandedShell(innerHtml: string, brand: EmailBrand): string {
  const logo = brand.logoUrl
    ? `<img src="${brand.logoUrl}" alt="" style="max-height:48px;max-width:160px;margin-bottom:16px;" />`
    : "";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
${NO_DETECT_HEAD}
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <div style="font-family:'Inter',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 16px;">
    ${logo}
    <div style="height:3px;background:${brand.accent};border-radius:2px;margin:0 0 20px;"></div>
    ${innerHtml}
  </div>
</body>
</html>`;
}
