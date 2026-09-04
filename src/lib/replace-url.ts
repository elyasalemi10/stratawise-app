/**
 * Rewrite the current URL, but only while the page that owns it is still on
 * screen.
 *
 * Several pages keep their tab in the URL with history.replaceState, and
 * build the path from props: `/ocs/${ocCode}/lots/${lotId}?tab=owner`. That
 * is fine while you are on that lot. It is not fine when the call lands a
 * moment after you clicked away , React effects and state updaters can run
 * after a navigation has started, and replaceState does not care that the
 * page has changed. The address bar snaps back to the page you just left,
 * which reads as being yanked backwards while clicking through quickly.
 *
 * So: compare against where the browser actually is, and drop the write if
 * it no longer belongs there. Losing a tab-in-URL update on a page you have
 * already left costs nothing.
 */
export function replaceUrlIfOn(ownerPathname: string, nextUrl: string): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== ownerPathname) return;
  window.history.replaceState(null, "", nextUrl);
}
