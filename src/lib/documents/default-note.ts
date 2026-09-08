/**
 * What a document the APP filed should say it is.
 *
 * A manager who uploads a file writes their own note. Documents the platform
 * files for them, during OC creation or when a certificate is read, arrive
 * with an empty note and a filename like "scan_0043.pdf", so the grid shows a
 * wall of unlabelled cards for exactly the documents the manager never chose
 * to upload and therefore never thinks to describe.
 *
 * These are starting points, not decoration: the manager can edit or clear
 * any of them, and a note they have already written is never overwritten.
 */
export function defaultDocumentNote(
  category: string,
  context?: {
    policyNumber?: string | null;
    provider?: string | null;
    planNumber?: string | null;
    periodLabel?: string | null;
    reference?: string | null;
  },
): string | null {
  const trim = (v: string | null | undefined) => (v ?? "").trim();
  const suffix = (v: string | null | undefined) => (trim(v) ? ` , ${trim(v)}` : "");

  switch (category) {
    case "certificate_of_currency":
      // The policy number is what anyone looking for a certificate actually
      // has in front of them.
      return `Certificate of Currency${suffix(context?.policyNumber ?? context?.provider)}`;
    case "insurance_policy":
      return `Insurance policy${suffix(context?.provider ?? context?.policyNumber ?? context?.planNumber)}`;
    case "plan_of_subdivision":
      return `Plan of Subdivision${suffix(context?.planNumber)}`;
    case "oc_rules":
      return "Owners Corporation rules";
    case "levy_notice":
      return `Levy notice${suffix(context?.reference ?? context?.periodLabel)}`;
    case "meeting_notice":
      return `Meeting notice${suffix(context?.periodLabel)}`;
    case "meeting_minutes":
      return `Meeting minutes${suffix(context?.periodLabel)}`;
    case "settlement":
      return "Settlement statement";
    case "compliance":
      return "Compliance certificate";
    default:
      // Anything the manager uploaded themselves. They know what it is, and
      // guessing from a category slug would put a worse label on it than
      // none at all.
      return null;
  }
}
