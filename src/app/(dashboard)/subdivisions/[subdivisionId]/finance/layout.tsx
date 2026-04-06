import { getSubdivision } from "@/lib/actions/subdivision";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { FinanceNav } from "./finance-nav";

export default async function FinanceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  const [subdivision, profile] = await Promise.all([
    getSubdivision(subdivisionId),
    getCurrentProfile(),
  ]);

  if (!subdivision) redirect("/dashboard");
  if (profile?.role === "lot_owner") redirect(`/subdivisions/${subdivisionId}/dashboard`);

  return (
    <div className="space-y-6">
      <FinanceNav subdivisionId={subdivisionId} subdivisionName={subdivision.name} />
      {children}
    </div>
  );
}
