"use client";

import { createContext, useContext } from "react";

export interface SubdivisionData {
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

const SubdivisionContext = createContext<SubdivisionData | null>(null);

export function SubdivisionProvider({
  subdivision,
  children,
}: {
  subdivision: SubdivisionData;
  children: React.ReactNode;
}) {
  return (
    <SubdivisionContext.Provider value={subdivision}>
      {children}
    </SubdivisionContext.Provider>
  );
}

export function useSubdivision() {
  const ctx = useContext(SubdivisionContext);
  if (!ctx) {
    throw new Error("useSubdivision must be used within a SubdivisionProvider");
  }
  return ctx;
}

export function useOptionalSubdivision() {
  return useContext(SubdivisionContext);
}

/** Convenience for client components that just need the URL code. */
export function useSubdivisionCode(): string {
  return useSubdivision().short_code;
}
