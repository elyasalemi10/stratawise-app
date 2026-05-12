// The new-oc wizard is pure client form state — there's nothing
// to load before it renders. Without this file, Next.js falls back to
// /ocs/loading.tsx (which shows oc-list skeletons) when
// navigating to /ocs/new from outside the segment. Return null
// so no skeleton flashes; the form renders as soon as the JS lands.
export default function Loading() {
  return null;
}
