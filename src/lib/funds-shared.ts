// Shared constants + types for the funds feature. Lives outside the
// "use server" boundary so client code can import the labels and enum
// values directly (server actions in funds.ts can re-export them with
// async wrappers if needed).

export type FundKind = "administrative" | "capital_works" | "maintenance_plan" | "custom";

export const FUND_KIND_LABEL: Record<FundKind, string> = {
  administrative: "Administrative Fund",
  capital_works: "Capital Works Fund",
  maintenance_plan: "Maintenance Plan Fund",
  custom: "Custom",
};
