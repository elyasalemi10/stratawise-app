// Single source of truth for the Gmail scopes StrataWise asks customer
// Workspace admins to authorise (Domain-Wide Delegation).
//
// Every credentials builder, every Test connection call, and every render
// of the customer-facing onboarding / settings page MUST import from here.
// Do NOT hard-code these strings inline anywhere else — drift between the
// code and the doc is the #1 way DWD breaks invisibly.
//
// Bumping this list is a fleet-wide event: every existing customer's
// Workspace admin will need to re-authorise. The test in
// src/lib/google/gmail-scopes.lock.test.ts fails on any change so the
// migration conversation happens before the deploy, not after.

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
] as const;

export type GmailScope = (typeof GMAIL_SCOPES)[number];

// Comma-separated form the customer pastes into Workspace admin's
// "Domain-wide delegation" form. Rendered directly by the EmailTab so the
// doc literally can't drift from the code constant.
export const GMAIL_SCOPES_STRING: string = GMAIL_SCOPES.join(",");
