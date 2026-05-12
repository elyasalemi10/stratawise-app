# OC Creation Wizard — Implementation Notes

Next session's job: replace the current 5-step OC wizard at `/ocs/new` with the
spec'd 5-page version (PDF upload → review → OC basics → lot register → trust
account). This doc captures the decisions so we don't re-litigate them.

## Document parsing: Gemini vs Document AI

Use **Gemini 2.5 Pro with structured output (responseSchema)**, called via the
official `@google/genai` SDK with `GEMINI_API_KEY`. Not Document AI.

**Why not Document AI:** Document AI's pre-built processors (Invoice, Form,
OCR, Layout) don't understand Plan-of-Subdivision domain semantics — OC
numbers, lot schedules, entitlements/liabilities. The product that *would*
work is "Custom Document Extractor" (CDE) which **requires labelled training
data** (~50–200 PDFs marked up by hand). User explicitly does not want to
train on customer data, and we don't have a corpus yet.

**Why Gemini:** zero-shot vision on PDFs (`fileData` part with `application/pdf`),
returns JSON conforming to a schema we supply. Empirically very good at
semi-structured legal/government docs. No training, no labelling.

**Data-training opt-out:** by default, the paid Gemini API and Vertex AI do
**not** train on inputs. Confirm via the project's data-use settings at
console time. Use Vertex AI binding if extra paranoia is warranted; the
`@google/genai` SDK supports both providers behind the same interface.

## Page-by-page sketch

1. **Upload Plan PDF** — drag-and-drop, ≤50MB, .pdf only.
   - Upload to Supabase Storage: bucket `plans`, key `{oc_draft_id}/original.pdf`.
   - Create `oc_drafts` row with `parse_status='pending'`.
   - Background: send to Gemini with response schema below; on done store
     parsed JSON on `oc_drafts.parsed_json` and flip to `complete`/`failed`.
   - Frontend polls draft status. Indeterminate progress while parsing.
   - Skip button always available (route to page 2 with empty form).

2. **Review parsed details** — two-column. Left: form pre-filled from parse.
   Right: PDF.js preview (install `pdfjs-dist`), scroll-syncs to current
   field's bbox if present. Skip this page entirely if parse failed/skipped.
   - Confidence ≥0.85 → green tint. <0.85 → amber tint + amber border on input.
   - Persist edits to `oc_drafts.parsed_json` on every blur (debounce 500ms).

3. **OC basics** — trading name, tier (derived read-only badge), FY start
   (default 1 Jul), address for service (checkbox "same as OC address"),
   common seal toggle.

4. **Lot register** — toggle bulk/manual based on `total_lots ≥ 10`. CSV template
   pre-populated with lot numbers + entitlements + liabilities. Validation
   surfaces per-row errors. Skip allowed (modal confirm). New tables required:
   `lot_owners` (FK to `lots`, joint-owner support).

5. **Trust account** — bank dropdown (Macquarie highlighted), BSB autoformat
   to XXX-XXX, BSB→bank lookup table client-side. Macquarie integration is
   UI-only this round (toggle stored on draft, actual OAuth deferred until
   we have API access). Account purpose radio: combined / split-by-fund.

## Schema additions needed

```sql
CREATE TABLE oc_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  management_company_id uuid NOT NULL REFERENCES management_companies(id),
  created_by uuid NOT NULL REFERENCES profiles(id),
  step int NOT NULL DEFAULT 1,
  plan_storage_key text,
  parse_status text CHECK (parse_status IN ('none','pending','complete','failed')),
  parse_error text,
  parsed_json jsonb,
  draft_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  promoted_oc_id uuid REFERENCES owners_corporations(id) -- set when wizard completes
);

CREATE TABLE lot_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  postal_address text,
  is_occupied_by_owner boolean NOT NULL DEFAULT true,
  tenant_name text,
  tenant_email text,
  share_fraction numeric DEFAULT 1.0, -- for joint owners
  invitation_id uuid REFERENCES invitations(id) -- when invite sent
);

-- Plans bucket. Files kept indefinitely (audit/source-of-truth).
INSERT INTO storage.buckets (id, name, public) VALUES ('plans', 'plans', false);
```

## Gemini response schema (sketch)

```ts
{
  type: "object",
  properties: {
    plan_of_subdivision_number: { type: "string", description: "e.g. PS812345X" },
    detected_ocs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          oc_number: { type: "integer" },
          oc_name: { type: "string" },
          address: { type: "string" },
          lot_count: { type: "integer" },
          lots: {
            type: "array",
            items: {
              type: "object",
              properties: {
                lot_number: { type: "integer" },
                unit_entitlement: { type: "number" },
                lot_liability: { type: "number" },
                confidence: { type: "number" }, // 0-1
                bbox: { // PDF.js coords for preview pane highlight
                  type: "object",
                  properties: { page: {type:"integer"}, x:{type:"number"}, y:{type:"number"}, w:{type:"number"}, h:{type:"number"} }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## Env additions

```
GEMINI_API_KEY=...                  # Google AI Studio key
SUPABASE_STORAGE_PLANS_BUCKET=plans # default
```

## Out of scope this round

- Real Macquarie Connect OAuth — UI only, scaffolded as "coming soon".
- BSB-to-bank lookup data — ship with ~20 most-common AU prefixes; full table
  is ~2k entries from AusPayNet, fetch lazily later.
- Auto-resume drafts on second visit — nice-to-have, not blocking.
