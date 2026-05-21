import { redirect } from "next/navigation";
import { evaluateSuperAdminGate } from "@/lib/admin-auth";
import { getBlogPost } from "@/lib/actions/blog";
import { BlogEditor } from "@/components/blog/blog-editor";

export default async function AdminBlogEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const gate = await evaluateSuperAdminGate();
  if (gate.kind === "redirect") redirect(gate.to);

  const { id } = await params;
  const post = await getBlogPost(id);
  if (!post) redirect("/admin/blog");

  return <BlogEditor post={post} />;
}
