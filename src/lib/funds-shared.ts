// Shared constants + types for the funds feature. Lives outside the
// "use server" boundary so client code can import the labels and enum
// values directly (server actions in funds.ts can re-export them with
// async wrappers if needed).
//
// VIC nomenclature: the Owners Corporations Act 2006 recognises an
// operating fund (day-to-day) and , for tier 1/2 OCs , a maintenance
// fund. There is no "capital works fund" in Victoria , that's NSW.

export type FundKind = "operating" | "maintenance_plan" | "custom";

export const FUND_KIND_LABEL: Record<FundKind, string> = {
  operating: "Operating Fund",
  maintenance_plan: "Maintenance Plan Fund",
  custom: "Custom",
};
