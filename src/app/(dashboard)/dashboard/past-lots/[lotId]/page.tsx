import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { PastLotClient } from "./past-lot-client";

// Shell only: auth and redirect. Data comes from the client through
// useCachedData.
export default async function PastLotPage({
  params,
}: {
  params: Promise<{ lotId: string }>;
}) {
  const { lotId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  return <PastLotClient lotId={lotId} />;
}
