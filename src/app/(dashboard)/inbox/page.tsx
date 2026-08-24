import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { InboxClient } from "./inbox-client";

// Server shell: auth and redirect only. Data comes from the client through
// useCachedData.
export default async function InboxPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  return <InboxClient />;
}
