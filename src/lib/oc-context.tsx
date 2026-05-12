"use client";

import { createContext, useContext } from "react";

export interface OCData {
  id: string;
  short_code: string;
  name: string;
  plan_number: string;
  address: string;
  total_lots: number;
  state: string;
  oc_tier: number | null;
  status: string;
  management_company_id: string;
  financial_year_start_month: number;
  billing_cycle: string;
  abn: string | null;
  bank_bsb: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
}

const OCContext = createContext<OCData | null>(null);

export function OCProvider({
  oc,
  children,
}: {
  oc: OCData;
  children: React.ReactNode;
}) {
  return (
    <OCContext.Provider value={oc}>
      {children}
    </OCContext.Provider>
  );
}

export function useOC() {
  const ctx = useContext(OCContext);
  if (!ctx) {
    throw new Error("useOC must be used within a OCProvider");
  }
  return ctx;
}

export function useOptionalOC() {
  return useContext(OCContext);
}

/** Convenience for client components that just need the URL code. */
export function useOCCode(): string {
  return useOC().short_code;
}
