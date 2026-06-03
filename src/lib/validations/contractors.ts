import { z } from "zod";

// ─── Contractor status ──────────────────────────────────────────────────────
export const CONTRACTOR_STATUSES = ["active", "inactive"] as const;
export type ContractorStatus = (typeof CONTRACTOR_STATUSES)[number];

export const CONTRACTOR_STATUS_LABELS: Record<ContractorStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

// ─── Trade categories ───────────────────────────────────────────────────────
// Stored as a free-text `trade` column; this is the curated picklist. Always
// render via TRADE_LABELS, never the raw value.
export const CONTRACTOR_TRADES = [
  "plumbing",
  "electrical",
  "fire",
  "cleaning",
  "gardening",
  "lift",
  "building",
  "pest",
  "hvac",
  "security",
  "locksmith",
  "painting",
  "roofing",
  "other",
] as const;
export type ContractorTrade = (typeof CONTRACTOR_TRADES)[number];

export const CONTRACTOR_TRADE_LABELS: Record<ContractorTrade, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  fire: "Fire safety",
  cleaning: "Cleaning",
  gardening: "Gardening & grounds",
  lift: "Lift & elevator",
  building: "Building & general repairs",
  pest: "Pest control",
  hvac: "Heating & cooling",
  security: "Security",
  locksmith: "Locksmith",
  painting: "Painting",
  roofing: "Roofing",
  other: "Other",
};

export const CONTRACTOR_TRADE_OPTIONS = CONTRACTOR_TRADES.map((value) => ({
  value,
  label: CONTRACTOR_TRADE_LABELS[value],
}));

export function tradeLabel(trade: string | null | undefined): string {
  if (!trade) return "";
  return CONTRACTOR_TRADE_LABELS[trade as ContractorTrade] ?? trade;
}

// ─── Contractor input schema ────────────────────────────────────────────────
// Public-liability cover is mandatory (insurer, policy number, coverage limit,
// expiry). Primary contact requires at least one of phone/email , enforced
// with a superRefine so both fields are flagged together.
export const contractorSchema = z
  .object({
    business_name: z.string().trim().min(1, "Business name is required").max(200),
    abn: z.string().trim().max(20).nullable().optional(),
    gst_registered: z.boolean().default(false),
    // Primary contact
    contact_name: z.string().trim().min(1, "Primary contact name is required").max(200),
    contact_phone: z.string().trim().max(40).nullable().optional(),
    contact_email: z.string().trim().email("Enter a valid email").max(200).nullable().optional().or(z.literal("")),
    trade: z.string().trim().max(60).nullable().optional(),
    // Bank details (identifiers, optional). BSB is "XXX-XXX" (6 digits + dash);
    // account number capped at 9 digits.
    bank_name: z.string().trim().max(120).nullable().optional(),
    bsb: z.string().trim().max(7).nullable().optional(),
    account_number: z.string().trim().max(9).nullable().optional(),
    // Public liability insurance (mandatory)
    pl_insurer: z.string().trim().min(1, "Insurer is required").max(200),
    pl_policy_number: z.string().trim().min(1, "Policy number is required").max(120),
    pl_coverage_limit: z.number().positive("Coverage limit is required"),
    insurance_expiry: z.string().min(1, "Expiry date is required"),
    pl_document_url: z.string().trim().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(CONTRACTOR_STATUSES).default("active"),
  })
  .superRefine((val, ctx) => {
    const hasPhone = !!val.contact_phone && val.contact_phone.trim().length > 0;
    const hasEmail = !!val.contact_email && val.contact_email.trim().length > 0;
    if (!hasPhone && !hasEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add a phone number or an email for the primary contact",
        path: ["contact_phone"],
      });
    }
  });

export type ContractorInput = z.input<typeof contractorSchema>;

export interface ContractorRecord {
  id: string;
  business_name: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  trade: string | null;
  abn: string | null;
  gst_registered: boolean;
  bank_name: string | null;
  bsb: string | null;
  account_number: string | null;
  pl_insurer: string | null;
  pl_policy_number: string | null;
  pl_coverage_limit: number | null;
  pl_document_url: string | null;
  insurance_expiry: string | null;
  notes: string | null;
  status: ContractorStatus;
  created_at: string;
}
