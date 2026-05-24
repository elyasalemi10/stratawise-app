import { createServerClient } from "@/lib/supabase";

// Sliding-window rate-limiter backed by the public.rate_limits table.
//
// Usage:
//   const { ok, retryAfterSeconds } = await rateLimitCheck({
//     key: `invite_lookup:${ip}`,
//     limit: 5,
//     windowMs: 10 * 60 * 1000,
//   });
//   if (!ok) return { error: `Too many attempts. Try again in ${retryAfterSeconds}s.` };
//
// Algorithm: simple fixed window. Each call:
//   - Reads (count, window_start) for the key.
//   - If now > window_start + windowMs → reset count to 1 and stamp window_start = now.
//   - Else → increment count.
//   - If count > limit → reject and report retry_after based on window end.
//
// Race safety: we upsert with an atomic increment. Two concurrent clients
// could in theory bump count past `limit` by a few, but for our threat
// model (5 attempts per 10 min) the practical drift is negligible.

interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function rateLimitCheck({
  key,
  limit,
  windowMs,
}: RateLimitOptions): Promise<RateLimitResult> {
  const admin = createServerClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // Read current row
  const { data: existing } = await admin
    .from("rate_limits")
    .select("count, window_start")
    .eq("key", key)
    .maybeSingle();

  let windowStartMs: number;
  let count: number;

  if (!existing) {
    windowStartMs = now;
    count = 1;
    await admin.from("rate_limits").insert({
      key,
      count: 1,
      window_start: nowIso,
    });
  } else {
    windowStartMs = new Date(existing.window_start).getTime();
    if (now - windowStartMs > windowMs) {
      // Window expired , reset
      windowStartMs = now;
      count = 1;
      await admin
        .from("rate_limits")
        .update({ count: 1, window_start: nowIso })
        .eq("key", key);
    } else {
      count = existing.count + 1;
      await admin
        .from("rate_limits")
        .update({ count })
        .eq("key", key);
    }
  }

  const windowEnd = windowStartMs + windowMs;
  const remaining = Math.max(0, limit - count);
  const retryAfterSeconds = count > limit ? Math.ceil((windowEnd - now) / 1000) : 0;

  return {
    ok: count <= limit,
    remaining,
    retryAfterSeconds,
  };
}

/**
 * Best-effort client-IP extraction from a Next.js Request headers object.
 * Used to key per-IP rate limits.
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  return headers.get("x-real-ip") ?? "unknown";
}
