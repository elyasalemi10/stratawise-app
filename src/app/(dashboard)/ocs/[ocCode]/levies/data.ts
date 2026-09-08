"use server";

import { getLevyBatches } from "@/lib/actions/levy";
import { requireOCAccess } from "@/lib/auth";
import type { LevyBatchRow } from "./levies-table";

export interface LeviesPageData {
  batches: LevyBatchRow[];
}

export async function getLeviesPageData(ocId: string): Promise<LeviesPageData> {
  await requireOCAccess(ocId);

  const batches = await getLevyBatches(ocId);

  return {
    batches: batches.map((b) => ({
      id: b.id,
      short_code: (b as { short_code?: string | null }).short_code ?? null,
      financial_year: b.financial_year,
      fund_type: b.fund_type,
      period_label: b.period_label,
      due_date: b.due_date,
      total_amount: b.total_amount,
      status: b.status,
      is_special: b.is_special,
    })),
  };
}
