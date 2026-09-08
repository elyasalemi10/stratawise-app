// The client half: building a URL from a row.
//
// Kept separate from short-code.ts because that one is "server-only" (it
// opens a database client) and a link is built in a client component.

/** Prefer the short code, fall back to the id.
 *
 *  The fallback matters during a deploy: a page rendered from a cached
 *  payload written before short codes existed has no code on the row, and a
 *  link to `/lots/undefined` is worse than a long URL. */
export function urlSegment(row: { short_code?: string | null; id: string }): string {
  return row.short_code || row.id;
}
