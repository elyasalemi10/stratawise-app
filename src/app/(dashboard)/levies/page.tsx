import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { OwnerLeviesClient } from "./owner-levies-client";

// Shell only: auth and redirects. Data comes from the client through
// useCachedData.
export default async function LeviesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "lot_owner") redirect("/dashboard");

  return <OwnerLeviesClient />;
}
