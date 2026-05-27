import { NextResponse, type NextRequest } from "next/server";

/**
 * Forbidden response that's friendly to both JSON consumers and direct
 * browser navigation. If the request was made by a browser opening the
 * URL (Accept: text/html), redirect to the dashboard so the user lands
 * somewhere sensible instead of seeing raw JSON. Programmatic callers
 * (fetch / XHR) still get the JSON 403 they expect.
 */
export function forbiddenResponse(
  req: NextRequest | Request,
  message = "Forbidden",
): NextResponse {
  const accept = req.headers.get("accept") ?? "";
  const wantsHtml = accept.includes("text/html");
  if (wantsHtml) {
    const url = new URL("/dashboard?denied=1", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.json({ error: message }, { status: 403 });
}
