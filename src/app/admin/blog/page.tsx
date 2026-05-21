import { redirect } from "next/navigation";
import { evaluateSuperAdminGate } from "@/lib/admin-auth";
import { listBlogPosts } from "@/lib/actions/blog";
import { BlogList } from "./blog-list";

export default async function AdminBlogPage() {
  const gate = await evaluateSuperAdminGate();
  if (gate.kind === "redirect") redirect(gate.to);

  const posts = await listBlogPosts();
  return <BlogList posts={posts} />;
}
