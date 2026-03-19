import { z } from "zod";

// ─── Step 1: General Details ────────────────────────────────────

export const step1Schema = z.object({
  subdivision_type: z.enum(["strata", "company", "neighbourhood_association"]),
  plan_number: z
    .string()
    .min(1, "Plan number is required")
    .transform((v) => v.toUpperCase()),
  management_start_date: z.string().min(1, "Start date is required"),
  name: z.string().min(2, "Subdivision name is required"),
  street_number: z.string().min(1, "Street number is required"),
  street_name: z.string().min(2, "Street name is required"),
  state: z.enum(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]),
  suburb: z.string().min(1, "Please select a suburb"),
  common_property_description: z.string().optional(),
  abn: z
    .string()
    .optional()
    .transform((v) => v?.replace(/\s/g, "") || undefined),
  tfn: z
    .string()
    .optional()
    .transform((v) => v?.replace(/\s/g, "") || undefined),
});

// ─── Step 2: Advanced Settings ──────────────────────────────────

export const step2Schema = z.object({
  financial_year_start_month: z.coerce.number().min(1).max(12),
  levy_year_start_month: z.coerce.number().min(1).max(12),
  levies_per_year: z.coerce.number().refine((v) => [1, 2, 4, 6, 12].includes(v), {
    message: "Must be 1, 2, 4, 6, or 12",
  }),
});

// ─── Step 3: Banking ────────────────────────────────────────────

export const step3Schema = z.object({
  bank_connection_type: z.enum(["basiq", "manual"]),
  bank_name: z.string().min(1, "Please select a bank"),
  account_name: z.string().min(1, "Account name is required"),
  bsb: z
    .string()
    .min(1, "BSB is required")
    .refine(
      (v) => {
        const digits = v.replace(/\D/g, "");
        return digits.length === 6;
      },
      { message: "BSB must be 6 digits" }
    )
    .transform((v) => {
      const digits = v.replace(/\D/g, "");
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}`;
    }),
  account_number: z
    .string()
    .min(1, "Account number is required")
    .max(10, "Maximum 10 characters")
    .regex(/^\d+$/, "Account number must be digits only"),
});

// ─── Step 4: Lots ───────────────────────────────────────────────

export const lotRowSchema = z.object({
  lot_number: z.string().min(1, "Lot number is required"),
  unit_number: z.string().optional(),
  owner_type: z.enum(["individual", "company"]),
  owner_name: z.string().min(1, "Owner name is required"),
  owner_email: z
    .string()
    .email("Invalid email")
    .optional()
    .or(z.literal("")),
  owner_phone: z.string().optional(),
  lot_entitlement: z.coerce.number().min(0, "Must be 0 or more"),
});

export const step4Schema = z.object({
  total_lots: z.coerce.number().min(2, "Minimum 2 lots required"),
  lots: z.array(lotRowSchema),
});

// ─── Step 5: Opening Balances ───────────────────────────────────

export const step5Schema = z.object({
  admin_opening_balance: z.coerce.number().min(0),
  capital_works_opening_balance: z.coerce.number().min(0),
  opening_balance_date: z.string().min(1, "Opening balance date is required"),
});

// ─── Types ──────────────────────────────────────────────────────

export type Step1Values = z.infer<typeof step1Schema>;
export type Step2Values = z.infer<typeof step2Schema>;
export type Step3Values = z.infer<typeof step3Schema>;
export type Step4Values = z.infer<typeof step4Schema>;
export type LotRowValues = z.infer<typeof lotRowSchema>;
export type Step5Values = z.infer<typeof step5Schema>;
