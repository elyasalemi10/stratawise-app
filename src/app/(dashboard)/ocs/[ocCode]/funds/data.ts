"use server";

import { getFunds } from "@/lib/actions/funds";
import { requireOCAccess } from "@/lib/auth";

export interface FundsPageData {
  funds: Awaited<ReturnType<typeof getFunds>>;
}

export async function getFundsPageData(ocId: string): Promise<FundsPageData> {
  await requireOCAccess(ocId);
  return { funds: await getFunds(ocId) };
}
