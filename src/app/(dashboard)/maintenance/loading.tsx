import { MaintenanceClient } from "./maintenance-client";

// Renders the REAL page component, not a skeleton.
//
// A loading.tsx is the only thing on screen while the server shell resolves,
// and a skeleton here overwrites content the tab already has: MaintenanceClient
// reads the client cache and paints the data you were looking at a moment
// ago, but it never got the chance, because this boundary shimmered over the
// top of it first and then handed over. Rendering the same component means
// the boundary shows cached content when there is some and the skeleton when
// there is not, which is the decision the component already knows how to
// make. The two mounts share one request (see use-cached-data).
export default function MaintenanceLoading() {
  return <MaintenanceClient />;
}
