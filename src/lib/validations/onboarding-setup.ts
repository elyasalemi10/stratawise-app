import { z } from "zod";

export const companySchema = z.object({
  name: z.string().min(2, "Company name is required"),
  // ABN is optional but if provided must be 11 digits (after stripping
  // whitespace). The UI strips for us, so we accept either form here.
  abn: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.replace(/\D/g, "").length === 11,
      { message: "ABN must be 11 digits" },
    ),
  address: z.string().min(3, "Address is required"),
});

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
