// ─── Verification-script injection seam ────────────────────────
//
// Server actions call getCurrentProfile(), which reads the Supabase Auth user
// id from request cookies. That path requires a live HTTP request scope,
// which a standalone `tsx` verification script does not have. The seam below
// lets *.verification.ts replace the userId resolver before calling any
// server action. Production code MUST NOT import or call these functions.
//
// Pre-launch grep: `grep -rn "__setUserIdResolverForVerification" src/` must
// return exactly two hits , the definition here and the call site in a
// *.verification.ts script. Any other hit is a bug.

export type UserIdResolver = () => Promise<string | null>;
let _verificationUserIdResolver: UserIdResolver | null = null;

/** Injection seam for verification scripts only. Never call from application code. Production servers never invoke this. */
export function __setUserIdResolverForVerification(fn: UserIdResolver | null): void {
  _verificationUserIdResolver = fn;
}

/** Read-only probe so a verification script can assert its resolver is active before running scenarios. Never call from application code. */
export function __getUserIdResolverForVerification(): UserIdResolver | null {
  return _verificationUserIdResolver;
}

export { _verificationUserIdResolver };
