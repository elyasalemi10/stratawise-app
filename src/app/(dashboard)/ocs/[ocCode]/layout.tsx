import { redirect } from "next/navigation";
import { requireOCAccess } from "@/lib/auth";
import { getOC } from "@/lib/actions/oc";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { OCProvider } from "@/lib/oc-context";

export default async function OCLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;

  // Resolve short_code → UUID once at the page boundary. Server actions
  // continue to consume the UUID directly (no API change).
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;

  // Validate access
  try {
    await requireOCAccess(ocId);
  } catch {
    redirect("/dashboard");
  }

  // Fetch oc data
  const oc = await getOC(ocId);
  if (!oc) {
    redirect("/dashboard");
  }

  return (
    <OCProvider oc={oc}>
      {children}
    </OCProvider>
  );
}
