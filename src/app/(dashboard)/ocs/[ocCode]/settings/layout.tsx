import { redirect } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { OCSettingsRail } from "./oc-settings-rail";

// Shared shell for every OC settings section. The rail renders once and stays
// put across navigations, so moving between sections only swaps the panel.
export default async function OCSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <OCSettingsRail ocCode={ocCode} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
