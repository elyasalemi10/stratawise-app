import { redirect } from "next/navigation";

// This app is served from the app.* subdomain. The marketing / waitlist site
// lives on the apex. Visiting the root of this app sends you straight into
// auth — signed-in users get bounced to /dashboard by middleware before
// this server component runs.
export default function RootPage() {
  redirect("/sign-in");
}
