import "server-only";
import { createServerClient } from "@/lib/supabase";

// Turning a URL segment back into a row.
//
// Everything addressable now carries an eight-character short_code alongside
// its UUID (see the short_codes_for_url_entities migration). URLs use the
// code; the database still joins on the UUID.
//
// Both are accepted. Links live in bookmarks, emails and other people's
// notes, and a UUID that used to work should keep working rather than 404 on
// someone who saved it last month. The shape tells them apart with no
// ambiguity: a UUID has dashes and hex, a code is eight characters of an
// alphabet with no 0/O or 1/I.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

export function looksLikeUuid(value: string | undefined): boolean {
  return !!value && UUID.test(value);
}

export function looksLikeShortCode(value: string | undefined): boolean {
  return !!value && SHORT_CODE.test(value);
}

/** Tables that carry a short_code. Narrow on purpose: this builds a query
 *  from the value, so it must never be caller-supplied. */
export type CodedTable = "lots" | "levy_batches" | "budgets" | "meetings";

/**
 * The row id for a URL segment, whether it is a short code or a UUID.
 *
 * Returns null for anything malformed WITHOUT querying, so a bot walking
 * random URLs costs nothing.
 */
export async function resolveId(
  table: CodedTable,
  segment: string | undefined,
): Promise<string | null> {
  if (!segment) return null;
  if (looksLikeUuid(segment)) return segment;
  if (!looksLikeShortCode(segment)) return null;

  const supabase = createServerClient();
  const { data } = await supabase
    .from(table)
    .select("id")
    .eq("short_code", segment)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
