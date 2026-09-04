// Shared constants + types for insurance. Lives OUTSIDE the "use server"
// boundary, like funds-shared.ts, because a "use server" file may only export
// async functions: an exported object there is a runtime error on the very
// first render, not a build error, so it takes the whole page down.
//
// Anything a client component imports (labels, option lists, enums) belongs
// here. The server actions in actions/insurance.ts re-export the types for
// callers that already import from there.

export type PaymentFrequency = "annual" | "semi_annual" | "quarterly" | "monthly";

/** Never render the raw value: these are stored keys. */
export const PAYMENT_FREQUENCY_LABEL: Record<PaymentFrequency, string> = {
  annual: "Annually",
  semi_annual: "Every six months",
  quarterly: "Quarterly",
  monthly: "Monthly",
};

export const PAYMENT_FREQUENCY_OPTIONS = (
  Object.keys(PAYMENT_FREQUENCY_LABEL) as PaymentFrequency[]
).map((value) => ({ value, label: PAYMENT_FREQUENCY_LABEL[value] }));

export interface InsurancePolicy {
  id: string;
  oc_id: string;
  policy_type: string;
  provider: string;
  /** The broker who placed it, when one did. Usually who the manager
   *  actually rings, and not the same as the underwriter. */
  broker: string | null;
  policy_number: string | null;
  sum_insured: number | null;
  premium: number | null;
  excess: number | null;
  /** Annual or by instalment. Changes what the OC budgets each period, and
   *  a missed instalment can void cover. */
  payment_frequency: PaymentFrequency;
  start_date: string;
  end_date: string;
  document_url: string | null;
  /** The certificate of currency: the document owners, lenders and
   *  conveyancers actually ask for. Separate from the policy schedule
   *  because it is reissued on its own cycle. */
  certificate_of_currency_document_id: string | null;
  certificate_of_currency_expiry: string | null;
  status: string;
  created_at: string;
}
