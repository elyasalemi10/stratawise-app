// This route only ever redirects to the lots page, so there is nothing to
// load and nothing to shimmer. Rendering null keeps the redirect instant
// instead of flashing a skeleton for a page that is never shown.
export default function Loading() {
  return null;
}
