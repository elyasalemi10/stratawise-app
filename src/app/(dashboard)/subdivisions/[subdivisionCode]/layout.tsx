import { redirect } from "next/navigation";
import { requireSubdivisionAccess } from "@/lib/auth";
import { getSubdivision } from "@/lib/actions/subdivision";
import { resolveSubdivisionFromCode } from "@/lib/subdivision-resolver";
import { SubdivisionProvider } from "@/lib/subdivision-context";

export default async function SubdivisionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ subdivisionCode: string }>;
}) {
  const { subdivisionCode } = await params;

  // Resolve short_code → UUID once at the page boundary. Server actions
  // continue to consume the UUID directly (no API change).
  const resolved = await resolveSubdivisionFromCode(subdivisionCode);
  if (!resolved) redirect("/dashboard");
  const subdivisionId = resolved.id;

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
