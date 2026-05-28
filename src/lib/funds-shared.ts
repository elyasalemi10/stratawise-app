// Shared constants + types for the funds feature. Lives outside the
// "use server" boundary so client code can import the labels and enum
// values directly (server actions in funds.ts can re-export them with
// async wrappers if needed).
//
// Naming distinction (important):
//   - "Admin Fund" is the FUND label (the default day-to-day fund).
//   - "Operating Account" is the BANK ACCOUNT label that primarily holds
//     the admin fund's money (and gets printed on every levy notice).
// They are tightly linked but separate concepts: one fund kind, one bank
// account type.

export type FundKind = "admin" | "maintenance_plan" | "custom";

export const FUND_KIND_LABEL: Record<FundKind, string> = {
  admin: "Admin Fund",
  maintenance_plan: "Maintenance Plan Fund",
  custom: "Custom",
};
