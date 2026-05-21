"use server";

import { requireRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

// The admin blog authors into the shared `posts` schema that the marketing
// site renders (full SEO: seo_*, og_*, twitter_*, canonical, robots,
// reading time, author/category/tags). Body is stored as HTML
// (body_format = 'html') from the TipTap editor.

export interface BlogTag { id: string; name: string; slug: string }

export interface BlogPostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  cover_image_width: number | null;
  cover_image_height: number | null;
  cover_image_caption: string | null;
  category_id: string | null;
  status: "draft" | "scheduled" | "published" | "archived";
  published_at: string | null;
  reading_time_minutes: number | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[] | null;
  canonical_url: string | null;
  robots_index: boolean;
  robots_follow: boolean;
  updated_at: string;
  // joined
  tags?: BlogTag[];
}

function slugify(input: string): string {
  return (
    input.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80) ||
    "post"
  );
}

// Words / 200 wpm, min 1. Strips HTML tags first.
function readingTime(html: string): number {
  const text = (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;
  return Math.max(1, Math.round(words / 200));
}

// Find or create the authors row for the signed-in admin (keyed by email).
// posts.author_id is NOT NULL, so every post needs one.
async function ensureAuthorId(): Promise<string> {
  const profile = await requireRole(["super_admin"]);
  const supabase = createServerClient();
  const email = profile.email ?? null;
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "StrataWise";

  if (email) {
    const { data: existing } = await supabase.from("authors").select("id").eq("email", email).maybeSingle();
    if (existing) return existing.id as string;
  }
  const baseSlug = slugify(name);
  const { data, error } = await supabase
    .from("authors")
    .insert({ slug: `${baseSlug}-${Date.now().toString(36)}`, name, email })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create author");
  return data.id as string;
}

export async function listBlogPosts(): Promise<BlogPostRow[]> {
  await requireRole(["super_admin"]);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("posts")
    .select("id, slug, title, excerpt, status, published_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Failed to load posts: ${error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any as BlogPostRow[];
}

export async function getBlogPost(id: string): Promise<BlogPostRow | null> {
  await requireRole(["super_admin"]);
  const supabase = createServerClient();
  const { data } = await supabase
    .from("posts")
    .select("*, post_tags ( tag:tags ( id, name, slug ) )")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = data as any;
  const tags: BlogTag[] = (raw.post_tags ?? []).map((r: { tag: BlogTag | null }) => r.tag).filter(Boolean);
  delete raw.post_tags;
  return { ...raw, tags } as BlogPostRow;
}

export async function createBlogPost(): Promise<{ id?: string; error?: string }> {
  await requireRole(["super_admin"]);
  const supabase = createServerClient();
  let authorId: string;
  try {
    authorId = await ensureAuthorId();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to resolve author" };
  }
  const { data, error } = await supabase
    .from("posts")
    .insert({
      slug: `untitled-post-${Date.now().toString(36)}`,
      title: "Untitled post",
      body: "",
      body_format: "html",
      author_id: authorId,
      status: "draft",
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
  body: string; // HTML
  cover_image_url: string | null;
  cover_image_alt: string | null;
  cover_image_width: number | null;
  cover_image_height: number | null;
  cover_image_caption: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[];
  canonical_url: string | null;
  robots_index: boolean;
  robots_follow: boolean;
  reading_time_minutes: number | null;
  tags: string[]; // tag names
}

export async function saveBlogPost(input: SaveBlogPostInput): Promise<{ error?: string }> {
  await requireRole(["super_admin"]);
  const supabase = createServerClient();
  const title = input.title.trim() || "Untitled post";
  const slug = slugify(input.slug || title);

  // Keep slug unique across posts.
  const { data: clash } = await supabase
    .from("posts").select("id").eq("slug", slug).neq("id", input.id).maybeSingle();
  const finalSlug = clash ? `${slug}-${input.id.slice(0, 6)}` : slug;

  const { error } = await supabase
    .from("posts")
    .update({
      title,
      slug: finalSlug,
      excerpt: input.excerpt?.trim() || null,
      body: input.body ?? "",
      body_format: "html",
      cover_image_url: input.cover_image_url?.trim() || null,
      cover_image_alt: input.cover_image_alt?.trim() || null,
      cover_image_width: input.cover_image_width,
      cover_image_height: input.cover_image_height,
      cover_image_caption: input.cover_image_caption?.trim() || null,
      // Stored as overrides; the marketing site falls back to title/excerpt
      // when these are null, so empty = "use the sensible default".
      seo_title: input.seo_title?.trim() || null,
      seo_description: input.seo_description?.trim() || null,
      seo_keywords: input.seo_keywords.length ? input.seo_keywords : null,
      canonical_url: input.canonical_url?.trim() || null,
      robots_index: input.robots_index,
      robots_follow: input.robots_follow,
      reading_time_minutes: input.reading_time_minutes ?? readingTime(input.body),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { error: error.message };

  // Replace tags: find-or-create each by slug, then rewrite the join rows.
  const tagIds: string[] = [];
  for (const name of input.tags.map((t) => t.trim()).filter(Boolean)) {
    const tagSlug = slugify(name);
    const { data: existing } = await supabase.from("tags").select("id").eq("slug", tagSlug).maybeSingle();
    if (existing) {
      tagIds.push(existing.id as string);
    } else {
      const { data: created } = await supabase.from("tags").insert({ slug: tagSlug, name }).select("id").single();
      if (created) tagIds.push(created.id as string);
    }
  }
  await supabase.from("post_tags").delete().eq("post_id", input.id);
  if (tagIds.length) {
    await supabase.from("post_tags").insert(tagIds.map((tag_id) => ({ post_id: input.id, tag_id })));
  }

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
    .from("posts")
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
  await supabase.from("post_tags").delete().eq("post_id", id);
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/blog");
  return {};
}
