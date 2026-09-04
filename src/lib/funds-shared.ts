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

// The Maintenance Plan Fund is gone. It is a tier-1 obligation (a 10-year
// maintenance plan), and this platform is built for tier 4 and 5, so it was
// an option on every fund, budget and levy screen that no OC here would ever
// pick. Admin plus custom covers what these OCs actually run.
export type FundKind = "admin" | "custom";

export const FUND_KIND_LABEL: Record<FundKind, string> = {
  admin: "Admin Fund",
  custom: "Custom",
};
