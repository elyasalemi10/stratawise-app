// The name an Owners Corporation goes by on paper.
//
// `owners_corporations.name` is a NICKNAME. Managers set it so they can tell
// their OCs apart in a switcher ("Melia St", "Grace St"); it has no legal
// standing, it is not registered anywhere, and two firms managing the same
// plan would each invent their own. Putting it on a notice, a levy, a
// certificate or a minute is wrong: the document names an entity that does
// not exist by that name.
//
// The legal identity is the plan number. Under the Owners Corporations Act
// 2006 (Vic) an owners corporation created on a plan of subdivision is
// "Owners Corporation <n> PS<plan>", and where the plan carries only one it
// is simply "Owners Corporation PS<plan>".
//
// Rule of thumb: anything a lot owner receives uses this. Anything only a
// manager sees can use the nickname, which is the entire point of having one.

export interface OcNameParts {
  plan_number?: string | null;
  oc_number?: number | null;
  /** The manager's nickname. Only used as a last resort when a draft OC has
   *  no plan number yet, so a preview does not render a blank. */
  name?: string | null;
}

export function ocLegalName(oc: OcNameParts): string {
  const plan = (oc.plan_number ?? "").trim();
  if (!plan) return (oc.name ?? "").trim() || "Owners Corporation";

  const n = oc.oc_number ?? 1;
  return n > 1 ? `Owners Corporation ${n} ${plan}` : `Owners Corporation ${plan}`;
}
