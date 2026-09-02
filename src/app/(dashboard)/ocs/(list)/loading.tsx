import { OCsSkeleton } from "./ocs-skeleton";

// Lives in a (list) route group on purpose.
//
// A loading.tsx wraps its segment AND everything under it. Sitting directly
// in /ocs, this one covered /ocs/[ocCode] too, so opening an OC showed the
// OC-list card skeleton first and then the OC overview skeleton , two
// different shimmering layouts back to back for one navigation.
//
// The group scopes it to this page. The URL is unchanged: route groups are
// not path segments.

// Same skeleton the client renders, so the handover from this boundary to
// OCsClient is continuous rather than a blank frame.
export default function OCsLoading() {
  return <OCsSkeleton />;
}
