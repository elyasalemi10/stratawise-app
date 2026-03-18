import { redirect } from "next/navigation";
import { requireSubdivisionAccess } from "@/lib/auth";
import { getSubdivision } from "@/lib/actions/subdivision";
import { SubdivisionProvider } from "@/lib/subdivision-context";

export default async function SubdivisionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;

  // Validate access
  try {
    await requireSubdivisionAccess(subdivisionId);
  } catch {
    redirect("/dashboard");
  }

  // Fetch subdivision data
  const subdivision = await getSubdivision(subdivisionId);
  if (!subdivision) {
    redirect("/dashboard");
  }

  return (
    <SubdivisionProvider subdivision={subdivision}>
      {children}
    </SubdivisionProvider>
  );
}
