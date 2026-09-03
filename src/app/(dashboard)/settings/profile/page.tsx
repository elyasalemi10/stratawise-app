import { redirect } from "next/navigation";
import { SectionHeader } from "@/components/shared/section-header";
import { getCurrentProfile } from "@/lib/auth";
import { ProfileTab } from "../profile-tab";

export default async function Page() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  return (
    <>
      <SectionHeader title="My Profile" />
      <ProfileTab profile={profile} />
    </>
  );
}
