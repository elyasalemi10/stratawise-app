"use server";

import { requireRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export interface BlogPostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  content_json: unknown;
  content_html: string | null;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "post";
}

export async function listBlogPosts(): Promise<BlogPostRow[]> {
  await requireRole(["super_admin"]);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Failed to load posts: ${error.message}`);
  return (data ?? []) as BlogPostRow[];
}

export async function getBlogPost(id: string): Promise<BlogPostRow | null> {
  await requireRole(["super_admin"]);
  const supabase = createServerClient();
  const { data } = await supabase.from("blog_posts").select("*").eq("id", id).maybeSingle();
  return (data as BlogPostRow | null) ?? null;
}

// Creates a blank draft and returns its id so the caller can navigate to the
// editor. Slug is derived + de-duplicated with a numeric suffix.
export async function createBlogPost(): Promise<{ id?: string; error?: string }> {
  const profile = await requireRole(["super_admin"]);
  const supabase = createServerClient();
  const base = slugify("untitled-post");
  const slug = `${base}-${Date.now().toString(36)}`;

  const { data, error } = await supabase
    .from("blog_posts")
    .insert({
      slug,
      title: "Untitled post",
      content_json: {},
      status: "draft",
      author_profile_id: profile.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to create post" };
  revalidatePath("/admin/blog");
  return { id: data.id };
}

export interface SaveBlogPostInput {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  content_json: unknown;
  content_html: string;
}

export async function saveBlogPost(input: SaveBlogPostInput): Promise<{ error?: string }> {
  await requireRole(["super_admin"]);
  const supabase = createServerClient();
  const title = input.title.trim() || "Untitled post";
  const slug = slugify(input.slug || title);

  // Keep slug unique (excluding this post).
  const { data: clash } = await supabase
    .from("blog_posts")
    .select("id")
    .eq("slug", slug)
    .neq("id", input.id)
    .maybeSingle();
  const finalSlug = clash ? `${slug}-${input.id.slice(0, 6)}` : slug;

  const { error } = await supabase
    .from("blog_posts")
    .update({
      title,
      slug: finalSlug,
      excerpt: input.excerpt?.trim() || null,
      cover_image_url: input.cover_image_url?.trim() || null,
      content_json: input.content_json ?? {},
      content_html: input.content_html ?? "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/blog");
  return {};
}

export async function setBlogPostStatus(
  id: string,
  status: "draft" | "published",
): Promise<{ error?: string }> {
  await requireRole(["super_admin"]);
  const supabase = createServerClient();
  const { error } = await supabase
    .from("blog_posts")
    .update({
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/blog");
  return {};
}

export async function deleteBlogPost(id: string): Promise<{ error?: string }> {
  await requireRole(["super_admin"]);
  const supabase = createServerClient();
  const { error } = await supabase.from("blog_posts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/blog");
  return {};
}
