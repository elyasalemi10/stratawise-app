# My Strata Management (MSM) — Claude Code Rules

## Brand
- Full name: "My Strata Management". Abbreviated: "MSM". Never "StrataOS".
- Brand colours: Primary blue #2b7fff, Secondary green #00bd7d.

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
- ALL loading states use Skeleton components, never spinners.
- ALL toasts use Sonner, positioned bottom-right. Errors don't auto-dismiss.
- ALL pages use the PageHeader shared component for title/back link/actions.
- ALL tabs persist state in URL via ?tab= searchParam.
- ALL outbound communications logged to communication_log table.
- ALL data mutations logged to audit_log with before/after JSON state.
- ALL generated documents follow naming: MSM-{TYPE}-{YYYY}-{NNNNNN}.pdf

## Colour Palette
```
--primary: hsl(216, 100%, 58%)        /* #2b7fff blue */
--primary-hover: hsl(216, 100%, 48%)
--primary-foreground: hsl(0, 0%, 100%)
--secondary: hsl(160, 100%, 37%)      /* #00bd7d green */
--secondary-hover: hsl(160, 100%, 30%)
--destructive: hsl(0, 72%, 51%)       /* red */
--warning: hsl(38, 92%, 50%)          /* amber */
--background: hsl(220, 14%, 96%)      /* #f0f2f5 */
--card: hsl(0, 0%, 100%)             /* white */
--foreground: hsl(220, 26%, 14%)      /* #1a1f2e */
--muted-foreground: hsl(220, 9%, 46%)
--sidebar: hsl(220, 26%, 14%)         /* #1a1f2e */
--sidebar-active: hsl(216, 100%, 58%) /* primary blue */
--border: hsl(220, 13%, 91%)          /* #e2e5ea */
--muted: hsl(220, 14%, 96%)
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
- Use shadcn Skeleton component with shimmer animation (animate-pulse OR custom shimmer gradient).
- Every page/tab must have a loading skeleton that matches its loaded layout exactly.
- Skeleton patterns by component:
  - **Page:** PageHeader skeleton (wide bar + thin bar) + content skeletons below.
  - **KPI cards:** grid of skeleton cards matching KPI grid (rounded-lg h-24 with 2 skeleton bars inside).
  - **Table:** skeleton header row + 5-8 skeleton body rows with columns matching real table widths.
  - **Card list:** grid of skeleton cards matching card grid layout.
  - **Form:** skeleton labels + skeleton input bars in same layout as real form.
  - **Chat:** 4-6 skeleton message bubbles alternating left/right.
  - **Detail sheet:** skeleton bars matching the sheet's label:value layout.
- Shimmer direction: left-to-right gradient sweep (bg-gradient-to-r from-muted via-muted/60 to-muted).
- Skeleton colour: bg-muted (same as page background) with shimmer highlight at muted/60.
- Duration: shimmer cycle 1.5s, ease-in-out, infinite.
- Show skeleton immediately on navigation. Replace with real content when data loads. No flash of empty content.
- Use React Suspense boundaries with skeleton fallbacks where possible.
- For tabs: each tab has its own skeleton. Switching tabs shows the target tab's skeleton while loading.

## Typography
- Page title: 24px/600/tracking-tight. Section: 18px/600. Card title: 14px/600/uppercase/tracking-wide.
- Body: 14px/400. Small: 12px/400/muted. Label: 12px/500/uppercase/tracking-wide/muted.
- KPI number: 28px/700/tabular-nums.

## Spacing
- Page padding: px-6 py-6 desktop, px-4 py-4 mobile.
- Card padding: p-5. Card gap: gap-4. Section gap: space-y-6. Form field gap: space-y-4.

## Roles
- Three platform roles: super_admin, strata_manager, lot_owner.
- super_admin: MSM platform team. Full access to everything.
- strata_manager: Management company staff. Full CRUD on assigned subdivisions.
- lot_owner: Invited portal user. View own lot, pay levies, vote, chat, submit requests.
- Every server action checks role + management_company_id match before mutations. UI hides elements, server enforces.

## Validation
- Zod schemas in src/lib/validations/. Same schema validates client AND server.
- Three enforcement layers: UI (cosmetic) → server action (functional) → Supabase RLS (database).

## Reference Numbers
- Global Postgres SEQUENCE per type. Never per-subdivision. Two levies from different subdivisions never share a reference.
- Format: MSM-LEV-{YYYY}-{NNNNNN}, MSM-MTG-{YYYY}-{NNNNNN}, etc.

## Background Jobs
- Trigger.dev for: levy distribution, overdue checks, meeting notice distribution, minutes distribution, interest calculation, escalation processing, Basiq transaction polling (fallback).
- Basiq webhook for real-time bank transaction feeds (primary).

## Key Rules
- Dual-fund accounting: Administrative Fund + Capital Works Fund on all budgets/levies/payments.
- Platform fee is mandatory in every admin fund budget. Cannot be removed by users.
- Penalty interest configurable per subdivision (0-2.5%/month VIC cap).
- Notice period blocking: meeting dates grey out within 14 days, levy due dates within 28 days.
- Stripe Connect optional. Default is BPAY/EFT display only. Card payments are an upgrade.
- MSM never holds OC funds. Stripe Connect sends payments directly to OC's bank.
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
src/trigger/             — Trigger.dev job definitions
```

## When In Doubt
- Read project-context.md for full architectural decisions, edge cases, business rules, email flows, and reference material.
- Read project-roadmap.md for the specific step you're working on.
- Edge cases, smart blocking rules, lot owner visibility, and email flows are all in project-context.md.
