import { z } from "zod";

export const companySchema = z.object({
  name: z.string().min(2, "Company name is required"),
  // "Trading as" — optional alternate brand name (common for AU businesses).
  trading_as: z.string().optional(),
  // ABN is optional but if provided must be 11 digits (after stripping
  // whitespace). The UI strips for us, so we accept either form here.
  abn: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.replace(/\D/g, "").length === 11,
      { message: "ABN must be 11 digits" },
    ),
  address: z.string().min(3, "Company address is required"),
});

// Operating account (step 2 of onboarding) — where the management
// company receives its fees from each OC's trust account.
export const operatingAccountSchema = z.object({
  operating_account_name: z.string().min(2, "Account name is required"),
  operating_bsb: z
    .string()
    .min(6, "BSB must be 6 digits")
    .refine(
      (val) => val.replace(/\D/g, "").length === 6,
      { message: "BSB must be 6 digits" },
    ),
  operating_account_number: z
    .string()
    .min(6, "Account number must be at least 6 digits")
    .refine(
      (val) => /^\d{6,10}$/.test(val.replace(/\D/g, "")),
      { message: "Account number must be 6–10 digits" },
    ),
  operating_bank_name: z.string().optional(),
});

export type OperatingAccountFormValues = z.infer<typeof operatingAccountSchema>;

export type CompanyFormValues = z.infer<typeof companySchema>;

export const subdivisionSchema = z.object({
  plan_number: z.string().min(1, "Plan number is required"),
  name: z.string().min(2, "Subdivision name is required"),
  street: z.string().min(3, "Street address is required"),
  total_lots: z.coerce.number().min(2, "Minimum 2 lots required"),
  state: z.string().default("VIC"),
});

export type SubdivisionFormValues = z.infer<typeof subdivisionSchema>;

export const inviteRowSchema = z.object({
  email: z.string().email("Valid email required"),
  name: z.string().min(1, "Name is required"),
});

export const invitesSchema = z.object({
  invites: z.array(inviteRowSchema).min(1, "Add at least one invite"),
});

export type InviteRowValues = z.infer<typeof inviteRowSchema>;
export type InvitesFormValues = z.infer<typeof invitesSchema>;
