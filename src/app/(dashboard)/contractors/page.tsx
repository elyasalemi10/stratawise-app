import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getContractors } from "@/lib/actions/contractors";
import { ContractorsContent } from "./contractors-content";

export default async function ContractorsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role === "lot_owner") redirect("/dashboard");

  const contractors = await getContractors();

  return <ContractorsContent contractors={contractors} />;
}
