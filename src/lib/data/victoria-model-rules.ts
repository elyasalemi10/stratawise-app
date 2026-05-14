// Victoria's Owners Corporation Model Rules — Schedule 2 of the Owners
// Corporations Regulations 2018. These apply to every OC that has NOT
// registered its own custom rules. The wizard's page 6 displays this list so
// the manager sees exactly what they're agreeing to.
//
// Source: legislation.vic.gov.au/in-force/statutory-rules/owners-corporations-regulations-2018
// Rule bodies are condensed to the operative clause — the full statutory
// wording is referenced when needed elsewhere; this is for at-a-glance review.

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
      "Lot owners and occupiers must not use the lot or common property in a manner that creates a health, safety or security risk to other occupiers, visitors, or contractors. Includes obstructing fire-safety equipment or exit routes and tampering with security devices on common property.",
  },
  {
    rule_number: "2",
    heading: "Lots used for residential purposes",
    body:
      "Lots zoned residential under the plan of subdivision must be used principally for residential purposes. Short-stay arrangements remain permitted unless the OC has additional registered rules limiting them.",
  },
  {
    rule_number: "3",
    heading: "Vehicles and parking",
    body:
      "Vehicles parked on common property must not block driveways, fire routes, accessible parking, or visitor parking outside the conditions of use posted by the OC. The committee may remove or tow-away vehicles parked in breach.",
  },
  {
    rule_number: "4",
    heading: "Damage to common property",
    body:
      "An owner or occupier must not damage, alter, deface, or remove common property without the OC's written consent. Repair costs for damage caused by an owner, occupier, or their invitee are recoverable from that owner.",
  },
  {
    rule_number: "5",
    heading: "Behaviour of owners, occupiers and invitees",
    body:
      "Owners, occupiers and their invitees must not behave in a manner that unreasonably interferes with the peaceful enjoyment of another occupier. This covers excessive noise, harassment, intoxicated behaviour in common areas, and abusive conduct towards the manager or committee.",
  },
  {
    rule_number: "6",
    heading: "Noise and other nuisance control",
    body:
      "Noise audible to another lot between 10pm and 7am must be minimised. Music, power tools, vacuuming, and similar activities follow the times posted by the OC committee, in line with EPA Victoria's residential noise schedule.",
  },
  {
    rule_number: "7",
    heading: "Keeping of animals",
    body:
      "Owners and occupiers may keep an animal only with the OC's written consent. The OC must not unreasonably refuse consent. Existing assistance dogs registered with the owner are permitted without further consent.",
  },
];
