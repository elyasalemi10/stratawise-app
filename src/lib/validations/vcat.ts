import { z } from "zod";

// Manager-supplied inputs collected before generating a VCAT pack, so the
// Summary of Proofs is complete (no "(insert)" placeholders). `acknowledged`
// gates generation , the manager confirms this isn't legal advice.
export const vcatPackInputsSchema = z.object({
  interest_resolution: z.boolean().default(false),
  interest_resolution_date: z.string().nullable().optional(),
  reasonable_costs: z.number().nonnegative().default(0),
  reasonable_costs_details: z.string().trim().max(1000).nullable().optional(),
  costs_in_proceeding: z.number().nonnegative().default(0),
  special_resolution: z.boolean().default(false),
  respondent_is_current_owner: z.boolean().default(true),
  acknowledged: z.literal(true),
});

export type VcatPackInputs = z.input<typeof vcatPackInputsSchema>;
export type VcatPackInputsParsed = z.output<typeof vcatPackInputsSchema>;
