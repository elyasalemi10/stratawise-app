# StrataWise (SW) , Claude Code Rules

## Working style
- When the user gives a numbered list of tasks, the FINAL message of the response must address each item by number (`1. ...`, `2. ...`, etc.), even items that didn't require code changes (so they don't have to scroll up to map work back to their list).

## Copy rules (apply EVERYWHERE, automatic)
- **NEVER write em dashes anywhere in this codebase.** The em dash is the Unicode character `U+2014`. Not in JSX text, not in placeholders, not in toasts, not in PDF templates, not in code comments, not in CLAUDE.md itself. Replace with a comma, colon, parentheses, or just two sentences. Reason: a single typographic character that crept into hundreds of strings is exactly the kind of thing that's easy to write and impossible to clean up later, so the rule is zero tolerance. If you find yourself reaching for an em dash, use a comma or colon instead. `grep -r "$(printf '\xe2\x80\x94')" src/` across the repo MUST return zero results.
- **No small helper / explainer paragraphs anywhere.** Tooltip-grade copy under inputs, under filter blocks, beneath field groups, beside checkboxes, etc., clutters the page and makes the product feel beginner-friendly to the point of being insulting. Default to ZERO helper copy. The only exceptions: (a) a placeholder string inside the input itself, (b) a label above the input, (c) an inline validation error AFTER the user clicks submit. If a field genuinely needs an explanation, the design is wrong: either rename the label, drop the field, or move the explanation into a docs page the user can choose to open. Apply this when reviewing existing screens too, if you find a `<p className="text-xs text-muted-foreground">` next to a control, delete it.
- **NEVER render an enum/raw value in user-facing UI.** Anything stored as a database enum or `snake_case` key (`asset`, `gst_on_income`, `capital_works`, `administrative`, `coa_account_type`, etc.) MUST be displayed via a `_LABEL` lookup. The pattern is: every enum gets a `FOO_LABEL: Record<FooEnum, string>` (and a `FOO_OPTIONS` array when used in a `<Select>`) co-located with the enum type definition. Components import the labels, never the raw values. Applies to `<Select>` triggers (set `<SelectValue>` children to the label so it doesn't fall back to the raw value), table cells, badges, filter chips, summary text. If a user sees `gst_on_income` rendered anywhere it is a bug.

## Form validation (red-outline EVERY error, no exceptions)
- **Every validation failure MUST red-outline the offending field**, not just toast. A toast alone is a bug: the user can't tell which box is wrong. The field gets `aria-invalid` (our `<Input>`/`<DatePicker>` style `aria-invalid:border-destructive`), or the `invalid` prop on `<NumberInput>`/`<BsbInput>`/`<MergeFieldEditor>`, or the `error` prop on `<PhoneInput>`/`<DatePicker>`. This applies EVERYWHERE: drawers, dialogs, wizards, inline editors, settings, the levy follow-up editor, the meeting wizard, etc.
- Pattern: hold a per-field invalid flag in state (`fooInvalid` or an `invalid: Record<string,boolean>` / an `invalidId` for list rows), default `false`. On submit, collect EVERY problem, set the matching invalid flag(s), then `toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.")`. NEVER short-circuit on the first failure.
- **Validation fires on submit, never on keystroke.** Clear a field's invalid flag in its `onChange`/`onValueChange`. Never derive the red state live from the value (that paints red while typing).
- Cross-field/order errors (e.g. "step 2 can't be before step 1") MUST red-outline the specific offending field (the later step's day input), not just toast.

## Button loading → navigation (no flash)
- When a button's success path NAVIGATES (`window.location.href`, `router.push`, `router.replace`, `onNext()` that advances a wizard, etc.), NEVER clear the loading state before the navigation fires. Clearing `setPending(false)` / `setLoading(false)` then navigating produces a visible "loading → idle → redirect" flicker the team hates.
- Pattern: `setPending(false)` ONLY in the error/early-return branches. On success, leave the spinner ON and let the navigation replace the page. The spinner stays until the destination paints.
- ```ts
  setPending(true);
  const res = await action();
  if (res.error) { setPending(false); toast.error(res.error); return; } // clear ONLY here
  window.location.href = "/next"; // spinner stays on through the nav
  ```
- Applies to: sign-in / sign-up / onboarding steps, wizard Continue/Create buttons, any drawer/dialog "Save & go" action.

## Git
- Commit locally as work completes, with a real message. That part doesn't need asking.
- **NEVER push to origin until the user explicitly says to.** Not after a green build, not after a "that's done", not because the change looks safe. Pushing is the user's call and theirs alone. Stack commits locally and tell them what's waiting to go up.
- When work is finished, end with a one-line note of how many commits are unpushed (e.g. "3 commits local, not pushed") so the user knows there's something to approve.

## Google Maps Places (address autocomplete)
- Use **Places API (New)** , `AutocompleteSuggestion.fetchAutocompleteSuggestions` and `Place.fetchFields`. Legacy `AutocompleteService` / `PlacesService` is deprecated and may not be enabled on new GCP projects.
- Enable BOTH `Maps JavaScript API` AND `Places API (New)` in GCP for the key in `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.

## Document OCR (full-text search infrastructure)
- EVERY user-uploaded document goes through OCR and the **full** extracted text is stored on the document row , not summaries, not just key fields. The search bar must be able to surface a document by matching text INSIDE it, not just by filename.
- Default OCR provider: **Google Document AI** OCR processor ($1.50 / 1000 pages, no training). Authenticates with the same service-account JSON as Gemini.
- Plan-of-Subdivision and OC Rules are the two exceptions: they ALSO go through Gemini for structured parsing (lot schedules, rule numbering). The raw OCR text from Document AI is STILL stored alongside Gemini's structured output so they're searchable.
- All other docs (insurance policies, meeting minutes, settlement statements, compliance certs, contractor invoices, etc.) get plain Document AI OCR , no Gemini, no structured extraction.
- Sanitise OCR output before insert: strip NUL bytes (`\0`), control characters except `\n\r\t`, anything that breaks Postgres TEXT or `to_tsvector`. Raw text only , no HTML, no markdown.
- `documents.ocr_text` (TEXT) + `documents.ocr_search` (`tsvector` GENERATED ALWAYS AS `to_tsvector('english', coalesce(ocr_text,'') || ' ' || coalesce(name,''))` STORED) + GIN index on `ocr_search`. Search ranks by `ts_rank_cd` and returns a `ts_headline` snippet.
- OCR happens async after R2 upload. `documents.ocr_status` enum: `none | pending | complete | failed`. Don't block uploads on OCR.

## Gemini / Vertex AI
- `GEMINI_API_KEY` env var accepts EITHER a bare AI Studio key (string starts with "AIza") OR a full service-account JSON (string starts with "{"). The parser auto-detects and switches to Vertex AI mode for JSON. Production prefers JSON.
- Service-account JSON path uses Vertex AI with `googleAuthOptions: { credentials }` , no temp-file dance. project_id is read from the JSON.
- Default region for Vertex AI is `global` , Gemini 2.5 Pro isn't in `australia-southeast1` (Sydney) and a regional pin there returns 404. The `global` endpoint routes to whichever region hosts the model. Vertex's no-training-on-inputs guarantee applies regardless of routing. This is hardcoded, there is no `GEMINI_LOCATION` env var.
- Vertex AI does not train on inputs. Paid AI Studio also does not. Free AI Studio DOES , never use a free key.

## Banking & Reconciliation
- Two bank-ingest paths only: **Macquarie DEFT TXN/PAY file parser** and **generic CSV upload** (Macquarie, CBA, NAB, Westpac, ANZ formats). NO Basiq, NO live bank-feed APIs, NO Direct Downloads. All deferred to post-revenue.
- **DRN = DEFT Reference Number** (not "Direct Reference Number"). Strata managers know it as DEFT. Always use the full expansion in user-facing copy.
- Macquarie assigns one DRN per payer per OC (≈ one per lot). NEVER generate DRNs ourselves , they're Macquarie's internal identifiers; making them up would not match the TXN file.
- DRN-to-lot mapping is **time-bounded** (`lot_drns` table with `active_from` / `active_to`). DRNs can be reassigned on owner changes; historical transactions stay linked to the DRN that was active when received. Lookups must use date-aware joins.
- DRN onboarding flow: manager exports the DRN CSV from Macquarie Business Online → wizard parses it → auto-matches to lots by Secondary ID (lot number) then Primary ID (payer name) → unmatched rows surface for manual resolution. Single-DRN-at-a-time entry is the fallback.
- Match cascade for incoming transactions: (1) DRN exact match → (2) BPAY CRN match against `levy_notices.bpay_crn` → (3) `reference_number` match → (4) `bank_payer_mappings` fuzzy → (5) unmatched queue. Confidence scoring on each.
- Reconciliation is **go-forward only**. No back-reconciliation of historical statements. Opening balances are set at OC creation and anchor everything.

## Levy/Overdue Trigger Policy
- Levies are **date-driven**, not bank-feed-driven. Issuance cron runs on the OC's billing cadence regardless of whether bank import is current.
- Overdues use a **draft + manager approval** workflow. Daily cron generates a draft `levy_overdue_batches` row for each OC with newly-overdue notices. Manager has 24h to either click Send or upload a fresh CSV that auto-cancels rows now reconciled. After 24h no-action, the batch auto-sends.

## Trust Account Models
- An OC's two funds (admin + capital_works) can live in **separate** physical trust accounts (default) or a **shared** account (`uses_shared_trust_account=true`). Both are compliant.
- Shared account: both `bank_accounts` rows reference the same BSB+account_number. Bank reports one balance; ledger keeps the two funds separate via `lot_ledger_entries.fund_type`. Attribution rule for incoming transactions: read the source `levy_notices.fund_type`; manual fund-pick at attribution time for non-levy receipts.
- BSB and account numbers are **NOT** column-encrypted. They appear on every levy notice as BPAY/EFT details anyway. Supabase's at-rest disk encryption is sufficient. TFN IS encrypted (different sensitivity profile).

## Object Storage
- **ALL** binary objects (PDFs, images, CSVs, logos, plans) go to **Cloudflare R2**. NEVER Supabase Storage. Use `src/lib/storage/r2.ts` (`uploadObject` / `fetchObject` / `deleteObject` / `keyFromPublicUrl`).
- Path-prefix convention inside the single bucket: `logos/{companyId}/...`, `documents/{ocId}/...`, `levies/{ocId}/...`, `plans/{draftId}/...`.

## Error Messages
- NEVER reveal internal infrastructure or env var names in user-facing errors. NOT "GEMINI_API_KEY is not configured", "R2_ENDPOINT missing", "DATABASE_URL invalid", "Supabase credentials missing", etc. Show a generic message like "This feature is temporarily unavailable" or "Something went wrong , please try again". Log the real reason server-side (`console.error`) for the operator to read in Vercel logs.
- This applies to toasts, error pages, form errors, and JSON error bodies returned from server actions.

## OC Tiers , what's built vs deferred
- The platform supports OC creation across ALL five tiers (1, 2, 3, 4, 5). Tier is auto-calculated from lot count + the services-only override.
- **Tier 4 / Tier 5** (3–9 lots / 2 lots or services-only) get full feature parity , the platform's MVP is designed for them.
- **Tier 1 / Tier 2 / Tier 3** (10+ lots) are NOT blocked at creation, but the tier-specific compliance features they legally require , audit obligations, 10-year maintenance plans, larger committee structures, formal AGM minute templates , are NOT built yet. They will be added once we ship for smaller OCs first.
- Don't add tier-restriction UI / server blocks. Just keep building tier-4/5 features without breaking tier-1/2/3 OCs that happen to exist.

## Company naming , brand vs legal entity

A management company has THREE name fields and they are not interchangeable.
The helper is [src/lib/company-name.ts](src/lib/company-name.ts); use it,
never hand-roll the string.

- **`name`** , the brand. "MyOCM". A nickname the firm picked, no legal
  standing. **This is what the PLATFORM shows**: sidebar, headers, tables,
  toasts, email sender names, anything a manager reads while working.
  `companyDisplayName()`.
- **`registered_name`** , the ASIC entity. "Perfect Design and Constructions
  Pty Ltd". **This is what a DOCUMENT names.**
- **`trading_as`** , the registered business name, when it differs from the
  entity.

`companyLegalName()` composes `"<registered_name> trading as <trading_as>"`,
and drops the "trading as" half when there is no trading name or when it just
repeats the entity. **"MyOCM trading as MyOCM" is the bug this exists to
prevent** , it happened because two places each tried to build the legal form
and their outputs got nested.

Same shape as [src/lib/oc-legal-name.ts](src/lib/oc-legal-name.ts): a
manager-facing nickname and a document-facing legal name, and the rule is
which surface you are on, not which field is populated.

## Domain Nomenclature
- An "Owners Corporation" (abbreviated "OC") is the legal entity that owns and manages common property , what's commonly called a "strata" in NSW or "body corporate" in QLD. Victoria uses "Owners Corporation" (Owners Corporations Act 2006).
- **User-facing display:** ALWAYS uppercase "OC" (or full "Owners Corporation"). NEVER lowercase "oc" in prose, button labels, error toasts, table headers, breadcrumbs, etc. Watch for things like "this oc", "Failed to create oc", "Create new oc" , these are bugs.
- **Code identifiers:** lowercase `oc` is correct (variables `ocId`, `ocCode`, types like `OC`, paths `/ocs/...`, column `oc_id`). The casing rule applies only to text the user sees.
- Always use "Owners Corporation" / "OC" in UI labels and prose. NEVER "subdivision", "strata", "body corporate" , these are legacy and incorrect for our jurisdiction.
- DB tables, routes, variables: use `oc` / `ocs` (e.g. table `owners_corporations`, column `oc_id`, route `/ocs/`, variable `ocCode`).
- Display singular: "Owners Corporation" / "OC". Plural: "Owners Corporations" / "OCs".

## UI Rules
- Do NOT add page titles (PageHeader) inside page content. The header breadcrumb already shows the page name.
- This is a company-focused platform, not user-focused. Show company name, not first/last name, in the UI.
- Use our own settings page at /settings for profile/password management, NOT Clerk's UserButton or UserProfile popups.

## Brand
- Brand name: "StrataWise" , always one word, no space. Abbreviated: "SW". Never "Strata Wise" (legacy two-word form), never "MSM" or "My Strata Management" (older legacy).
- Brand palette (light mode only):
  - Midnight (text):  #0E314C  , used for foreground, sidebar bg
  - Paper (cards):    #FFFFFF
  - Page bg:          #F4F5F7  , cool soft grey (was warm cream #FAF7F0; swapped 2026-05 to stop the page looking muddy under navy headers)
  - Border:           #E5E7EB  , cool stone (was warm #E5E0D3)
  - Gold (accent):    #CFA753  , sidebar-active + PDF accents
  - Primary action:   `--primary` = midnight #0E314C (gold is decorative-only)
  - Slate (muted):    #4A5868  , used for `--muted-foreground`
- Dark equivalents exist in design notes but dark mode is NOT enabled in the app.

## Stack
- Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Tremor, Clerk, Supabase, Vercel (syd1), Zod, react-hook-form, @react-pdf/renderer, Trigger.dev, Sonner, TanStack Table, Lucide React, Basiq (bank feeds).
- NO ORM. Supabase JS client only. RPCs for transactional logic.
- NO Framer Motion. Not installed, not wanted.
- NO dark mode. Light mode only.
- Font: Inter (Google Fonts). NOT the default Next.js Geist font.

## Snappy navigation
- **Every** route `page.tsx` that does any server-side work (DB queries, RPC calls, awaits , basically every page in this app) MUST have a sibling `loading.tsx`. Without it, Next.js blocks the route swap until server work finishes, and the user stares at the previous page for ~1s after clicking a link. With it, the skeleton renders instantly and the destination layout streams in.
- If the page doesn't have a bespoke skeleton, use `import { PageSkeleton } from "@/components/shared/page-skeleton"` and render `<PageSkeleton />`. This is the default. Bespoke skeletons exist for pages where structural mirroring matters (the dashboard, lots list).
- Don't use spinners as the loading state for a page. Use Skeletons that mirror the loaded layout , see `ALL loading states use Skeleton components for page/section loads, never spinners` below.
- **Pre-fetching**: `<Link>` already pre-fetches on hover by default in Next 15. Don't disable it on navigation links.
- For client-side mutations (form submits, button clicks): wrap state updates in `useTransition` so the UI stays responsive while a server action runs. The button stays clickable-looking with an inline `Loader2` (per the existing button-loading rule).

## Client data cache (useCachedData) , how every data page must fetch

- **All page data goes through `useCachedData` from [src/lib/use-cached-data.ts](src/lib/use-cached-data.ts).** A plain `Map` in module scope, keyed by a string you choose (`ocs`, `lots:${ocId}`, `levies:${ocId}:${batchId}`). Lifetime is the tab: no TTL, it dies on a hard reload, and nothing evicts it in between except a 100-entry cap. That is deliberate. It is a render-instantly cache, not a correctness cache; freshness comes from the revalidation, not an expiry.
- **Why not Next's Router Cache:** `router.refresh()` has no per-route granularity. It is the only way to re-fetch a server component route and it invalidates the cache for EVERY route, so refreshing `/lots` makes `/dashboard` cold. Measured on a production build: a revisit with no refresh in between costs 0 navigation fetches, the same revisit after a refresh costs 2. `useCachedData` is keyed per dataset, so refreshing `lots:${ocId}` touches nothing else.

### The rhythm (do not change these without a reason)
- **On arrival:** render whatever is cached immediately, and ALWAYS fetch behind it. What you are looking at is never knowingly stale.
- **Whether the BAR shows is a separate question from whether the fetch happens.** Cache younger than `AUTO_REFRESH_MS` fetches silently: had you stayed on the page the poll would not have fired yet either, so there is nothing to announce and a bar on every hop is just noise. Older than that gets the bar, because the data predates the freshness staying would have given you. Same constant on purpose, so the promise is "never more than one poll interval stale, whether you stayed or left and came back".
- **Every 30s:** silent re-fetch so an open tab does not drift. Paused while the tab is hidden, and fires immediately on becoming visible, so coming back lands on current data instead of waiting out the interval.
- **Overlapping runs are skipped.** A slow fetch cannot stack up.
- **A failed refresh keeps what is on screen.** Blanking a page because one poll timed out is worse than data that is thirty seconds old. `error` is advisory; `data` is left alone.

### loading vs isEntering , they are mutually exclusive, keep them that way
- `loading` means **no cached data at all**, first ever visit. It gets **skeletons**.
- `isEntering` means **showing old data while checking it**. It gets **the bar**, which the hook raises itself.
- A page that shimmers AND claims to be refreshing describes nothing. Never render a skeleton off `isEntering`, and never render the bar off `loading`.

### The page shape , server shell, client data
Server `page.tsx` resolves ids and redirects, and fetches NOTHING. Data fetching lives in a client component so a return visit paints from the tab cache instead of a server round trip.

```
lots/page.tsx        server shell: resolveOCFromCode + redirect, renders <LotsClient ocId pathname />
lots/data.ts         "use server" aggregate fetch, ONE round trip, auth check at the top
lots/lots-client.tsx "use client": useCachedData(`lots:${ocId}`, fetcher, { pathname })
                     loading -> <LotsLoading />, otherwise the real content
lots/loading.tsx     still required, covers the server shell itself
```

- **Auth moves into `data.ts`, not `page.tsx`.** Once the client drives every fetch after the first, a check left in the page component runs once and is skipped on every refresh after. Call `requireOCAccess(ocId)` / `requireCompanyRole()` at the top of the aggregate action. It throws, which the hook surfaces as `error` rather than blanking the page.
- **Pass `pathname`** so the hook registers the route and the router-based fallback in [refresh-bar.tsx](src/components/layout/refresh-bar.tsx) leaves it alone. Without it the page is refreshed twice AND the Router Cache is wiped for everything else.
- **One aggregate action per page, not one per widget.** The hook caches a single value per key.

### Mutations
- **`setData` writes through to the cache**, so an optimistic change survives navigating away and back. Use it instead of local `useState` for anything derived from server data.
- **Wrap every write in `mutate`.** It increments a pending counter that suppresses revalidation while the server is behind the screen. Without it a 30s poll overlapping a delete returns the pre-delete list and the rows visibly come back until the next poll removes them again.
- **`invalidateCached(prefix)`** after a mutation that affects more than the current page, e.g. `invalidateCached("lots:")` after creating a lot.
- **`clearCachedData()` on sign-out.** It is a tab-lifetime cache; the next user must not see the last one's data.

### Where it does NOT apply
- Auth and public pages: sign-in, sign-up, forgot / reset password, verify-email, onboarding, invite acceptance, legal. Nothing to cache and nothing to refresh. The allowlist lives in `APP_PREFIXES` in [refresh-bar.tsx](src/components/layout/refresh-bar.tsx) and is an allowlist on purpose, so a new auth route is never silently opted in.
- Multi-step wizards, creation forms and long-form editors (`/ocs/new`, `/ocs/[ocCode]/generate`, `*/create`, `/admin/blog/[id]`) own their state client-side; a refresh under them throws work away.

### Registering a route , the one step people forget
Converting a page is not finished until its route is in `CLIENT_CACHED_ROUTES` in [use-cached-data.ts](src/lib/use-cached-data.ts). That list is what stops the router-based fallback in [refresh-bar.tsx](src/components/layout/refresh-bar.tsx) from ALSO firing `router.refresh()` on arrival, which would refetch the page a second time and wipe the Router Cache for every other route. Leave it out and the page still works, just twice as expensively and with the bar outliving the data.

The list covers two kinds of route, both wanting the same treatment:
- pages served by this hook, which fetch for themselves
- pages with nothing to revalidate: static copy, pure redirects, and the forms above

As of the platform-wide conversion, 36 of the 37 `(dashboard)` routes are on it. When you add a route that is neither, that is the thing to justify.

### One aggregate fetch means ONE wave, not one function
A `data.ts` that awaits four things in sequence is still four round trips deep, it just has them in a tidier place. Before you finish one, check whether each `await` genuinely needs the previous result. Usually it does not: nearly everything keys off `ocId` or a row id that the shell already resolved. Lot detail ran five sequential waves for exactly this reason and none of them needed the one before it.

### Testing it
- **`next dev` has no client Router Cache and Turbopack remounts aggressively.** Judge cache behaviour against `npx next start` only.

## Owner data model , owners + lot_ownerships, and nothing else

`lot_owners` is **gone**. It was a denormalised 29-column table that inlined a
person's name / email / phone / address onto each lot link, so one person
owning two lots was stored twice and could drift apart, which it had: two rows
disagreed at the time it was dropped.

The model is two tables and a view:

- **`owners`** , the person or entity, scoped to a management company. Name,
  email, phone, postal address, ABN, DOB, `profile_id` (set when they accept a
  portal invite), and the postal-address verification fields. Editing here
  changes every lot that person owns, which is the point.
- **`lot_ownerships`** , one person's hold on one lot, time-bounded by
  `start_date` / `end_date`. Carries everything that is true of THAT
  ownership and not of the person: `occupancy_status`, `tenant_*`,
  `delivery_preference`, `payment_reference`, `invitation_id`,
  `source_settlement_id`.
- **`v_lot_current_owners`** , the two joined, filtered to `end_date IS NULL`.
  **Read this for "who owns this lot now".** Its `id` IS the ownership's id,
  and it derives `is_occupied_by_owner` from `occupancy_status` rather than
  storing a second copy that can disagree.

**One owner per lot.** A unique partial index on `lot_ownerships (lot_id)
WHERE end_date IS NULL` enforces it. Joint ownership is NOT modelled:
`share_fraction`, `is_primary_contact` and `is_financial` used to exist and
were removed, because `set_lot_owner` closes every other open ownership, so
a second owner evicted the first , the columns described something the code
could not produce, which is worse than not modelling it at all. If joint
ownership is ever wanted, it is a deliberate piece of work, not a flag.

**`oc_members` is manager membership, and nothing else.** A CHECK constraint
pins `role` to `strata_manager`. It used to carry `role='lot_owner'` rows
with a `lot_id`, written next to the ownership and outside the transaction
that changes hands , a second answer to "who owns this lot" that was free to
disagree with the first. **A lot owner's access to an OC IS their open
ownership** (`requireOCAccess` reads the view), and every "which lots do I
own" / "who owns this lot" query reads the view too.

Rules:
- **Reads go through `v_lot_current_owners`.** It is `security_invoker` and
  `anon` has no grant on it; every app read is a server action on the service
  role.
- **Writes go to the table that owns the field.** Identity (name, email,
  phone, address, owner_type) → `owners`. Anything about this lot → the
  `lot_ownerships` row.
- **Setting an owner goes through the RPC**, never hand-rolled inserts.
  `set_lot_owner(...)` for one lot, `set_lot_owners_bulk(jsonb)` for many (OC
  creation passes all lots in ONE call). They reuse an existing owner by
  `(management_company_id, lower(email))`, close any other open ownership with
  an `end_date`, and upsert the open one, in a single transaction.
- **Selling a lot is an `end_date`, never a delete.** History survives, and
  `communication_log.lot_owner_id_at_creation` keeps a previous owner's
  correspondence out of the new owner's view.
- **`set_lot_owner` returns `(owner_id, ownership_id, ended_ownership_id)`**
  so a caller can link a settlement without a second query, and so a failed
  transfer is a failed transfer: it closes the old ownership and opens the
  new one in ONE transaction, or does neither. Do not hand-roll the two
  halves , that is what left lots ownerless.
- **A settlement is dated TODAY.** Recorded once it has happened: a future
  date hands the lot over before it changes hands, a past one silently
  rewrites whose levies and correspondence belonged to whom over the
  intervening days. The picker offers only today and `applySettlementToLot`
  refuses anything else. Correcting a historical transfer is deliberately
  not self-service.
- Five tables carry an FK named `lot_owner_id` (or
  `lot_owner_id_at_creation`). They all reference **`lot_ownerships(id)`**.
  The name is historical; the column comments say so.

## Schema drift , database-schema.sql is a STALE snapshot, the live DB wins

`database-schema.sql` in the repo root is an old snapshot, not the current schema. Treat it as a reference for intent, never as the source of truth.

Known drift, found 2026-08-24:
- It declares `fund_type AS ENUM ('administrative', 'capital_works')`. The live enum is `('operating', 'capital_works', 'maintenance_plan')`, and the app uses `'operating'` in 84 places and `'administrative'` in none. Applying anything from that file verbatim will create objects that raise at runtime.
- It defines 6 tables that had **never been applied** to the live database: `payments`, `payment_plans`, `lot_ledger_entries`, `lot_ledger_state`, `reconciliation_matches`, `bank_payer_mappings`, plus `recompute_lot_ledger_state()` and the `v_levy_notice_status` view. 8 Postgres functions and 28 app call sites referenced them, so every ledger, payment and reconciliation call failed at runtime and lot balances were computed with the payments term always zero. Restored in the `restore_ledger_banking_cluster` migration.

It also still declares `lot_owners`, which was dropped: the per-ownership
columns moved onto `lot_ownerships` and identity lives on `owners`.

**Before using anything from that file, diff it against the live catalog.** Before adding a migration, check the live enum values rather than the file's.

## Database rules

- **The database is not the bottleneck, round trips are.** 88 tables, 11 MB total, largest table 212 rows. Every query measures ~52 to 59 ms against Supabase and that is almost entirely network. Making a query "faster" is pointless; making a page issue FEWER queries is everything.
- **Never issue a query inside a loop.** A per-row round trip at 55 ms is invisible with 3 lots and 16 seconds with 100. Batch the insert, or add a set-returning function. `next_reference_numbers(prefix, oc_id, count)` is the pattern: reserve the whole block in one statement instead of calling `next_reference_number` per row.
- **One aggregate fetch per page**, composed server-side, not N client-composed calls. See the `useCachedData` section.
- **Index every foreign key.** A DO block in the `index_unindexed_foreign_keys` migration does this generically and is re-runnable; run it after adding FKs.
- **RLS: always `(select auth.uid())`, never bare `auth.uid()`.** Bare, it is re-evaluated per row; wrapped, Postgres hoists it into an InitPlan and evaluates it once per statement.
- **One permissive policy per table per command.** Permissive policies are OR'd, so a second `true` policy silently negates a restrictive one. This had actually happened on `post_tags`.
- **Ignore the "unused index" advisor** while the database is this small. With almost no query traffic, "unused" means "not yet queried", not "useless". Dropping on that evidence would be wrong.

## Design system , read DESIGN-SYSTEM.md

[DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) is the full set of UI/UX rules with the
reasoning behind each. The headlines, all enforceable by reading a diff:

1. **Never build a control we already have.** No native `<select>`,
   `<textarea>`, `type="date|number|radio|checkbox">`, and no hand-rolled
   dropdowns , that is a `Popover`, `Select` or `Combobox`. Add from the
   shadcn registry before writing anything.
2. **Nothing the app already knows should shimmer.** Labels, headings, column
   names and buttons render for real in loading states; only server values
   shimmer. A page whose first screen is entirely fixed gets no skeleton at
   all. The `loading.tsx` renders the SAME component the client does.
3. **No helper copy.** Label, placeholder, submit-time error. A field that
   genuinely needs a sentence gets an `InfoTooltip`, never a paragraph.
4. **The user's answers must not move the page.** Either/or field groups go in
   `SwapSlot`; `<Button loading>` keeps its width; every popup positions
   `fixed` so it cannot change document height.
5. **Modal scrims are `bg-black/45`.** Controls in a row share `h-9`.
6. **Validation collects every problem and red-outlines each field**, on
   submit only, never on keystroke.
7. **Never an em dash. Never a raw enum. Missing values render as nothing.**
   Documents name the legal entity via `ocLegalName()`, never the nickname.

## UI Primitives (non-negotiable)
- **Never use native HTML controls** for anything we have a shadcn equivalent for. NO `<select>`, NO native dropdowns, NO browser date pickers (`<input type="date">`). Always use shadcn `Select`, shadcn `Calendar`/`DatePicker`, shadcn `Checkbox`, etc. Native controls don't match our palette and break on Safari + mobile.
- **EVERY date field uses the shadcn `<DatePicker>` from [src/components/shared/date-picker.tsx](src/components/shared/date-picker.tsx).** No exceptions. `<input type="date">` is never acceptable , not in dialogs, not in drawers, not in inline editors, not in filters, not in wizards. Browser date pickers render differently on every OS, ignore our palette, and behave inconsistently on Safari iOS (where the native control covers the whole viewport). If a date input ships without the shadcn DatePicker, it's a bug , replace it on sight, no questions.
- **Checkbox click target**: the checkbox itself has an expanded hit area (~26 × 22px via the `after:` pseudo) for misclick tolerance. The accompanying `<Label>` MUST NOT use `htmlFor` paired to a checkbox id , clicking the label text MUST NOT toggle the checkbox. Only the checkbox (with its expanded hit area) is clickable. This avoids accidental toggles when a user clicks descriptive copy next to a checkbox.
- **Numeric inputs , ALWAYS `<NumberInput>` from `@/components/ui/number-input`, NEVER `<input type="number">`** (even with `step` / `min`). The native number control ships browser-specific up/down spinner arrows we explicitly do not want, accepts `e`/`E`/`+` (scientific notation), and renders inconsistently across Chrome/Safari/Firefox. `NumberInput` is a plain text box with `inputMode="numeric|decimal"`, blocks those characters on keypress + paste, and stores the value as a string ("" = nothing typed, distinct from "0"). For integer fields pass `allowDecimal={false}`. Callers parse with `parseInt`/`parseFloat` at submit time. Apply EVERYWHERE: amounts, balances, premiums, sums insured, BSB/account numbers, lot numbers, OC numbers, entitlements, lot counts, postcodes , any field that should accept only digits. If you find a `type="number"` anywhere in the codebase, replace it.
- **Placeholders describe the field, not example values.** A placeholder labels what should go IN the box , never preview a value, because example values look like the field is already filled in. CORRECT: `placeholder="Account number"`, `placeholder="Sum insured"`, `placeholder="6-digit BSB"`, `placeholder="Plan-of-subdivision number"`, `placeholder="Insurer / underwriter name"`. WRONG: `placeholder="12345678"`, `placeholder="0.00"`, `placeholder="XXX-XXX"`, `placeholder="PS812345X"`, `placeholder="e.g. CHU, Strata Community Insurance, QBE"`, `placeholder="The Grandview Apartments"`. Format hints (e.g. "PS + 6 digits + 1 letter") belong in helper text BELOW the input, not in the placeholder.
- **Optional/mandatory marker is asymmetric.** Mandatory fields get a red `*` after the label (`<span className="text-destructive">*</span>`). Optional fields get NOTHING , no "(optional)" badge, no asterisk. The absence of the star IS the optional signal. Rationale: if every label has either a star or an "(optional)" badge the eye stops noticing either; one decisive marker on the must-fill fields keeps them visible.
- **Empty until Continue.** Inputs MUST allow the user to type past their content, including clearing the field completely. Never force a value like `parseInt(v, 10) || 1` on every keystroke , that locks the user out of deleting the leading character. Hold the field as a string ("" = empty) in state, validate only inside the Continue handler, parse to the final type there. Empty is a valid intermediate UI state. Only flag missing required fields when the user actually attempts to advance.
- **White inputs / dropdowns on grey page bg.** Form controls (`<Input>`, `<NumberInput>`, `<Select>` trigger, `<DatePicker>`) default to `bg-card` (white) with `border-border` (grey). Reads cleanly against either a card or the page grey, and matches users' mental model of "the field you fill in is the white box." Don't override to `bg-background`/`bg-muted` , that produces grey-on-grey ambiguity.
- **Calendar / date picker styling.** The opened calendar is the simple shadcn template: `<Calendar mode='single' ... className='rounded-lg border' />` , card-coloured body, foreground-coloured month label + chevrons (no navy strip), midnight (`bg-primary text-primary-foreground`) selected-day pill, white-bordered today pill. Don't reintroduce the navy top strip , it crowds the picker inside drawers / dialogs. The `<DatePicker>` wrapper portals this calendar to `document.body` with `position: fixed` so it escapes any `overflow-y-auto` ancestor (e.g. the settlement drawer).
- **Dollar / currency inputs use BOTH `prefix="$"` AND `thousandsSeparator` on `<NumberInput>`. No exceptions.** Every field that holds an AUD amount , sums insured, premiums, opening balances, levy amounts, payment claims, manual transactions, bank account balance, fund balances, special-levy line items, adjustments , MUST be a `<NumberInput value={...} onChange={...} thousandsSeparator prefix="$" placeholder="..." allowDecimal />`. Treat this the way phone fields use `+61` prefix: the `$` is rendered as a fixed prefix span inside the input, not as user-typed copy. The stored string never contains the `$` or commas; formatting is purely visual. The component handles backspace-over-comma so deleting a digit feels natural (comma is treated as not-a-character). Anything else (`<input type="number">`, hand-rolled `<input type="text">` with regex onChange, an AmountInput wrapper without the prefix) is a bug , rewrite it. Fields that aren't dollar amounts (BSB, account number, postcode, lot numbers, entitlements) do NOT get the flag , those are identifiers, not magnitudes.
- **Drawers close by clicking the overlay , no Cancel button, no X.** All `<Sheet>` drawers (per-card OC settings edit, auto-send setup, insurance add, lot drawers, etc.) MUST omit explicit Cancel buttons in the footer and MUST NOT show the in-content X close icon (`SheetContent` defaults to `showCloseButton={false}` , don't override). The drawer overlay is the dismiss affordance: clicking outside the panel closes it. Footer holds only forward actions (Save / Next / Confirm). Same rule applies if a footer needs both Back and forward (Back is fine, Cancel/X are not). Dialogs are an exception , destructive AlertDialog confirmations keep Cancel because there's no overlay click target in that flow.
- **No technical jargon in user-facing copy.** Internal identifiers and code (`parsePlanPdf`, `parsedRules`, `parse_status`, `Extracted`, OCR, Document AI, Gemini, Vertex) are fine in code and comments, but the strings the user actually reads MUST be in plain English. Say "read your document" instead of "parse", "fill in for you" instead of "extract" / "auto-fill", "look up" instead of "lookup", "we couldn't read this file" instead of "parser failed". Never name the model or the OCR provider in a label, button, toast, or help line , users don't care that it's Gemini under the hood, they care that the app reads their document. This applies to placeholders, button text, dialog descriptions, loading messages, error toasts, page subtitles, and tooltip bodies. When you reach for "parse" / "extract" / "OCR" / "AI prefill", swap to the everyday-English alternative and move on.

## Design Rules (non-negotiable)
- NO box shadows on cards. Use borders only. Depth comes from border contrast on grey background.
- NO rounded-full on buttons. rounded-md only. Rounded-full is ONLY for avatars and badges.
- NO page transition animations. Content loads instantly.
- ALL buttons are sentence case ("Create subdivision", never "CREATE SUBDIVISION").
- ALL forms use Zod + react-hook-form + shadcn Form. Never raw onChange handlers.
- ALL forms use labels above inputs, never floating labels.
- ALL loading states use Skeleton components for page/section loads, never spinners.
- ALL button loading states use an inline spinning circle (Loader2 from lucide). The button TEXT must stay the same , never replace with "Saving..." or "Loading..." (which causes layout shift). Disable the button while pending so it's not double-clickable.
- ALL buttons show the clicking-hand cursor (`cursor: pointer`) on hover. globals.css applies this site-wide via `button:not(:disabled)` and `[role="button"]`, so you don't need `cursor-pointer` on every Button , but if you build a custom non-button clickable (e.g. a `<div onClick>` or a Radix trigger), add `cursor-pointer` explicitly.
- **Every toggle control shows the clicking-hand cursor too**: `<Switch>`, `<Checkbox>`, `<RadioGroupItem>`. globals.css names `[role="switch"]`, `[role="checkbox"]` and `[role="radio"]` alongside `button` for exactly this reason , Base UI gives these a role rather than a `<button>` tag, so the button rule misses them and the caret stays an arrow over the one control on the page whose entire purpose is being clicked. Disabled ones keep the default arrow. If you build a new toggle-shaped primitive, add `cursor-pointer` to its root.
- ALL toasts use Sonner, positioned **top-right**. Errors don't auto-dismiss.
- **Status colours are TOKENS, never Tailwind ramps.** `--success`, `--warning`, `--info`, `--destructive`, each with a `-foreground` for text and a `-muted` tint for badge backgrounds. Writing `text-emerald-600` / `bg-blue-50` / `text-amber-700` is a bug: it spread to forty call sites and gave "paid" two different greens. See DESIGN-SYSTEM.md section 10 for the full hierarchy.
- ALL form validation checks EVERY field, never short-circuits on the first failure. Collect every invalid field, set `aria-invalid` on each (Input already styles `aria-invalid:border-destructive`), then toast a summary. Pattern: a `problems: string[]` array , push every issue, set the matching `*Invalid` flag, then `if (problems.length) toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.")` before returning. NEVER write `if (!x) { toast(...); return; } if (!y) ...` , the user only sees one error at a time, fixes it, hits submit, sees the next, and gets frustrated.
- **Validation fires on submit, NEVER on keystroke.** Inputs MUST NOT turn red while the user is still typing. NEVER compute `aria-invalid` / `invalid` from a live-derived value like `!isValidEmail(value)` , that re-evaluates on every render and paints the field red the instant the first character is typed. Use a piece of state per field (`emailInvalid`, `planInvalid`, etc.) that defaults to `false`, is SET to `true` only inside the submit handler when the field is wrong, and is CLEARED back to `false` on the input's `onChange`. Apply this to `aria-invalid={fieldInvalid || undefined}`, the `invalid` prop on `NumberInput`, and the `error` prop on `PhoneInput`. The only acceptable pre-submit feedback is a non-red hint (counter, helper text); colour-coded errors must wait for an explicit submit attempt.
- ALL pages use the PageHeader shared component for title/back link/actions.
- **H1 vs breadcrumb (no duplicates).** The header breadcrumb already names the page on every route. Flat list pages (Lots, Owners, Levies, Documents, Meetings, Bank account, Insurance, Settings, etc.) MUST NOT render an H1 that just repeats the page title , drop it and use the reclaimed vertical space for filters, sort, primary CTA, or a count. Keep an H1 only on detail / entity pages where it carries entity-specific context the breadcrumb can't (OC name on `/ocs/[ocCode]`, lot number + owner on `/ocs/[ocCode]/lots/[lotId]`, batch period on `/ocs/[ocCode]/levies/[batchId]`). If a list page feels sparse without an H1, that signals it's under-built , add count, filters, or a CTA, do not bring the H1 back.
- ALL tabs persist state in URL via ?tab= searchParam.
- ALL outbound communications logged to communication_log table.
- ALL data mutations logged to audit_log with before/after JSON state.
- ALL generated documents follow naming: SW-{TYPE}-{YYYY}-{NNNNNN}.pdf
- ALL date pickers use shadcn Calendar + Popover (never native HTML date inputs).
- **No horizontal scrollbars, anywhere.** Page-level horizontal scroll is forbidden , it signals the layout is wrong, not that the content needs more room. If a row of items doesn't fit (step indicators, filter chips, breadcrumb segments), wrap it (`flex-wrap`) or truncate it (`truncate` + `min-w-0`), never let the parent overflow. Tables that genuinely need horizontal scroll (wide data tables) must be wrapped in their OWN scroll container with `overflow-x-auto` , that container scrolls, the page doesn't. Same rule applies to dropdowns / popovers / dialogs.
- **Cancel / Back / "secondary action" buttons use `variant="secondary"`, NOT `variant="ghost"`.** The secondary variant has `bg-card` (white) + `border-border`, so the button reads as a button against both the grey page bg AND a white dialog/popover bg. Ghost buttons (transparent, no border) disappear into white dialog surfaces , managers see them as text and miss them. Applies to: dialog Cancel buttons, wizard Back buttons, "Keep going" / "Finish for now" / "Cancel , wrong cert" / "Discard" buttons, dropdown menu Cancel, sheet Cancel. Ghost stays valid for icon-only buttons (close icons, chevrons, row actions).

## Colour Palette
```
--primary: hsl(208, 70%, 18%)         /* midnight #0E314C , main button colour */
--primary-hover: hsl(208, 70%, 26%)
--primary-foreground: hsl(0, 0%, 100%)
--brand-gold: hsl(40, 57%, 57%)       /* #CFA753 , sidebar-active + PDF accents */
--secondary: hsl(42, 32%, 86%)        /* stone #E5E0D3 */
--secondary-hover: hsl(42, 32%, 78%)
--destructive: hsl(0, 72%, 51%)       /* red */
--warning: hsl(38, 92%, 50%)          /* amber */
--background: hsl(40, 47%, 96%)       /* cream #FAF7F0 */
--card: hsl(0, 0%, 100%)              /* paper white */
--foreground: hsl(208, 70%, 18%)      /* midnight #0E314C */
--muted-foreground: hsl(211, 17%, 35%) /* slate #4A5868 */
--sidebar: hsl(208, 70%, 18%)         /* midnight */
--sidebar-active: hsl(40, 57%, 57%)   /* gold */
--border: hsl(42, 32%, 86%)           /* stone */
--muted: hsl(40, 25%, 92%)
```

## Component Patterns
- Buttons: bg-primary text-white rounded-md h-9 px-4 text-sm font-medium. Hover: bg-primary/90.
- Cards: bg-card rounded-lg border border-border shadow-none.
- **Always use the `<Table>` primitive from [src/components/ui/table.tsx](src/components/ui/table.tsx).** Two named variants , pick ONE on the `<Table>` root, never row-by-row:
  - `<Table variant="striped">` , data-dense ops tables (Lots, Levies, Reconciliation, Banking). Odd rows `bg-card`, even rows `bg-muted`, hover `bg-secondary-hover`. No per-row borders; the only horizontal line is the header underline.
  - `<Table variant="bordered">` , sparse / configuration tables (Settings, OC overview key-value pairs). All rows `bg-card`, `border-b border-border` between rows, hover `bg-muted`. Reads as a key:value list, not a data grid.
- Stripe colour is `bg-muted` directly , no arbitrary `bg-[hsl(...)]` values. The `--muted` token is `hsl(220, 14%, 88%)`, deliberately tuned so it actually separates from `--background` (`hsl(220, 14%, 96%)`).
- **Table headers stay in normal case** , `<TableHead>` renders `text-sm font-medium text-muted-foreground`, never UPPERCASE / `tracking-wider`. ALL CAPS forces the eye to slow down and re-decode every word; we read these labels dozens of times a session.
- **Empty table cells stay empty.** No `,`, no `N/A`, no "Not set", no `null`. If a row's value is missing, render nothing for that cell. The visual silence is the indicator. Exception: meaningful status strings ("Unassigned", "Pending invitation") are real data , keep them.
- **Use `bg-cool-muted` for system / disabled / technical surfaces** , reference numbers (`SW-LEV-2026-…`), code blocks, disabled inputs, read-only fields, anything that should read as "data the system owns" rather than "soft surface". Hue is intentionally bluer than `--muted` (210 vs 220) so it tonally separates from stripe / hover / banner contexts that use `--muted`. Foreground pairs with `text-cool-muted-foreground`.
- Badges: rounded-full px-2.5 py-0.5 text-xs font-medium. Paid=green, Overdue=red, Info=blue, Neutral=grey.
- Sidebar: fixed left w-64, bg-sidebar, active items have border-l-2 border-primary text-primary.
- Dialogs: fade-in only (150ms), no slide/bounce. Max-width sm/md/lg.
- **Empty states: always render via `<EmptyState>` from [src/components/shared/empty-state.tsx](src/components/shared/empty-state.tsx).** The component is the single source of truth for the visual contract: an **illustration** from [empty-illustration.tsx](src/components/shared/empty-illustration.tsx) (`illustration="documents" | "people" | "money" | "calendar" | "building" | "inbox" | "search" | "checklist"`), `text-base font-semibold` title, `text-sm text-muted-foreground` description, optional CTA. NOT an icon , a 48px icon says "here is a category", an illustration says "there is nothing here yet, and that is normal", which is the difference between a page that looks broken and one that looks new. New illustrations follow the palette contract in that file: `--muted` ground, `--border` line work, exactly ONE `--brand-gold` element, never `--primary`. Drop it as a card with `<EmptyState ... />` or inline with `card={false}`. Don't inline a custom `flex flex-col items-center` block , every divergence reads as a different page. If a section has nothing to show, an `<EmptyState>` MUST be the block that fills the space.

## Loading States (Skeleton/Shimmer)
- NEVER use spinners. Always skeleton loaders that mirror the layout being loaded.
- Use shadcn Skeleton component with shimmer animation (animate-pulse).
- Every page must have a loading.tsx that matches its loaded layout EXACTLY , same grid, same card structure, same spacing.
- Keep as much static info visible as possible , only shimmer dynamic values:
  - **KPI cards:** Keep the label text (e.g. "Total lots"), keep the icon. Only shimmer the value number and description.
  - **Section headers:** Keep the heading text visible (e.g. "Subdivisions"). Shimmer the action button.
  - **Card lists:** Match the exact card structure (title line, subtitle, address row, border-t footer). Shimmer text, keep structural elements like borders and "Lots" label.
  - **Forms:** Keep field labels visible. Shimmer the input areas.
  - **Tables:** Keep the header row with column names. Shimmer the body rows.
- The skeleton must be structurally identical to the loaded page. A user should see the skeleton transform into the real page with zero layout shift.
- Show skeleton immediately on navigation (via Next.js loading.tsx). No flash of empty content.
- For tabs within a single page: render ALL tabs at once, hide inactive via CSS (`hidden` class). Use `window.history.replaceState` to sync URL without server round-trip. This makes tab switching truly instant.

## Typography
- Page title: 24px/600/tracking-tight. Section: 18px/600. Card title: 14px/600/uppercase/tracking-wide.
- Body: 14px/400. Small: 12px/400/muted. Label: 12px/500/uppercase/tracking-wide/muted.
- KPI number: 28px/700/tabular-nums.

## Spacing
- Page padding: px-6 py-6 desktop, px-4 py-4 mobile.
- Card padding: p-5. Card gap: gap-4. Section gap: space-y-6. Form field gap: space-y-4.

## Roles
- Three platform roles: super_admin, strata_manager, lot_owner.
- super_admin: StrataWise platform team. Full access to everything.
- strata_manager: Management company staff. Full CRUD on assigned subdivisions.
- lot_owner: Invited portal user. View own lot, pay levies, vote, chat, submit requests.
- Every server action checks role + management_company_id match before mutations. UI hides elements, server enforces.

## Validation
- Zod schemas in src/lib/validations/. Same schema validates client AND server.
- Three enforcement layers: UI (cosmetic) → server action (functional) → Supabase RLS (database).

## Reference Numbers
- Financial-facing references (LEV, RCP, PAY): per-OC sequence via subdivisions.next_{levy|receipt|payment}_number integer column. Format `{PREFIX}-{n}` where n is the OC's own counter. Two OCs can each have LEV-1; matching is always subdivision-scoped so no ambiguity.
- Operational references (MTG, MIN, SLEV, INV, POL, CLM, MNT, CMP, ESC): global Postgres SEQUENCE. Format `SW-{PREFIX}-{YYYY}-{NNNNNN}`.
- Function signature: `next_reference_number(prefix TEXT, subdivision_id UUID DEFAULT NULL)`. Financial prefixes require subdivision_id; operational prefixes ignore it.

## Background Jobs
- Trigger.dev for: levy distribution, overdue checks, meeting notice distribution, minutes distribution, interest calculation, escalation processing, Basiq transaction polling (fallback).
- Basiq webhook for real-time bank transaction feeds (primary).

## Key Rules
- Dual-fund accounting: Administrative Fund + Capital Works Fund on all budgets/levies/payments.
- Platform fee is mandatory in every admin fund budget. Cannot be removed by users.
- Penalty interest configurable per subdivision (0-2.5%/month VIC cap).
- Notice period blocking: meeting dates grey out within 14 days, levy due dates within 28 days.
- Stripe Connect optional. Default is BPAY/EFT display only. Card payments are an upgrade.
- StrataWise never holds OC funds. Stripe Connect sends payments directly to OC's bank.
- Profile pictures stored in R2 (or Supabase Storage for MVP).

## File Structure
```
src/app/(auth)/          , sign-in, sign-up, onboarding
src/app/(dashboard)/     , all authenticated pages
src/app/api/             , API routes, webhooks
src/app/legal/           , terms, privacy (public)
src/lib/                 , supabase client, auth helpers, utils
src/lib/validations/     , Zod schemas
src/lib/pdf/templates/   , React-PDF templates
src/types/               , TypeScript types
src/components/layout/   , sidebar, header, breadcrumbs
src/components/ui/       , shadcn components
src/components/shared/   , page-header, badges, KPI cards, empty states
trigger/                 , Trigger.dev job definitions (top-level, not under src/)
```

## When In Doubt
- Read project-context.md for full architectural decisions, edge cases, business rules, email flows, and reference material.
- Read project-roadmap.md for the specific step you're working on.
- Edge cases, smart blocking rules, lot owner visibility, and email flows are all in project-context.md.
