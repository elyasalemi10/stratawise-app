// Victoria's Owners Corporation Model Rules — Schedule 2 of the Owners
// Corporations Regulations 2018. These apply to every OC that has NOT
// registered its own custom rules. The wizard's page 6 displays this list so
// the manager sees exactly what they're agreeing to.
//
// Source: legislation.vic.gov.au/in-force/statutory-rules/owners-corporations-regulations-2018
// The schedule has 7 top-level headings. Body text below is a paraphrased
// summary of each heading's operative clauses for at-a-glance display — the
// full statutory wording lives in the source above and is what governs.

export interface ModelRule {
  rule_number: string;
  heading: string;
  body: string;
}

export const VICTORIA_MODEL_RULES: ModelRule[] = [
  {
    rule_number: "1",
    heading: "Health, safety and security",
    body:
      "Lot owners, occupiers, and their guests must not use the lot or common property in a way that creates a health, safety or security risk for other occupiers. Includes safe storage of flammable liquids and dangerous substances, and not interfering with fire-safety equipment.",
  },
  {
    rule_number: "2",
    heading: "Management and administration",
    body:
      "Covers the metering of services supplied to lots and the OC's duty to keep its records, financial statements, and registers in a state that lets it administer the common property efficiently.",
  },
  {
    rule_number: "3",
    heading: "Use of common property",
    body:
      "Owners and occupiers must use common property reasonably, must not park vehicles so as to obstruct driveways or fire routes, must not damage or alter common property without the OC's written consent, and must not behave in a way that interferes with another occupier's peaceful enjoyment.",
  },
  {
    rule_number: "4",
    heading: "Lots",
    body:
      "An owner or occupier must not change the use of a lot in a way that increases the OC's insurance premium or risk. The external appearance of a lot must not be altered without the OC's written consent.",
  },
  {
    rule_number: "5",
    heading: "Behaviour of persons",
    body:
      "Owners, occupiers and their guests must not behave in a way that unreasonably interferes with another occupier — including excessive noise, harassment, intoxicated behaviour in common areas, and abusive conduct toward the manager or committee.",
  },
  {
    rule_number: "6",
    heading: "Disputes and complaints",
    body:
      "The OC's grievance procedure: complaints must be in writing, copied to all parties, and the OC must try to resolve the dispute internally before referring it to Consumer Affairs Victoria or VCAT.",
  },
  {
    rule_number: "7",
    heading: "Notices and documents",
    body:
      "Notices and documents addressed to the OC must be served on the secretary or the manager. Owners must keep the OC informed of the address at which they will accept service.",
  },
];
