import { OCsClient } from "./ocs-client";

// Lives in a (list) route group on purpose.
//
// A loading.tsx wraps its segment AND everything under it. Sitting directly
// in /ocs, this one covered /ocs/[ocCode] too, so opening an OC showed the
// OC-list layout first and then the OC overview one , two different loading
// frames back to back for one navigation.
//
// The group scopes it to this page. The URL is unchanged: route groups are
// not path segments.

// Renders the REAL page component, not a skeleton.
//
// A loading.tsx is the only thing on screen while the server shell resolves,
// and a skeleton here overwrites content the tab already has: OCsClient
// reads the client cache and paints the data you were looking at a moment
// ago, but it never got the chance, because this boundary shimmered over the
// top of it first and then handed over. Rendering the same component means
// the boundary shows cached content when there is some and the skeleton when
// there is not, which is the decision the component already knows how to
// make. The two mounts share one request (see use-cached-data).
export default function OCsLoading() {
  return <OCsClient />;
}
