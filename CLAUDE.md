# Strata Wise (SW) — Claude Code Rules

## Git
- Always commit and push to origin after completing changes. Do not wait for the user to ask.

## UI Rules
- Do NOT add page titles (PageHeader) inside page content. The header breadcrumb already shows the page name.
- This is a company-focused platform, not user-focused. Show company name, not first/last name, in the UI.
- Use our own settings page at /settings for profile/password management, NOT Clerk's UserButton or UserProfile popups.

## Brand
- Full name: "Strata Wise" (two words for display). One-word identifier: "StrataWise". Abbreviated: "SW". Never "MSM" or "My Strata Management" (legacy).
- Brand palette (light mode only):
  - Midnight (text):  #0E314C  — used for foreground, sidebar bg
  - Paper (cards):    #FFFFFF
  - Page bg (cream):  #FAF7F0
  - Stone (border):   #E5E0D3
  - Gold (accent):    #CFA753  — used as `--primary` (primary action colour)
  - Slate (muted):    #4A5868  — used for `--muted-foreground`
- Dark equivalents exist in design notes but dark mode is NOT enabled in the app.

## Stack
- Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Tremor, Clerk, Supabase, Vercel (syd1), Zod, react-hook-form, @react-pdf/renderer, Trigger.dev, Sonner, TanStack Table, Lucide React, Basiq (bank feeds).
- NO ORM. Supabase JS client only. RPCs for transactional logic.
- NO Framer Motion. Not installed, not wanted.
- NO dark mode. Light mode only.
- Font: Inter (Google Fonts). NOT the default Next.js Geist font.

## Design Rules (non-negotiable)
- NO box shadows on cards. Use borders only. Depth comes from border contrast on grey background.
- NO rounded-full on buttons. rounded-md only. Rounded-full is ONLY for avatars and badges.
- NO page transition animations. Content loads instantly.
- ALL buttons are sentence case ("Create subdivision", never "CREATE SUBDIVISION").
- ALL forms use Zod + react-hook-form + shadcn Form. Never raw onChange handlers.
- ALL forms use labels above inputs, never floating labels.
- ALL loading states use Skeleton components for page/section loads, never spinners.
- ALL button loading states use an inline spinning circle (Loader2 from lucide). The button TEXT must stay the same — never replace with "Saving..." or "Loading..." (which causes layout shift). Disable the button while pending so it's not double-clickable.
- ALL buttons show the clicking-hand cursor (`cursor: pointer`) on hover. globals.css applies this site-wide via `button:not(:disabled)` and `[role="button"]`, so you don't need `cursor-pointer` on every Button — but if you build a custom non-button clickable (e.g. a `<div onClick>` or a Radix trigger), add `cursor-pointer` explicitly.
- ALL toasts use Sonner, positioned **top-right**. Errors don't auto-dismiss.
- ALL pages use the PageHeader shared component for title/back link/actions.
- ALL tabs persist state in URL via ?tab= searchParam.
- ALL outbound communications logged to communication_log table.
- ALL data mutations logged to audit_log with before/after JSON state.
- ALL generated documents follow naming: SW-{TYPE}-{YYYY}-{NNNNNN}.pdf
- ALL date pickers use shadcn Calendar + Popover (never native HTML date inputs).

## Colour Palette
```
--primary: hsl(40, 57%, 57%)          /* gold #CFA753 (accent) */
--primary-hover: hsl(40, 57%, 47%)
--primary-foreground: hsl(208, 70%, 18%)  /* midnight on gold */
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
- Tables: header bg-muted/50, rows h-12, hover bg-muted/30, no zebra stripes, sticky header.
- Badges: rounded-full px-2.5 py-0.5 text-xs font-medium. Paid=green, Overdue=red, Info=blue, Neutral=grey.
- Sidebar: fixed left w-64, bg-sidebar, active items have border-l-2 border-primary text-primary.
- Dialogs: fade-in only (150ms), no slide/bounce. Max-width sm/md/lg.
- Empty states: centered icon (48px muted) + title + description + CTA button.

## Loading States (Skeleton/Shimmer)
- NEVER use spinners. Always skeleton loaders that mirror the layout being loaded.
- Use shadcn Skeleton component with shimmer animation (animate-pulse).
- Every page must have a loading.tsx that matches its loaded layout EXACTLY — same grid, same card structure, same spacing.
- Keep as much static info visible as possible — only shimmer dynamic values:
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
- super_admin: Strata Wise platform team. Full access to everything.
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
- Strata Wise never holds OC funds. Stripe Connect sends payments directly to OC's bank.
- Profile pictures stored in R2 (or Supabase Storage for MVP).

## File Structure
```
src/app/(auth)/          — sign-in, sign-up, onboarding
src/app/(dashboard)/     — all authenticated pages
src/app/api/             — API routes, webhooks
src/app/legal/           — terms, privacy (public)
src/lib/                 — supabase client, auth helpers, utils
src/lib/validations/     — Zod schemas
src/lib/pdf/templates/   — React-PDF templates
src/types/               — TypeScript types
src/components/layout/   — sidebar, header, breadcrumbs
src/components/ui/       — shadcn components
src/components/shared/   — page-header, badges, KPI cards, empty states
trigger/                 — Trigger.dev job definitions (top-level, not under src/)
```

## When In Doubt
- Read project-context.md for full architectural decisions, edge cases, business rules, email flows, and reference material.
- Read project-roadmap.md for the specific step you're working on.
- Edge cases, smart blocking rules, lot owner visibility, and email flows are all in project-context.md.
