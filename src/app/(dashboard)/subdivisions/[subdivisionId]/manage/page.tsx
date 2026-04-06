import { redirect } from "next/navigation";

// The manage page is no longer used — redirect to lots
export default async function ManageSubdivisionPage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  redirect(`/subdivisions/${subdivisionId}/lots`);
}
