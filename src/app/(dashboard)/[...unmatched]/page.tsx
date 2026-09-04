import { notFound } from "next/navigation";

// Catch-all so an unmatched URL renders INSIDE the app shell.
//
// Next's root not-found.tsx renders outside every layout, so a signed-in
// manager who mistyped a URL lost the sidebar, the header and the OC
// switcher , the app appeared to have fallen over rather than a link being
// wrong. A catch-all at this level is matched only after every real route
// has been tried, and calling notFound() from inside it renders
// (dashboard)/not-found.tsx within the (dashboard) layout: normal page,
// normal chrome, and the content area says it could not find anything.
//
// The root not-found.tsx stays for URLs outside the shell, where there is no
// sidebar to show.
export default function UnmatchedDashboardRoute() {
  notFound();
}
