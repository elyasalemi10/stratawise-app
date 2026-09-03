import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { ProfileTab } from "../profile-tab";

export default async function Page() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  return <ProfileTab profile={profile} />;
}
