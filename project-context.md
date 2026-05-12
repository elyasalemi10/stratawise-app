# STRATA WISE (SW) — COMPLETE PROJECT CONTEXT

> **Purpose of this file:** Give this entire file to a new Claude session (Claude.ai or Claude Code) so it has full context of every decision made, every piece of research done, and every spec created for this project. Nothing is lost between sessions.
>
> **Brand:** "StrataWise" (full name) / "StrataWise" (abbreviated). Never "StrataOS".

---

## WHO IS BUILDING THIS

Elyas — Melbourne-based property developer running an integrated Australian property development and building materials ecosystem. Companies include GhanProject/GHAN Projects (feasibility strategy), PDCON (construction management), Builders Warehouse Australia (building materials retail), and The Final Asset (market presentation). He builds with Claude Code on Opus as his primary development tool — no traditional dev team. His preferred stack across projects is Next.js + Supabase + Tailwind + shadcn/ui.

---

## WHAT WE'RE BUILDING

**StrataWise (SW)** — a SaaS platform for professional strata management companies to manage multiple subdivisions. Strata managers sign up with their company, assign themselves to subdivisions, and use StrataWise to automate tedious tasks: levy generation, escalation workflows, meeting notices, bank reconciliation, compliance tracking. Lot owners get invited to a limited portal where they can view their levies, pay, chat with their manager, submit maintenance requests, and vote at meetings. This is professional management software, not self-management software.

**Target users (in priority order):**
- Strata management companies (PRIMARY — they pay the subscription)
- Strata managers/staff at those companies (SECONDARY users — they manage subdivisions)
- Lot owners (TERTIARY — invited portal access for payments, communications, voting)

**Market context:** ~230,000 strata schemes in Australia. Professional strata managers use legacy .NET desktop apps (Strata Master, StrataMax) that are expensive, clunky, and don't automate well. Modern strata management companies want cloud-based SaaS to manage multiple subdivisions more efficiently. This is an underserved market — software for professionals, not self-managing lot owners.

---

## CONFIRMED TECH STACK

| Layer | Choice | Reason |
|-------|--------|--------|
| **Framework** | Next.js 15 (App Router) | Dominant ecosystem, SSR + client flexibility, Vercel deployment |
| **Language** | TypeScript | Type safety, Claude Code generates better TS |
| **Styling** | Tailwind CSS | Utility-first, full control |
| **UI Components** | shadcn/ui (forms, nav, dialogs) + Tremor (dashboards, charts, KPIs) | shadcn for interactive components, Tremor for data visualisation. Both built on Radix + Tailwind. Vercel acquired Tremor. |
| **Auth** | Clerk (managed, 50K free tier) | Multi-org support, pre-built components, generous free tier. Decision was between Clerk and Better Auth (open-source, $0 forever). Chose Clerk for speed and managed convenience. Can migrate to Better Auth later if costs become an issue at 50K+ users. |
| **Database** | Supabase (PostgreSQL) | Managed Postgres, RLS, Storage, Realtime, $25/mo Pro plan |
| **ORM** | None — Supabase JS client only | Elyas explicitly doesn't want an ORM. Using @supabase/supabase-js for all queries. Trade-off: no client-side transactions (use RPCs for transactional logic). |
| **Form validation** | Zod + react-hook-form + @hookform/resolvers | Type-safe validation shared between client forms and server actions. Integrates with shadcn Form component. |
| **File Storage** | Cloudflare R2 (documents) + Supabase Storage (small files initially) | R2 has zero egress fees. At 1TB + 5TB bandwidth, R2 saves ~$450/mo vs Supabase Storage. Hybrid architecture: files in R2, metadata in Supabase. Will start with Supabase Storage for MVP simplicity and migrate to R2 when document volume grows. |
| **Toasts** | Sonner | Better DX than shadcn toast, bottom-right positioning |
| **Data Tables** | TanStack Table + shadcn DataTable | Sorting, filtering, pagination |
| **Charts** | Tremor chart components (built on Recharts) | KPI cards, bar/line/area charts, sparklines |
| **Icons** | Lucide React | Already bundled with shadcn |
| **PDF Generation** | @react-pdf/renderer | Lightweight, runs in serverless, $0 cost. Used for levy notices, meeting minutes, OC certificates, VCAT documents. |
| **Email** | Resend (later phase) | React Email templates, generous free tier |
| **Hosting** | Vercel (syd1 region) | Australian hosting, Next.js optimised |
| **Payments** | Stripe (separate, NOT through Clerk) | Clerk's billing add-on takes 0.7% — too expensive for levy collection. Need BPAY integration via DEFT/Macquarie anyway. |
| **Background Jobs** | Supabase pg_cron (simple scheduled) + Trigger.dev (complex workflows, future) | pg_cron for nightly penalty interest. Trigger.dev for multi-step escalation workflows (email → wait → SMS → wait → voice call). |

### What we explicitly DON'T use:
- **No Framer Motion** — not installed, not wanted. Corporate software doesn't bounce.
- **No Prisma/Drizzle** — Supabase JS client only.
- **No dark mode** — skip for MVP, focus on light mode quality.
- **No page transition animations** — content loads instantly.

---

## COST PROJECTIONS AT SCALE

| | 10 users | 100 users | 1,000 users | 10,000 users | 100,000 users |
|---|---|---|---|---|---|
| Vercel Pro | $20 | $20 | $20 | $20-30 | $500-800 |
| Supabase | $0 | $0 | $25 | $25-35 | $50-150 |
| Clerk (Hobby→Pro) | $0 | $0 | $0 | $0 | $25 + $1,000 overage |
| R2 Storage | $0 | $0 | $0.08 | $0.75 | $7.50 |
| **Total** | **$20** | **$20** | **$45** | **$46-65** | **$1,583-1,983** |

**Key inflection:** At 50K+ users, Clerk's free tier runs out ($0.02/MRU overage). If costs become an issue, migrate to Better Auth (open-source, $0 forever, MIT license, 26K GitHub stars, YC-backed, has organization plugin with multi-tenant RBAC).

---

## AUSTRALIAN STRATA COMPLIANCE (VICTORIA)

### Key legislation:
- **Owners Corporations Act 2006 (Vic)**
- **Owners Corporations Regulations 2018 (Vic)**
- Model Rules: Schedule 2, OC Regulations 2018

### OC Tier system (Victoria):
- **Tier 5:** ≤2 occupiable lots (minimal obligations)
- **Tier 4:** 3-12 occupiable lots (moderate obligations)
- **Tier 3:** >12 occupiable lots (full obligations — committee required, annual audit, etc.)

### Compliance rules stored in database (state_compliance_rules table):
```
agm_notice_days: 14
agm_max_interval_months: 15
levy_notice_min_days: 28
levy_interest_cap_monthly: 2.5 (simple interest per month)
proxy_limit_small_scheme: 1 (schemes ≤20 lots)
proxy_limit_large_scheme_pct: 5 (schemes >20 lots)
committee_min: 3
committee_max: 7
committee_max_extended: 12
special_resolution_threshold: 75
ordinary_resolution_threshold: 50
meeting_quorum_pct: 50
insurance_public_liability_min: 20000000
building_valuation_cycle_years: 5
```

### Multi-state architecture:
- **MVP: Victoria only**
- Architecture supports multi-state from day one via the state_compliance_rules config table
- When expanding to NSW/QLD, add rows to that table — don't rewrite code
- Each state has fundamentally different legislation (QLD has 5 regulation modules, VIC has 5 tiers, NSW requires electronic records since June 2024)

### Key financial requirements:
- **Dual-fund accounting:** Administrative Fund + Capital Works (Sinking) Fund
- **Levy calculation:** Budget ÷ lot liability proportions
- **Insurance premiums:** Can be split by lot entitlement (not liability) if AGM resolves
- **BPAY/DEFT integration:** Effectively mandatory for Australian strata levy payments
- **Penalty interest:** Capped at 2.5% simple interest per month on overdue levies
- **7-year record retention** for financial records
- **Permanent retention** for meeting minutes

### Key meeting requirements:
- 14-day minimum notice period for all general meetings
- AGM must be held within 15 months of the previous AGM
- Quorum: >50% of lot entitlements (present in person + proxy + electronic)
- Resolution types: Ordinary (>50%), Special (≥75%), Unanimous (100%)
- Unfinancial owners cannot vote on ordinary resolutions
- Proxy limits: 1 per holder (≤20 lots), 5% (>20 lots)
- Minutes must be distributed within 7 days

---

## DESIGN SYSTEM

### Brand: "StrataWise" / "StrataWise"

### Colour palette (HSL CSS variables):
```
Primary (blue):             hsl(216, 100%, 58%) — #2b7fff — main brand colour, buttons, links, active states
Primary hover:              hsl(216, 100%, 48%) — darker blue on hover
Primary foreground:         hsl(0, 0%, 100%) — white text on primary
Secondary (green):          hsl(160, 100%, 37%) — #00bd7d — success states, positive indicators, CTAs
Secondary hover:            hsl(160, 100%, 30%) — darker green on hover
Destructive (red):          hsl(0, 72%, 51%) — errors, overdue, critical alerts
Warning (amber):            hsl(38, 92%, 50%) — warnings, approaching deadlines
Muted foreground:           hsl(220, 9%, 46%) — secondary text, labels, placeholders

Background:                 hsl(220, 14%, 96%) — #f0f2f5 — light grey page background
Card/Surface:               hsl(0, 0%, 100%) — #ffffff — white cards on grey background
Sidebar:                    hsl(220, 26%, 14%) — #1a1f2e — very dark blue-grey
Sidebar text:               hsl(220, 15%, 65%) — muted light grey
Sidebar active:             hsl(216, 100%, 58%) — primary blue highlight
Sidebar active bg:          hsl(220, 26%, 20%) — slightly lighter than sidebar
Border:                     hsl(220, 13%, 91%) — #e2e5ea — subtle border
Muted:                      hsl(220, 14%, 96%) — disabled/muted backgrounds
Foreground:                 hsl(220, 26%, 14%) — #1a1f2e — primary text (near-black)
```

### Typography:
- **Font:** Inter (Google Fonts), NOT the default Next.js Geist font
- Page title: 24px, weight 600, tracking-tight
- Section title: 18px, weight 600
- Card title: 14px, weight 600, uppercase, letter-spacing 0.05em
- Body: 14px, weight 400
- Body small: 12px, weight 400, muted colour
- Label: 12px, weight 500, uppercase, letter-spacing 0.05em, muted
- KPI number: 28px, weight 700, tabular-nums

### Component rules (CRITICAL — non-negotiable):

**Buttons:**
- rounded-md (NEVER rounded-full — that's for avatars only)
- h-9 px-4 text-sm font-medium
- Sentence case always ("Create subdivision", not "CREATE SUBDIVISION")
- Primary: bg-primary text-white, hover bg-primary/90, shadow-sm
- Secondary: border border-border, hover bg-muted
- Destructive: bg-destructive text-white
- Ghost: bg-transparent text-muted-foreground, hover bg-muted

**Cards:**
- bg-card rounded-lg border border-border shadow-none (NO box shadows ever)
- Depth comes from border contrast on grey background, not shadows
- Hover on clickable cards: border-primary/30 transition-colors duration-150

**Tables:**
- Header: bg-muted/50, text-xs uppercase tracking-wider, h-10
- Rows: h-12, border-b border-border/50, text-sm
- Hover: bg-muted/30
- No zebra striping
- Sticky header on scroll

**Forms:**
- Labels above inputs (NEVER floating labels)
- Inputs: h-9 rounded-md border text-sm
- Focus ring: ring-2 ring-primary/20 border-primary
- Required fields: red asterisk after label
- Errors: text-destructive text-xs mt-1 below field
- Group related fields with border-t border-border mt-6 pt-6

**Badges/Status pills:**
- rounded-full px-2.5 py-0.5 text-xs font-medium
- Compliant/Paid: bg-secondary/10 text-secondary (green)
- Warning: bg-warning/10 text-[hsl(38,92%,35%)]
- Overdue/Critical: bg-destructive/10 text-destructive
- Neutral/Draft: bg-muted text-muted-foreground
- Info/Sent: bg-primary/10 text-primary (blue)

**Sidebar:**
- Fixed left, w-64, full height, dark blue-grey (#1a1f2e)
- Nav items: h-9, NO rounded corners
- Active: bg-sidebar-active-bg, primary blue text, border-l-2 primary blue
- Bottom: user avatar + name + role, click → Clerk UserButton

**Toasts (Sonner):**
- Bottom-right position
- Coloured left border (4px) matching type
- Success: green border + checkmark
- Error: red border + X icon, no auto-dismiss
- Duration: 4 seconds

**Loading:** Skeleton components (pulse animation), NOT spinners
**Empty states:** Centered icon (48px, very muted) + title + description + CTA
**Dialogs:** Fade-in only (150ms), NO slide/bounce/spring
**Transitions:** ONLY hover (150ms), dialog open (150ms), dropdown (100ms), sidebar collapse (200ms). Nothing else.

### Overall feel:
- Xero meets Jira meets Linear
- Dense but readable
- Zero decoration — no gradients, hero images, illustrations, or emojis
- Every pixel conveys information
- Blue (#2b7fff) + green (#00bd7d) + dark grey = modern, trustworthy, clean

---

## DATABASE SCHEMA

### Core tables:

1. **profiles** — synced from Clerk via webhook
   - id, clerk_id (unique), email, first_name, last_name, phone, postal_address, role (super_admin/strata_manager/lot_owner), management_company_id (FK, nullable — only for strata_managers), status (active/deactivated/anonymised), deactivated_at, anonymised_at, created_at, updated_at

2. **user_consents** — versioned T&C and privacy policy acceptance
   - id, profile_id, consent_type (terms_of_service/privacy_policy/communication_email/communication_sms), version, accepted_at, ip_address, user_agent, revoked_at

3. **notification_preferences** — per-user, per-channel notification settings
   - id, profile_id, notification_type, channel (email/sms/in_app/voice), enabled, UNIQUE(profile_id, notification_type, channel)

4. **management_companies** — holds strata management company info
   - id, name, abn, address, phone, email, subscription_status (active/suspended/cancelled), stripe_customer_id, created_at, updated_at

5. **subdivisions**
   - id, name, plan_number, address, state (default 'VIC'), total_lots, common_property_description, oc_tier (auto-calculated), abn, tfn, bank_bsb, bank_account_number, bank_account_name, financial_year_start_month, is_developer_period, developer_period_end_date, rules_type, custom_rules_registration_date, custom_rules_reference, billing_cycle, last_agm_date, next_agm_due (auto: last_agm_date + 15 months), management_company_id (FK), status (active/archived/suspended), archived_at, archived_reason, created_at, updated_at, created_by

6. **lots**
   - id, subdivision_id, lot_number, lot_entitlement, lot_liability, UNIQUE(subdivision_id, lot_number)

7. **subdivision_members** — links users to subdivisions
   - id, subdivision_id, profile_id, lot_id (nullable), role (strata_manager/lot_owner), is_primary_contact, is_financial (default true), absent_owner_address, joined_at, left_at
   - NOTE: subdivision_member_responsibilities table REMOVED entirely. Role is now simple: strata_manager or lot_owner.

8. **state_compliance_rules** — config table for multi-state
   - id, state, rule_key, rule_value, description, UNIQUE(state, rule_key)

9. **invitations**
   - id, subdivision_id, lot_id, email, name, phone, role (strata_manager/lot_owner), token (unique), status (pending/accepted/expired/revoked), invited_by, created_at, expires_at

10. **budgets** + **budget_items** — with fund_type (administrative/capital_works)
10. **levy_notices** — with fund_type, unique reference_number (SW-LEV-YYYY-NNNNNN) for bank matching
11. **payments** — with fund_type, linked to bank_transaction_id for reconciliation, match_confidence score
12. **lot_financial_summary** — materialized view (total_levied, total_paid, balance_owing, is_financial)
13. **bank_accounts** — per subdivision, per fund type
14. **bank_transactions** — imported from CSV, with auto-match status
15. **bank_reconciliation_sessions** — statement_balance vs calculated_balance
16. **meetings** + **agenda_items**
17. **votes** — one vote per lot per motion, weighted by lot_entitlement
18. **meeting_minutes**
19. **insurance_policies** + **insurance_claims**
20. **maintenance_requests** — with fund_type for expense tracking
21. **announcements** + **messages**
22. **documents** — stored in Supabase Storage (later R2)
23. **communication_log** — ALL outbound comms (email, SMS, voice, letter) with delivery status, evidence trail for VCAT
24. **complaints**
25. **notifications** — in-app delivery tracking
26. **audit_log** — immutable, insert-only, stores before/after JSON state for full change tracking
27. **proxies** + **proxy_directions**
28. **committee_nominations**
29. **escalation_workflows** — config table defining step sequences (email → SMS → voice → letter)
30. **escalation_workflow_steps** — ordered steps within a workflow (channel, delay_days, template_key)
31. **escalation_instances** — active tracking per overdue levy/entity (current_step, next_action_at, status)

CHARGE GROUPS & ADVANCED FINANCIAL:
32. **charge_groups** — subset of lots sharing a specific cost (e.g., driveway for 2 of 7 lots)
33. **charge_group_lots** — many-to-many linking charge groups to lots
34. **contractors** — approved contractors for maintenance work
35. **payment_plans** — hardship payment plans for overdue levies
36. **reserve_fund_items** — 10-year capital works plan items (Tier 3 requirement)
37. **budget_categories** — COA code mapping (seed data, read-only config). Users see "Gardening", auditors see COA code [200400].

### Auto-calculation triggers:
- `calculate_oc_tier(lot_count)`: ≤2 → Tier 5, ≤12 → Tier 4, >12 → Tier 3
- Trigger on subdivisions INSERT/UPDATE of total_lots

### RLS policies:
- Profiles: own profile readable, super_admin can read all
- Subdivisions: strata_managers from matching management_company can CRUD, lot_owners see assigned subdivision read-only
- Lots: strata_managers from matching management_company can CRUD, lot_owners see their own lot only
- Subdivision_members: strata_managers from matching management_company can CRUD, lot_owners see members list (no emails)
- Financial tables: strata_managers can read all, lot_owners see own lot only
- Audit_log: INSERT only, no UPDATE/DELETE. Strata_managers can read own subdivision's log, lot_owners cannot read
- Management_companies: strata_managers can read/write own company only, lot_owners cannot read

---

## ROLE SYSTEM

### Platform-level roles (profiles table):
```
super_admin  — StrataWise platform team (Elyas). Can see everything across all management companies.

strata_manager — Staff at a strata management company. Manages assigned subdivisions. Full CRUD on their subdivisions.

lot_owner — Invited to a limited portal. Can view their own lot, pay levies, chat, submit maintenance requests, vote at meetings.
```

That's it. Three simple roles. NO granular responsibilities. NO responsibilities table.

### Strata Manager Access:
Strata managers have FULL access to all subdivisions assigned to their management company:
- Create/edit budgets, generate levies, record payments
- Create/manage meetings, send notices
- Upload documents, manage insurance, track compliance
- Invite lot owners, assign them to lots
- View bank reconciliation, manage bank accounts
- Track maintenance requests, complaints, audit logs
- Generate PDFs, view all financial and member data
- No restrictions — they are the professionals running the subdivision

### Lot Owner Access:
Lot owners have FIXED, LIMITED access (see LOT OWNER VISIBILITY section for full details):
- View own lot details, levy notices, payment history
- Pay levies via /pay portal
- View approved budgets (summary)
- View meeting agendas, minutes, voting results
- Submit maintenance requests, lodge complaints
- Vote on motions
- Chat in subdivision group chat
- CANNOT see: other owners' financials, bank details, confidential documents, draft budgets, audit logs, staff views

### Voting restrictions:
- Unfinancial owners (overdue levies) cannot vote on ordinary resolutions
- They CAN vote on special and unanimous resolutions

---

## BUILD ROADMAP — 51 STEPS (v5)

### Phase 0 — Foundation (Steps 0.1-0.5)
- 0.1: Scaffold + design system + component showcase + PDF base template
- 0.2: Auth pages (sign-in, sign-up, management company onboarding with T&C consent)
- 0.3: Dashboard layout shell (sidebar with subdivision switcher + header)
- 0.4: Dashboard home page
- 0.5: Management company onboarding (3-step setup for strata management companies)

### Phase 1 — Roles & Database (Steps 1.1-1.3)
- 1.1: Core database schema (36 tables + RLS + VIC compliance rules + escalation infrastructure)
- 1.2: Clerk webhook + profile sync + default notification preferences + anonymisation on delete
- 1.3: Seed super_admin, display role, auth utility functions

### Phase 2 — Subdivisions (Steps 2.1-2.5)
- 2.1: Create subdivision form (Zod-validated)
- 2.2: Subdivision list page
- 2.3: Subdivision detail page — header + overview tab (URL-persisted tabs)
- 2.4: Lots & owners tab + sidebar sub-navigation + subdivision switcher
- 2.5: Edit subdivision + inline lot entitlements

### Phase 3 — Lot Owner & Strata Manager Setup (Steps 3.1-3.4)
- 3.1: Invite lot owner (dialog, token-based acceptance)
- 3.2: Role-aware dashboard (super_admin / strata_manager / lot_owner views)
- 3.3: Account settings (profile, notifications, SMS consent, deactivation)
- 3.4: Subdivision settings (general config, financial settings, charge groups, bank accounts) — strata_manager only

### Phase 4 — Financial Foundations (Steps 4.1-4.5)
- 4.1: Budget creation (dual-fund: admin + capital works)
- 4.2: Levy calculation engine (reference numbers for bank matching, PDF generation)
- 4.3: Levy distribution via Trigger.dev (background job, communication_log)
- 4.4: Payment recording (auto-match to oldest levy, overpayment handling)
- 4.5: Arrears dashboard + penalty interest (2.5%/month VIC cap)

### Phase 5 — Meetings (Steps 5.1-5.4)
- 5.1: Meeting creation + agenda builder (AGM auto-populates mandatory items)
- 5.2: Meeting notice distribution (14-day validation, Trigger.dev, communication_log)
- 5.3: Voting (quorum, resolution thresholds, unfinancial blocking, proxy support)
- 5.4: Meeting minutes + PDF generation + 7-day distribution rule

### Phase 6 — Insurance (Step 6.1)
- 6.1: Insurance register (policies, claims, expiry tracking with colour-coded badges)

### Phase 7 — Maintenance (Step 7.1)
- 7.1: Maintenance requests (submit with photos, workflow tracking)

### Phase 8 — Communications & Documents (Steps 8.1-8.4)
- 8.1: Announcements (with distribution per notification_preferences)
- 8.2: Document repository (categorised, auto-filed PDFs, role-based access)
- 8.3: Communications Log — evidence trail with delivery status, filterable, lot owner history view
- 8.4: Group chat (Supabase Realtime, all members can post, typing indicators, online presence)

### Phase 9 — Compliance (Step 9.1)
- 9.1: Compliance dashboard (green/amber/red for AGM, insurance, valuation, financials, committee)

### Phase 10 — Strata Manager Portfolio Dashboard (Step 10.1)
- 10.1: Multi-subdivision portfolio dashboard for strata_manager (KPIs, Tremor charts, arrears trends, compliance overview)

### Phase 11 — Polish & Email (Steps 11.1-11.3)
- 11.1: Responsive layout polish (all breakpoints verified)
- 11.2: Email delivery via Resend (all templates, Trigger.dev integration, communication_log updates)
- 11.3: Audit trail viewer (JSON diff, filterable)

### Phase 12 — Advanced Features (Steps 12.1-12.5)
- 12.1: Penalty interest (verify from 4.5)
- 12.2: Special levies (3 allocation methods)
- 12.3: Proxy voting (limits enforcement)
- 12.4: Staff assignment (assign strata_manager staff to subdivisions)
- 12.5: OC Certificate PDF (React-PDF, auto-populated), Bank reconciliation (CSV import Westpac/CBA/ANZ/NAB, auto-matching, reconciliation workspace)

### Phase 13 — Escalation Workflows & Disputes (Steps 13.1-13.3)
- 13.1: Email-based escalation for overdue levies (3-step: notice → reminder → final demand)
- 13.2: Complaint/dispute system
- 13.3: VCAT preparation pack (manual debt recovery, PDF evidence bundle)

### Phase 14 — Lifecycle Management (Step 14.1)
- 14.1: Subdivision suspension/reactivation, archival

### Phase 15 — Advanced Features v2 (Steps 15.1-15.4)
- 15.1: Contractor management (approved contractor register, integration with maintenance)
- 15.2: Reserve fund forecasting (10-year capital works plan, Tier 3 requirement)
- 15.3: Payment plans (hardship installment arrangements, escalation pause)
- 15.4: Public levy payment portal (/pay — no login, enter reference number, pay via Stripe/BPAY/EFT, QR code on levy PDFs)

---

## FUTURE / NOT-MVP FEATURES

- **v2 Escalation channels:** SMS via Twilio/MessageBird, voice calls via Vapi voice agents for overdue levy follow-ups
- **v2 Live bank feeds:** Basiq or Yodlee integration for real-time bank transaction import (replaces CSV upload)
- **v2 Hybrid management tier:** self-managed lot owners with optional strata manager support (mix of both models)
- **v3 Fully self-managed tier:** self-management platform for lot owners (original StrataWise vision)
- **v2 Multi-tenancy:** multiple strata management companies on the platform with complete isolation
- Mobile app (iOS/Android) with push notifications
- AI-assisted document drafting (minutes, notices)
- Xero/MYOB integration for trust accounting
- QR code on physical noticeboard → digital notices
- Multi-state compliance engine (NSW, QLD, SA, WA, TAS, ACT, NT)
- API for third-party integrations
- Digital signature support
- Lot owner forum/discussion board

---

## KEY ARCHITECTURAL DECISIONS LOG

| Decision | Choice | Alternative considered | Why |
|----------|--------|----------------------|-----|
| Auth | Clerk | Better Auth (open-source) | Speed to market. Better Auth is the fallback if Clerk costs become an issue at 50K+ users. CRITICAL: keep Clerk integration thin — webhook sync to profiles only, no deep Clerk org usage in business logic. |
| ORM | None (Supabase JS client) | Prisma, Drizzle | Elyas doesn't want an ORM. Supabase client sufficient for MVP. Trade-off: no client-side transactions (use RPCs). Can add Drizzle later if needed. |
| Form validation | Zod + react-hook-form | Manual validation | Type-safe schemas shared between client and server actions. Integrates with shadcn Form. |
| PDF generation | @react-pdf/renderer | Puppeteer/Playwright | Lightweight (~50-100ms per PDF), runs in serverless, $0. Puppeteer is too heavy for Vercel (100MB+ RAM, 50MB bundle limit). |
| UI | shadcn + Tremor | MUI, Ant Design, Chakra | shadcn for forms/nav (lightweight, full control), Tremor for dashboards/charts (acquired by Vercel, same Radix+Tailwind foundation). |
| Storage | Supabase → R2 migration path | R2 from day 1 | Start simple with Supabase Storage, migrate to R2 when document volume grows. R2 saves $450+/mo at 1TB scale. |
| State scope | VIC only, multi-state ready | Multi-state from start | Ship faster with one ruleset. state_compliance_rules table makes expansion trivial. |
| Stripe vs Clerk billing | Stripe directly | Clerk billing add-on | Clerk takes 0.7% of transactions. For levy collection that adds up. Need BPAY/DEFT anyway. |
| Background jobs | pg_cron + Trigger.dev (future) | BullMQ, Inngest | pg_cron is free (included in Supabase). Trigger.dev for complex multi-step escalation workflows. |
| Animations | Nearly zero | Framer Motion | Corporate software. No bounce, no spring, no parallax. Fade-in dialogs only. |
| Dark mode | Skipped | Built from start | Focus on getting light mode perfect. Can add later. |
| Account deletion | Anonymise, don't delete | Hard delete | Financial records require 7-year retention. PII stripped, records preserved with anonymised reference. |
| Tab state | URL searchParams (?tab=) | Component state | Shareable, bookmarkable links. Every tabbed page uses ?tab= param. |
| Charge groups | Optional charge_group_id on budget_items | Per-item lot overrides | Clean separation: define groups once, reference in budgets. Supports differential levies (driveway, pool, lift). |
| Settings split | Account (/settings) + Subdivision (/subdivisions/[id]/settings) | Single settings page | Account = per-user (profile, notifications). Subdivision = per-OC (financial config, charge groups, bank accounts). |
| Bank reconciliation | Manual entry primary, CSV secondary, PDF reference only | CSV primary | Members with manage_banking may not be tech-savvy. Manual entry with lot owner dropdown is most accessible. |
| Role model | super_admin + lot_owner + granular responsibilities | Fixed committee titles or StrataWise coordinator | Task-based, not title-based. Subdivision creator assigns manage_meetings, manage_finances, etc. No coordinator in the loop. |
| Reference numbers | Global Postgres SEQUENCE per type | Per-subdivision counter | Two levies from different subdivisions must NEVER share a reference. Global sequence guarantees uniqueness across the entire platform. |
| AGM tracking | last_agm_date + next_agm_due on subdivisions table | Calculate from meetings table | Explicit fields are more reliable and visible. Auto-updated when AGM is closed. |
| Public levy payments | /pay page with Stripe + BPAY/EFT display | Login-required payments only | Frictionless: scan QR code on levy PDF → pay instantly. No account needed. |
| Card surcharge | NO surcharges. OC absorbs Stripe fees. | Surcharge to payer | RBA banning surcharges from 2026-2027. OC budgets for "Payment processing fees" line item. |
| Stripe model | Stripe Connect (destination charges) | Direct Stripe on StrataWise | Funds go directly to OC's connected Stripe account. StrataWise never holds levy money. Platform fee billed separately. |
| BPAY | Display biller code + CRN on /pay page (MVP). API integration via Monoova v2. | Full API from start | BPAY is bank-side — owners pay in their own banking app. MVP just displays details. |
| Chart of accounts | Simplified categories with hidden COA codes | Full double-entry accounting | Users see "Gardening", auditors see [200400]. Export button generates COA-coded report. |
| Smart blocking | Locked feature cards with CTAs when prerequisites missing | Show empty/broken data | Progressive disclosure: don't show Financials until entitlements set, don't show Levies until budget approved. |
| Onboarding | 4-step wizard for first user, invited users skip it | Dump on empty dashboard | First person (usually chair) guided through setup. Everyone else joins via invitation link. |
| Platform fee in budgets | Mandatory, auto-inserted, non-removable by committee | Optional line item | Guarantees StrataWise fee is always included in levies. Committee sees it but can't delete it. |
| StrataWise billing | Stripe Subscription on OC's connected account | Invoice/manual | Automatic monthly billing. Failed payment → suspension. Clean revenue collection. |
| Bank accounts | OC brings their own. StrataWise doesn't create bank accounts. | StrataWise creates accounts | OC already has a bank account. Treasurer enters details. Stripe Connect links to it for payouts. |
| Payment portal 2FA | Email verification code before showing levy details | No verification | Prevents random reference guessing. 6-digit code to owner's email. Skip if no email on file. |
| Interest customization | Committee chooses: enabled/disabled, rate (0-2.5%), accrual day, grace period | Fixed 2.5% from day 1 | Flexibility within VIC cap. Some OCs prefer lower rate or grace period for good relations. |
| Notice period blocking | Date pickers grey out dates within 14 days (meetings) / 28 days (levies) | Validate on submit only | Prevents mistakes before they happen. Tooltip explains the legal requirement. |
| Role system | super_admin + strata_manager + lot_owner (fixed roles) | Granular responsibilities | Professional management company model. Strata managers have full access to assigned subdivisions. No granular permissions needed — strata managers ARE the experts. |
| Stripe Connect | Optional tier. Default is BPAY/EFT only. Stripe Connect adds card payments. | Mandatory Stripe Connect | Not all OCs want card payments. BPAY/EFT works for most. Stripe is an upgrade. |
| Optimistic UI | Budget line items, notification toggles, agenda items, status changes | Everything waits for server | Instant feel for non-critical actions. Financial confirmations always wait. |
| Support system | None required (v2 future) | Ticket-based with SLA tracking | Strata managers are professionals — they don't need support desk. Support desk feature is deferred to v2 for scaling. |

---

## REFERENCE: CLERK PRICING (as of Feb 2026)

- **Hobby (free):** 50,000 MRUs, 100 orgs, 3 social connections, basic RBAC
- **Pro ($25/mo):** 50K included, $0.02/MRU overage, MFA, passkeys, unlimited social
- **Business ($300/mo):** SOC 2 access, HIPAA, 10 dashboard seats
- **B2B add-on ($100/mo):** Unlimited org members, custom roles, verified domains
- **Enterprise SSO:** $75/mo per connection after first free one
- **MRU = Monthly Retained User:** anyone who visits ≥1 day after signup

---

## REFERENCE: SUPABASE PRICING

- **Free:** 500MB DB, 1GB storage, 50K auth MAUs, 500K edge function invocations
- **Pro ($25/mo):** 8GB DB, 100GB storage, 100K MAUs, 2M edge functions, 250MB bandwidth included
- **Overage:** storage $0.021/GB, bandwidth $0.09/GB uncached
- **Connection string:** postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres

---

## REFERENCE: BETTER AUTH (if we migrate from Clerk)

Better Auth (MIT license, 26K GitHub stars, YC-backed, $5M raised) is the top open-source Clerk alternative. Key facts:

- **$0 cost at any scale** when self-hosted
- Works WITHOUT an ORM — uses Kysely internally, accepts raw `pg.Pool`
- Connects to Supabase via PostgreSQL connection string directly
- **Organization plugin (free):** multi-org membership, invitations, RBAC, custom roles
- Creates tables: user, session, account, verification + organization, member, invitation
- Has shadcn-based UI components via `@daveyplate/better-auth-ui` (1,500 GitHub stars)
- Auth.js (NextAuth) merged into Better Auth in Sept 2025
- **Trade-off vs Clerk:** younger (1 CVE patched Oct 2025), no SOC 2, no managed service, must build own login UI
- **Migration path:** Keep Clerk user data loosely coupled → swap auth layer without touching business logic

---

## DATA LIFECYCLE & ACCOUNT MANAGEMENT

### Account states:
- **active**: normal usage
- **deactivated**: user chose to deactivate. Login disabled, data preserved, shown as "Inactive" to members with manage_members. Can be reactivated.
- **anonymised**: user deleted account. PII stripped (name → "Former User", email → anonymised), financial/voting/audit records preserved.

### Subdivision states:
- **active**: normal usage
- **suspended**: non-payment of StrataWise subscription. Read-only — 30-day grace period.
- **archived**: OC dissolved or permanently closed. All data retained read-only.

### Retention rules (Victorian compliance):
- Financial records: 7 years minimum
- Meeting minutes: permanent
- Audit log: permanent
- Communication log: 7 years (evidence for disputes/VCAT)

---

## ESCALATION INFRASTRUCTURE (IN MVP)

The database includes escalation tables with core functionality in MVP:

**Architecture: separate "what" from "when" from "how"**
- escalation_workflows: defines step sequences (config/data)
- escalation_instances: tracks active escalations (state machine)
- communication_log: records every outbound communication (evidence)

**MVP (Phase 13):** Email-only escalation via Resend. 3-step workflow for overdue levies:
  1. Notice email (on due date + grace period)
  2. Reminder email (7 days overdue)
  3. Final demand email (14 days overdue)

**v2:** Add SMS adapter (Twilio/MessageBird), voice adapter (Vapi), letter generation (React-PDF).

**Consent handling:** SMS and voice channels require explicit user consent (tracked in user_consents table, enabled in notification_preferences). escalation_workflow_steps has a requires_consent flag — if consent not granted, the step falls back to the fallback_channel (usually email).

---

---

## ID & NAMING CONVENTIONS

All entities and documents follow consistent naming. Reference this in every step.

```
=== ENTITY REFERENCE NUMBERS (stored in database, shown in UI) ===

Levy notices:      SW-LEV-{YYYY}-{NNNNNN}     e.g., SW-LEV-2026-000042
Special levies:    SW-SLEV-{YYYY}-{NNNNNN}    e.g., SW-SLEV-2026-000001
Payments:          SW-PAY-{YYYY}-{NNNNNN}     e.g., SW-PAY-2026-000105
Meetings:          SW-MTG-{YYYY}-{NNNNNN}     e.g., SW-MTG-2026-000003
Meeting minutes:   SW-MIN-{YYYY}-{NNNNNN}     e.g., SW-MIN-2026-000003
Insurance policies:SW-POL-{YYYY}-{NNNNNN}     e.g., SW-POL-2026-000002
Insurance claims:  SW-CLM-{YYYY}-{NNNNNN}     e.g., SW-CLM-2026-000001
Maintenance:       SW-MNT-{YYYY}-{NNNNNN}     e.g., SW-MNT-2026-000015
Invitations:       SW-INV-{YYYY}-{NNNNNN}     e.g., SW-INV-2026-000008
OC Certificates:   SW-CERT-{PLAN}-{DATE}      e.g., SW-CERT-PS123456A-20260315
Reconciliation:    SW-REC-{ACCT}-{YYYY-MM}    e.g., SW-REC-ADMIN-2026-03
VCAT prep packs:   SW-VCAT-{PLAN}-LOT{N}-{DATE} e.g., SW-VCAT-PS123456A-LOT7-20260315
Complaints:        SW-CMP-{YYYY}-{NNNNNN}     e.g., SW-CMP-2026-000003
Escalation:        SW-ESC-{YYYY}-{NNNNNN}     e.g., SW-ESC-2026-000012

{NNNNNN} is a GLOBAL auto-incrementing sequence per type — NEVER per-subdivision. Two levies from different subdivisions must never share a reference number. Reset to 000001 each January 1st.
Use a Postgres SEQUENCE per type: CREATE SEQUENCE sw_lev_seq; CREATE SEQUENCE sw_mtg_seq; etc. (names are short-form matching the prefix passed to `next_reference_number()` — e.g. `LEV` → `sw_lev_seq`). Generate via Supabase RPC; the function prepends `StrataWise-` and returns `SW-<PREFIX>-YYYY-NNNNNN`. A single global sequence per entity type ensures uniqueness across the entire platform.

=== PDF FILE NAMES (when downloaded/generated) ===

Same as reference number + .pdf suffix:
  SW-LEV-2026-000042.pdf, SW-MTG-2026-000003.pdf, etc.

=== LEVY REFERENCE FOR BANK MATCHING ===

The levy reference number (SW-LEV-{YYYY}-{NNNNNN}) is printed on every levy notice PDF.
Owners are instructed to use this as their BPAY/EFT payment reference.
The bank reconciliation auto-matcher scans transaction descriptions for this pattern.
```

---

## EDGE CASES & BUSINESS RULES

These edge cases must be handled in the relevant steps. Reference these when building features.

```
FINANCIAL EDGE CASES:
- Overpayment: Payment exceeds outstanding balance → record full payment, create credit on lot account. Show positive balance as "Credit: $X.XX" (green) on lot financial summary. Credit auto-applies to next levy.
- Partial payment: Payment is less than levy amount → update levy_notices.amount_paid, set status to 'partially_paid'. Auto-match to oldest unpaid levy for the lot.
- Payment for wrong lot: Treasurer manually reassigns via bank reconciliation workspace.
- Two people pay the same levy (e.g., co-owners): Second payment creates overpayment credit on the lot.
- Zero-entitlement lot: lot_entitlement = 0 means lot pays $0 levy. Still gets a $0 levy notice for record. Cannot vote (0 weight).
- Lot with no owner: Levy notice still generated (addressed to "The Owner, Lot X"). Shown as "Unassigned" in arrears. Cannot vote.
- Levy issued mid-cycle after lot ownership changes: New owner inherits all outstanding levies from their purchase date forward. Previous owner's levies remain on their record (anonymised if account deleted).
- Written-off levy receives late payment: Reopen the levy, change status from 'written_off' to 'partially_paid' or 'paid'. Log in audit_log.
- Financial year change: If financial_year_start_month changes, existing budgets/levies for the current year are NOT retroactively changed. New budgets use the new start month.
- Refund to owner who overpaid: "Record refund" creates a negative payment entry. Reduces credit balance.
- Interest on interest: NO. VIC Act specifies interest on the overdue LEVY amount only, not on accrued interest. Penalty interest is calculated on original levy amount.
- Budget not approved before financial year starts: Levies cannot be issued. Compliance dashboard shows red alert "Budget not approved".
- Owner pays wrong amount (last quarter's amount instead of this quarter's): Auto-match by oldest unpaid levy. Surplus/deficit handled as overpayment or partial payment.
- GST on levies: Typically strata levies are GST-free. If OC is GST-registered (>$150K turnover), add optional GST field to levy_notices for future compliance. Default: no GST.
- Charge group allocation: Some costs apply to a subset of lots (e.g., only 2 of 7 lots use the driveway). Budget items can reference a charge_group — see CHARGE GROUPS section.
- Payment plan for hardship: Members with manage_finances can split an overdue amount into installments. See payment_plans table.

MEETING EDGE CASES:
- Quorum not met: Meeting cannot proceed to voting. Record "Quorum not met — meeting adjourned" in minutes. Schedule a reconvened meeting (reduced quorum rules may apply per VIC legislation for adjourned meetings).
- Tied vote: The motion FAILS. In Victoria, a tied vote means the motion is not passed. Record "Motion failed — tied vote".
- Proxy holder also owns a lot: They vote once for their own lot AND once for each proxied lot. Each vote is separate in the votes table with the correct lot_id.
- Proxy holder voting on their own appointment/payment/dismissal: Invalid. Block in UI (VIC Act s89).
- Unfinancial owner tries to vote on ordinary resolution: Blocked. Show message: "Your lot has outstanding levies. You cannot vote on ordinary resolutions until levies are paid." CAN vote on special and unanimous resolutions.
- All members with manage_meetings responsibility resign: Subdivision enters "no members" state. Super_admin notified immediately. SGM must be called within 30 days. Compliance dashboard shows red.
- No agenda items added: Block "Send notice" until at least one agenda item exists.
- Meeting date changed after notice sent: Must send amended notice. Log amendment in communication_log.
- Secret ballot: VIC Act allows secret ballots. Add "secret_ballot" flag to agenda_items — hides individual vote records from members without manage_meetings responsibility.
- Observer at meeting (e.g., prospective buyer): Can attend but cannot vote. Allow "observer" attendance marking.
- Motion amended during meeting: Allow editing motion text before voting closes. Record amendment in minutes.
- Adjourned meeting reconvened: Track as same meeting_id with adjusted quorum threshold.

ACCOUNT & OWNERSHIP EDGE CASES:
- Two people claim the same lot: Only one can be primary owner per lot. New owner invitation ends previous owner's membership.
- Lot ownership transfer (property sale): Member with manage_members invites new owner → accepts → old owner's membership ends. Historical data preserved.
- Co-owners of a lot (joint ownership): Multiple subdivision_members with same lot_id and role='owner'. One is primary_contact. They share one vote (by lot entitlement).
- Trust/company owns a lot: Add optional entity_name (trust/company) + representative_name to subdivision_members. Representative is the person who logs in.
- Deceased owner: Member with manage_members marks lot as "Estate of [name]" pending probate. New owner invited after settlement.
- Owner owns multiple lots: Separate subdivision_members records per lot. Votes once per lot with that lot's entitlement weight.
- Owner sells and buys in same subdivision: Old lot membership ends, new lot membership begins. Two records.
- User signs up but no invitation: Dashboard shows "You're not part of any subdivision yet. Enter an invitation code or ask your subdivision admin to invite you."
- Lot owner deactivates account: profile.status='deactivated', lot shows "Owner inactive". Financial records preserved. Can reactivate.
- Lot owner deletes account: PII anonymised, records preserved, lot marked unassigned. New owner can be invited.
- Owner in hardship: Member with manage_finances can offer payment plan. See payment_plans.
- Foreign/absent owner: Different postal address (absent_owner_address field). Consider timezone for meeting scheduling notifications.

BANK RECONCILIATION EDGE CASES:
- Duplicate transactions in CSV: Detect by matching (date + amount + description). Show warning with option to exclude.
- CSV from wrong bank account: Warn if BSB/account in CSV header doesn't match selected bank_account.
- Transaction reversal/refund: Negative and positive amounts for same reference. Flag for manual review.
- Statement balance doesn't match calculated: Show discrepancy warning. Treasurer adds reconciliation note.
- PDF bank statement uploaded: Show guidance to use CSV instead. Allow manual entry as fallback. Do NOT attempt PDF parsing for MVP.

NOTIFICATION EDGE CASES:
- Email bounces: Mark communication_log.status='bounced'. Show red indicator next to owner's name. Member with manage_members should update email.
- Owner has no email: Fallback to in-app only. Show warning on lot detail page.
- SMS consent revoked: Immediately disable all SMS. Escalation steps fall back to email.
- Owner opted out of ALL communications: Levy notices still generated (legal requirement), appear in-app only. Warning shown to members with manage_members.

SUBDIVISION LIFECYCLE EDGE CASES:
- Subdivision archived but has unpaid levies: Archive proceeds, outstanding levies remain on record.
- Subdivision suspended (non-payment of StrataWise fee): Banner shown to all members. All data read-only. Escalations paused.
- Reactivation after suspension: All data preserved, escalations can resume.
- Developer period ending: Developer must hand over to OC. Add "developer handover checklist" compliance item.
- Rules change (model to custom): Requires special resolution. Record registration date and reference.

DOCUMENT EDGE CASES:
- Document uploaded exceeds storage limit: Enforce per-subdivision quota (1GB free tier). Show clear error.
- Duplicate filename: Append timestamp increment (e.g., "Budget-2026 (2).pdf").
- Sensitive document (legal advice): "Confidential" flag on documents — visible only to members with manage_documents responsibility.

CONFLICT OF INTEREST:
- Member with manage_meetings has conflict of interest on a motion: Must declare and abstain. Add "conflict_of_interest" flag to votes. Record in minutes.

CONCURRENCY:
- Two members editing same budget simultaneously: Last-write-wins with full audit trail showing both changes. Consider Supabase realtime for optimistic locking in v2.
- Session timeout during meeting voting: Votes already cast are preserved. Allow resuming.
```

---

## PAYMENT OPTIONS (with/without Stripe Connect)

Not all OCs will want to set up Stripe Connect. The platform supports three payment tiers:

```
TIER 1 — DISPLAY ONLY (no Stripe Connect, zero setup):
  /pay page shows: BPAY details + EFT bank details + levy reference number.
  Owner pays via their own banking app. Reconciliation via CSV import or manual entry.
  Cost to OC: $0 in payment processing fees.
  This is the DEFAULT for all new subdivisions.

TIER 2 — STRIPE CONNECT (card payments enabled):
  /pay page also shows: "Pay by card" button → Stripe Checkout.
  Requires treasurer to complete Stripe Connect onboarding (~5 min, one-time).
  Card payments flow directly to OC's bank. Stripe fees absorbed by OC.
  Cost to OC: ~1.75% + $0.30 per card payment.
  Budget line item: "Payment Processing Fees" to cover this.

TIER 3 — BPAY API (future, v2):
  StrataWise gets a biller code via Monoova/Ezidebit. Webhook auto-matches BPAY payments.
  Cost to OC: ~$0.20-0.85 per BPAY transaction.

UI IN SUBDIVISION SETTINGS → BANK ACCOUNTS TAB:
  Card: "Payment Methods"
  - BPAY & Bank Transfer: Always available. Shows OC's bank details.
    Status: "Active — owners can pay via BPAY/EFT using levy reference numbers."
  - Card Payments: toggle.
    If OFF: "Card payments are not enabled. Owners can only pay via BPAY or bank transfer."
    If ON but not configured: "Complete Stripe setup to accept card payments" [Set up Stripe →]
    If ON and configured: "Card payments active. Stripe account: verified ✓"
    [Set up Stripe →] button triggers Stripe Connect Express onboarding.

If OC chooses not to enable Stripe: everything works fine — just BPAY/EFT.
The /pay page adapts: if no Stripe account, card payment option is simply not shown.
```

---

## OPTIMISTIC UI PATTERNS

Some actions should feel instant. Others must wait for server confirmation.

```
OPTIMISTIC (show success immediately, process in background):
  ✓ Adding a budget line item (row appears instantly, saves in background)
  ✓ Toggling notification preferences (switch flips instantly)
  ✓ Marking a maintenance request status change (badge updates instantly)
  ✓ Adding an agenda item to a meeting (appears in list instantly)
  ✓ Editing profile fields (saves on blur/submit, no loading state)
  ✓ Reordering agenda items (drag position updates instantly)
  ✓ Toggling interest settings (switch flips instantly)
  ✓ Dismissing a notification (disappears instantly)

  Pattern: use React's useOptimistic() or optimistic state update.
  On failure: revert to previous state + show error toast (Sonner, no auto-dismiss).

WAIT FOR CONFIRMATION (show loading, then success):
  ⏳ Approving a budget (irreversible — "Approving..." loading state on button)
  ⏳ Generating levies (creates many records — progress indicator)
  ⏳ Sending meeting notices (distributes to all owners — "Sending..." then "Sent ✓")
  ⏳ Recording a payment (financial — must confirm match before showing success)
  ⏳ Completing bank reconciliation (financial — must balance before confirming)
  ⏳ Creating a subdivision (multi-step server action)
  ⏳ Accepting an invitation (creates membership — redirect on success)
  ⏳ Stripe Connect onboarding (external redirect, wait for callback)
  ⏳ Exporting PDF (generation takes 1-3 seconds — show skeleton then download)

  Pattern: disable button, show spinner text ("Approving..."), enable on response.
  Use shadcn Button with loading prop: <Button disabled={isPending}>
  { isPending ? "Approving..." : "Approve budget" }

BACKGROUND JOBS (fire and forget — toast confirms dispatch, not completion):
  🔄 Levy distribution (Trigger.dev job — toast: "Levy notices are being distributed")
  🔄 Meeting notice distribution (toast: "Notices are being sent to all owners")
  🔄 Minutes distribution (toast: "Minutes are being distributed")
  🔄 Overdue check (runs daily — no user-facing feedback)

  Pattern: server action dispatches Trigger.dev job, returns immediately.
  Toast: "X is being processed. You'll see results in a few minutes."
  Communication_log shows real status as job progresses.
```

---

## LOT OWNER VISIBILITY

Lot owners (invited portal users) see enough to stay informed about their lot and the subdivision but NOT see other owners' private financial details or strata manager internal views.

```
CAN SEE (lot_owner role):
  ✓ Own lot details (number, entitlement, liability)
  ✓ Own financial summary (balance owing, payment history, levy notices)
  ✓ Own communication history (emails/notices sent to them)
  ✓ Subdivision overview (name, address, plan number, OC tier, member names only — no emails)
  ✓ Approved budgets (summary + line items — this is public info for all owners)
  ✓ Meeting agendas, minutes, and voting results (public OC records)
  ✓ Announcements
  ✓ Document repository (except documents flagged "confidential")
  ✓ Insurance policies (summary: provider, type, expiry — not claim details)
  ✓ Maintenance requests (all — common property issues affect everyone)
  ✓ Compliance dashboard (read-only — green/amber/red status)
  ✓ Group chat (read AND write — all members can post, it's an informal group chat)

CAN DO (lot_owner role):
  ✓ Pay own levies (via /pay portal or in-app)
  ✓ Vote on motions at meetings
  ✓ Submit maintenance requests
  ✓ Lodge complaints
  ✓ Download own levy notice PDFs
  ✓ Download meeting minutes PDFs
  ✓ Update own profile + notification preferences
  ✓ Deactivate own account

CANNOT SEE:
  ✗ Other lot owners' individual balances or payment history
  ✗ Other lot owners' contact details (email, phone, postal address)
  ✗ Bank account details (BSB, account number)
  ✗ Bank statements or reconciliation data
  ✗ Confidential documents (flagged by strata manager)
  ✗ Insurance claim details (sensitive)
  ✗ Audit log
  ✗ Individual lot financial breakdowns (only aggregated totals in budgets)
  ✗ Draft budgets (only approved ones)
  ✗ Escalation workflows (internal strata manager tracking)
  ✗ Staff views (everything marked "strata_manager only")

AGGREGATED DATA THEY CAN SEE:
  ✓ "Total arrears: $X" (aggregate, not per-lot) — in compliance dashboard
  ✓ "X of Y lots financial" (count, not names) — in subdivision overview
  ✓ Budget totals and line items (not how much each lot owes individually)

This means: an owner knows the OC has $5,000 in arrears across 3 lots, but cannot see
WHICH lots or WHO owes what. Only strata managers can see individual details.
```

---

## PROFILE PICTURES

```
All users can upload a profile picture. This replaces the default initial-based avatar.

STORAGE: Cloudflare R2 bucket 'stratawise-avatars'. Path: avatars/{profile_id}.jpg
  R2 has zero egress fees — avatars are loaded on every page, by every user, constantly.
  Supabase Storage charges $0.09/GB for bandwidth. For a platform with hundreds of users
  loading avatars on every page view, R2 saves real money.
  Use the same R2 integration path planned for documents (see tech stack — Supabase → R2 migration).
  For MVP simplicity: start with Supabase Storage if R2 isn't configured yet. Migrate when ready.
  Store the URL in profiles.avatar_url — works with either backend.

MAX SIZE: 2MB. Accepted: .jpg, .png, .webp.
PROCESSING: On upload, resize to 256x256px server-side (use sharp or Cloudflare Image Transforms).
DISPLAY: rounded-full avatar everywhere — sidebar user section, member lists, meeting attendance,
         communication log, support tickets, chat messages.
DEFAULT: If no picture, show initials on a primary-coloured circle (first letter of first + last name).
         Colour: generated from profile_id hash for consistency.

SETTINGS: Upload/change in /settings?tab=profile. Drag-and-drop zone or click to select.
          "Remove photo" link returns to initials.

Clerk UserButton already shows Clerk's avatar — sync is optional.
For simplicity, store StrataWise avatar separately (not dependent on Clerk).

Add avatar_url column to profiles table.
```

---

## EMAIL FLOWS — COMPLETE AUDIT

Every email the platform sends. All use Resend + React Email templates. All logged to communication_log.

```
AUTHENTICATION & ACCOUNT:
  1. Invitation email       → "You've been invited to join {subdivision_name} on StrataWise"
                              Contains: accept link (/invite/{token}), subdivision name, lot number, role info
                              Trigger: member with manage_members sends invitation (Step 3.1)

  2. Welcome email          → "Welcome to StrataWise"
                              Contains: getting started guide, link to dashboard
                              Trigger: user accepts invitation and completes sign-up

  3. Account deactivated    → "Your StrataWise account has been deactivated"
                              Contains: what this means, how to reactivate, data retention note
                              Trigger: user deactivates own account (Step 3.3)

LEVIES & PAYMENTS:
  4. Levy notice            → "Levy Notice — {subdivision_name} — {period}"
                              Contains: amount due, due date, payment instructions (BPAY/EFT/card), QR code link
                              Attachment: levy notice PDF
                              Trigger: levy distribution job (Step 4.3)

  5. Levy reminder          → "Reminder: Levy due in 7 days"
                              Contains: amount, due date, payment link
                              Trigger: Trigger.dev job, 7 days before due date

  6. Levy overdue           → "Your levy is overdue — {subdivision_name}"
                              Contains: amount, days overdue, interest warning, payment link
                              Trigger: overdue check job (Step 4.3)

  7. Payment received       → "Payment received — thank you"
                              Contains: amount, levy reference matched, remaining balance (if partial)
                              Trigger: payment recorded (Step 4.4) or Stripe webhook

  8. Payment plan created   → "Payment plan arranged for your lot"
                              Contains: installment amount, frequency, start date, total
                              Trigger: payment plan created (Step 15.3)

MEETINGS:
  9. Meeting notice         → "Notice of {AGM/SGM/Meeting} — {subdivision_name}"
                              Contains: date, time, location, agenda summary, proxy info
                              Attachment: meeting notice PDF with proxy form
                              Trigger: "Send notice" button (Step 5.2)

  10. Vote open             → "Voting is now open — {meeting_title}"
                              Contains: agenda items being voted on, link to vote
                              Trigger: chair opens voting (Step 5.3)

  11. Vote results          → "Voting results — {meeting_title}"
                              Contains: each motion + result (passed/failed) + vote percentages
                              Trigger: chair closes voting

  12. Minutes distributed   → "Meeting minutes — {meeting_title}"
                              Contains: summary, link to view
                              Attachment: minutes PDF
                              Trigger: "Distribute minutes" button (Step 5.4)

GENERAL:
  13. Announcement          → "{subdivision_name}: {announcement_title}"
                              Contains: full announcement text
                              Trigger: announcement published (Step 8.1)

  14. Maintenance update    → "Maintenance request update — {title}"
                              Contains: new status, notes
                              Trigger: status change on maintenance request (Step 7.1)

  15. Insurance expiry      → "Insurance expiring soon — {policy_type}"
                              Contains: policy details, expiry date, action needed
                              Trigger: Trigger.dev job, 30 days before expiry

  16. Compliance alert      → "Compliance issue — {subdivision_name}"
                              Contains: what's non-compliant, recommended action
                              Trigger: compliance check finds red item

PAYMENT PORTAL:
  17. 2FA verification      → "Your StrataWise verification code: {code}"
                              Contains: 6-digit code, expires in 10 minutes
                              Trigger: /pay page lookup (Step 15.4)

  18. Portal payment receipt → "Payment received via StrataWise portal"
                              Contains: levy reference, amount, confirmation number
                              Trigger: Stripe webhook on /pay success

SUPPORT:
  19. Ticket submitted      → "We've received your question — #{ticket_id}"
                              Contains: subject, confirmation it's been received, SLA note
                              Trigger: support ticket created (Step 15.5)

  20. Ticket response       → "Response to your question — #{ticket_id}"
                              Contains: the response text, link to view full thread
                              Trigger: support team responds

ADMIN:
  21. Subscription warning  → "Payment failed — action required"
                              Contains: what failed, retry schedule, suspension warning
                              Trigger: Stripe subscription payment fails

  22. Subdivision suspended → "Your subdivision has been suspended"
                              Contains: reason, what's read-only, how to resolve
                              Trigger: 3 failed subscription payments

All emails:
- From: notifications@mystratamanagement.com.au (Resend verified domain)
- Reply-to: support@mystratamanagement.com.au
- Unsubscribe link: links to /settings?tab=notifications
- Footer: "StrataWise — ABN XXXXXXX"
- Respect notification_preferences: if user disabled email for that type, DON'T send (except legal requirements like levy notices)
- Legal requirement emails (levy notices, meeting notices): ALWAYS send regardless of preferences, per Victorian legislation
```

---

## SMART BLOCKING & PROGRESSIVE DISCLOSURE

Features should be gated behind their prerequisites. Don't show broken or empty data — show clear guidance on what to do next. Apply these rules across ALL pages:

```
SETUP GATES (check in this order, block if not met):

1. NO SUBDIVISION CREATED:
   - Dashboard: shows "Create your first subdivision to get started" empty state with CTA.
   - Sidebar: no subdivision sub-nav shown.
   - All /subdivisions/[id]/* routes: redirect to /subdivisions.

2. SUBDIVISION EXISTS BUT NO LOTS CONFIGURED (entitlements = 0):
   - Financials tab: locked card — "Set up lot entitlements before creating budgets."
   - CTA: "Configure entitlements →" links to edit page.
   - Meetings, Insurance, Maintenance: accessible (don't depend on entitlements).

3. NO BUDGET APPROVED:
   - Levies sub-tab: locked card — "Approve a budget to generate levy notices."
   - Payments sub-tab: still accessible (manual payments can be recorded anytime).
   - Arrears sub-tab: shows "$0 outstanding" (no levies issued yet).

4. NO LEVIES GENERATED:
   - Levy list: empty state — "Generate levies from an approved budget."
   - Payment recording: works but shows info "No levies to match against — payment will be recorded as unmatched credit."

5. NO BANK ACCOUNT CONFIGURED:
   - Bank reconciliation (12.6): locked card — "Add a bank account in subdivision settings first."
   - CTA: "Add bank account →" links to /subdivisions/[id]/settings?tab=bank-accounts.

6. NO CHARGE GROUPS (optional):
   - Budget items: "Charge Group" column dropdown shows only "All lots". No blocking.
   - Subdivision settings → Charge Groups tab: helpful empty state explaining the concept.

7. NO OWNERS INVITED:
   - Lots & Owners tab: all lots show "Unassigned" with prominent "Invite owner" buttons.
   - Meetings: warning "No owners invited — meeting notices cannot be distributed."
   - Levies: generates but shows "Addressed to: The Owner, Lot X" (still valid per legislation).


VISUAL PATTERN FOR LOCKED FEATURES:

┌──────────────────────────────────────────┐
│  [Lock icon]  Feature Name               │
│                                          │
│  Brief explanation of what's needed.     │
│                                          │
│  [Primary CTA button →]                  │
└──────────────────────────────────────────┘

Style: bg-muted/30 border border-dashed border-border rounded-lg p-8 text-center.
Icon: Lock (lucide), 32px, text-muted-foreground/50.
Title: text-base font-medium.
Description: text-sm text-muted-foreground max-w-md mx-auto mt-2.
CTA: primary button mt-4.

This is NOT a "coming soon" placeholder. It's an actionable gate that tells the user exactly what step to complete next.

SETUP PROGRESS INDICATOR (on subdivision detail page):

Show a simple progress checklist card on the Overview tab when subdivision is newly created:

☑ Create subdivision
☐ Configure lot entitlements (0/12 lots configured)
☐ Invite lot owners (0/12 owners invited)
☐ Set up bank account
☐ Create and approve budget
☐ Generate first levy notices

Hide this card once all steps are complete. It's a gentle onboarding guide, not a permanent fixture.
```

---

## CHART OF ACCOUNTS (SIMPLIFIED)

StrataWise uses friendly category names for users but maps them to standard strata chart of accounts (COA) codes for auditors and accountants.

```
=== BUDGET CATEGORY MAPPING ===

Each budget_item category internally maps to a COA code. Users see "Gardening", auditors see "[200700] Expenses - Garden/Landscaping".

ADMINISTRATIVE FUND CATEGORIES:
| User-Facing Name      | COA Code | COA Description                          |
|----------------------|----------|------------------------------------------|
| Insurance            | 200100   | Expenses - Insurance                     |
| Utilities            | 200200   | Expenses - Utilities                     |
| Cleaning             | 200300   | Expenses - Cleaning                      |
| Gardening            | 200400   | Expenses - Garden/Landscaping            |
| Repairs & Maintenance| 200500   | Expenses - Repairs & Maintenance         |
| Platform Fee         | 200600   | Expenses - Management/Platform Fee       |
| Audit                | 200700   | Expenses - Audit & Accounting            |
| Legal                | 200800   | Expenses - Legal Fees                    |
| Administration       | 200900   | Expenses - Administration & Stationery   |
| Fire Safety          | 201000   | Expenses - Fire Safety & Compliance      |
| Pest Control         | 201100   | Expenses - Pest Control                  |
| Lift Maintenance     | 201200   | Expenses - Lift/Elevator Maintenance     |
| Other                | 209900   | Expenses - Other                         |

CAPITAL WORKS FUND CATEGORIES:
| User-Facing Name      | COA Code | COA Description                          |
|----------------------|----------|------------------------------------------|
| Building Works       | 300100   | Capital Works - Building Structure       |
| Painting             | 300200   | Capital Works - Painting                 |
| Roofing              | 300300   | Capital Works - Roofing                  |
| Plumbing             | 300400   | Capital Works - Plumbing                 |
| Electrical           | 300500   | Capital Works - Electrical               |
| Fencing & Gates      | 300600   | Capital Works - Fencing & Gates          |
| Paving & Driveways   | 300700   | Capital Works - Paving & Driveways       |
| Pool/Gym Equipment   | 300800   | Capital Works - Common Facility          |
| Other Capital        | 309900   | Capital Works - Other                    |

ASSET/LIABILITY CODES (auto-populated, not user-entered):
| Internal Name         | COA Code | COA Description                          |
|----------------------|----------|------------------------------------------|
| Levy receivables     | 101800   | Assets - Receivable - Levies             |
| Interest receivable  | 101700   | Assets - Receivable - Interest           |
| Insurance claims     | 101600   | Assets - Receivable - Insurance Claims   |
| Owner receivables    | 102000   | Assets - Receivable - Owner              |
| Bank - Admin Fund    | 100100   | Assets - Bank - Administrative Fund      |
| Bank - Capital Works | 100200   | Assets - Bank - Capital Works Fund       |
| Prepaid expenses     | 100900   | Assets - Prepaid Expenses                |

=== UI DISPLAY ===

BUDGET PAGE (user-facing):
- Category dropdown shows ONLY the friendly names: "Gardening", "Insurance", etc.
- No COA codes visible. Clean and simple.

EXPORT / AUDIT VIEW:
- "Export for auditor" button on financials page → generates CSV or PDF with:
  | COA Code | COA Description | Budget Amount | Actual Spent | Variance |
- This is the view an accountant would need for annual audit (Tier 3 requirement).
- Also available as a Xero/MYOB import format in future.

FINANCIAL SUMMARY PDF (React-PDF):
- Include COA codes in small grey text next to each line item.
- Readable by both members (friendly names) and auditors (COA codes).

=== DATABASE ===

Table: budget_categories (seed data — read-only config table)
- id, code (COA code string e.g., "200100"), name (user-facing e.g., "Insurance"), fund_type (administrative/capital_works), sort_order

budget_items.category_id FK → budget_categories.id

This replaces the current free-text category field on budget_items with a structured reference. Users pick from the dropdown, system stores the COA mapping.
```

---

## HOW TO USE THIS FILE

### In Claude.ai:
Paste this entire file at the start of a conversation. Then ask your question or give your instruction. Claude will have full context.

### In Claude Code:
Save this as `CONTEXT.md` in the project root. At the start of each session, tell Claude Code: "Read CONTEXT.md for full project context before proceeding."

### Updating this file:
After each major decision or completed phase, update this file with:
- Any new architectural decisions
- Database schema changes
- Completed steps (mark as done)
- New learnings or gotchas discovered during development

---

*Last updated: 18 March 2026 (v6 — MAJOR rewrite to professional SaaS model. Changed from self-management platform to professional strata management company software. Replaced granular responsibilities with fixed roles: super_admin, strata_manager, lot_owner. Added management_companies table. Escalation workflows IN MVP (Phase 13). Removed support desk from MVP. Updated all phases and future features. Complete role system and RLS overhaul.)*
