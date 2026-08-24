import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { OCsClient } from "./ocs-client";

// Server shell: auth and redirect only. Data comes from the client through
// useCachedData.
export default async function OCsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  return <OCsClient />;
}
