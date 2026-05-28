import { z } from "zod";

export const fundTransferSchema = z.object({
  oc_id: z.string().uuid(),
  from_bank_account_id: z.string().uuid(),
  to_bank_account_id: z.string().uuid(),
  amount: z.number().positive("Amount must be greater than zero"),
  transfer_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  reason: z.string().max(500, "Reason too long").nullable().optional(),
}).refine((v) => v.from_bank_account_id !== v.to_bank_account_id, {
  message: "Choose two different fund accounts",
  path: ["to_bank_account_id"],
});

export type FundTransferInput = z.input<typeof fundTransferSchema>;

export interface FundTransferRecord {
  id: string;
  oc_id: string;
  from_fund: "operating" | "maintenance_plan";
  to_fund: "operating" | "maintenance_plan";
  amount: number;
  transfer_date: string;
  reason: string | null;
  created_at: string;
}
