import { SectionHeader } from "@/components/shared/section-header";
import { CompanySection } from "../section-clients";

// Renders the REAL section, not a skeleton.
//
// A loading.tsx is the only thing on screen while the server shell resolves,
// and a skeleton here overwrites content the tab already has: CompanySection reads
// the client cache and paints the settings you were looking at a moment ago,
// but it never got the chance, because this boundary shimmered over the top
// of it first and then handed over. Rendering the same component means the
// boundary shows cached content when there is some and the skeleton when
// there is not, which is the decision the section already knows how to make.
// The two mounts share one request (see use-cached-data).
export default function Loading() {
  return (
    <>
      <SectionHeader title="Company" />
      <CompanySection />
    </>
  );
}
