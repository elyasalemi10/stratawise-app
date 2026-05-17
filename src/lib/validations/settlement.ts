import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z.string().regex(ISO_DATE, "Invalid date");

export const applySettlementSchema = z.object({
  // Optional — when null, the settlement is being entered manually without a
  // Notice of Acquisition PDF. The action then skips the document checks and
  // records the settlement against the lot directly.
  documentId: z.string().uuid().nullable().optional(),
  lotId: z.string().uuid(),
  newOwner: z.object({
    name: z.string().trim().min(1, "Name is required").max(200),
    // Email is optional — wizard contract per CLAUDE.md treats postal address
    // as the mandatory contact channel. When supplied it must still parse as
    // an email so noisy "n/a"-style input is rejected up-front.
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(200)
      .optional()
      .transform((v) => (v ? v : ""))
      .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
        message: "A valid email is required",
      }),
    phone: z.string().trim().max(50).nullable().optional().transform((v) => v || null),
    postalAddress: z
      .string()
      .trim()
      .min(1, "Postal address is required")
      .max(500),
    dateOfBirth: isoDate.nullable().optional().transform((v) => v || null),
  }),
  settlementDate: isoDate,
  // Manager confirms even when lot/plan don't match the PDF.
  acknowledgeMismatch: z.boolean().default(false),
});

export type ApplySettlementInput = z.infer<typeof applySettlementSchema>;

// ─── Ownership-history wire shape (used by lot detail + past lots) ──

export interface OwnershipHistoryEntry {
  id: string;
  profileId: string;
  name: string | null;
  email: string | null;
  joinedAt: string;
  leftAt: string | null;
  isPrimaryContact: boolean;
  isFinancial: boolean;
  settlementDocument: {
    id: string;
    fileName: string;
    publicUrl: string | null;
  } | null;
}
