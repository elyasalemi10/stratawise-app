import { redirect } from "next/navigation";

import { resolveSubdivisionFromCode } from "@/lib/subdivision-resolver";

// The manage page is no longer used — redirect to lots
export default async function ManageSubdivisionPage({
  params,
}: {
  params: Promise<{ subdivisionCode: string }>;
}) {
  const { subdivisionCode } = await params;
  const resolved = await resolveSubdivisionFromCode(subdivisionCode);
  if (!resolved) redirect("/dashboard");
  redirect(`/subdivisions/${subdivisionCode}/lots`);
}
