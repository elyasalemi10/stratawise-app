"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import {
  Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Quote,
  Image as ImageIcon, Youtube as YoutubeIcon, Table as TableIcon, GitCommitHorizontal,
  Loader2, ArrowLeft, Strikethrough, ChevronDown, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberInput } from "@/components/ui/number-input";
import { Timeline } from "./timeline-node";
import { saveBlogPost, setBlogPostStatus, type BlogPostRow } from "@/lib/actions/blog";

function ToolbarButton({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button" title={title} onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors cursor-pointer ${active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}
    >{children}</button>
  );
}

export function BlogEditor({ post }: { post: BlogPostRow }) {
  const router = useRouter();
  const [title, setTitle] = useState(post.title === "Untitled post" ? "" : post.title);
  const [slug, setSlug] = useState(post.slug);
  const [excerpt, setExcerpt] = useState(post.excerpt ?? "");
  const [coverImage, setCoverImage] = useState(post.cover_image_url ?? "");
  const [coverAlt, setCoverAlt] = useState(post.cover_image_alt ?? "");
  const [coverCaption, setCoverCaption] = useState(post.cover_image_caption ?? "");
  const [coverW, setCoverW] = useState(post.cover_image_width != null ? String(post.cover_image_width) : "");
  const [coverH, setCoverH] = useState(post.cover_image_height != null ? String(post.cover_image_height) : "");
  const [tags, setTags] = useState((post.tags ?? []).map((t) => t.name).join(", "));
  // SEO
  const [seoTitle, setSeoTitle] = useState(post.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(post.seo_description ?? "");
  const [seoKeywords, setSeoKeywords] = useState((post.seo_keywords ?? []).join(", "));
  const [canonical, setCanonical] = useState(post.canonical_url ?? "");
  const [robotsIndex, setRobotsIndex] = useState(post.robots_index);
  const [robotsFollow, setRobotsFollow] = useState(post.robots_follow);
  const [readingOverride, setReadingOverride] = useState(post.reading_time_minutes != null ? String(post.reading_time_minutes) : "");
  const [seoOpen, setSeoOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [status, setStatus] = useState(post.status);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      // Lazy + async decode so the marketing site loads content images
      // on demand (faster LCP / Core Web Vitals).
      Image.configure({ HTMLAttributes: { loading: "lazy", decoding: "async" } }),
      Youtube.configure({ width: 640, height: 360, nocookie: true }),
      Placeholder.configure({ placeholder: "Write your post… use the toolbar for headings, images, tables, YouTube and timelines." }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
      Timeline,
    ],
    content: post.body && post.body.trim().length > 0 ? post.body : "<p></p>",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[360px] focus:outline-none [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2",
      },
    },
  });

  // Live reading-time estimate from the editor text (overridable).
  const autoReading = useMemo(() => {
    const txt = editor?.getText() ?? "";
    const words = txt.trim() ? txt.trim().split(/\s+/).length : 0;
    return Math.max(1, Math.round(words / 200));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.state]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Image URL");
    if (!url) return;
    const alt = window.prompt("Describe the image (alt text — important for SEO & accessibility)") ?? "";
    editor.chain().focus().setImage({ src: url, alt }).run();
  }, [editor]);

  const addYoutube = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("YouTube video URL");
    if (url) editor.commands.setYoutubeVideo({ src: url });
  }, [editor]);

  async function handleSave(): Promise<boolean> {
    if (!editor) return false;
    setSaving(true);
    const result = await saveBlogPost({
      id: post.id,
      title,
      slug,
      excerpt: excerpt || null,
      body: editor.getHTML(),
      cover_image_url: coverImage || null,
      cover_image_alt: coverAlt || null,
      cover_image_width: coverW ? parseInt(coverW, 10) : null,
      cover_image_height: coverH ? parseInt(coverH, 10) : null,
      cover_image_caption: coverCaption || null,
      seo_title: seoTitle || null,
      seo_description: seoDescription || null,
      seo_keywords: seoKeywords.split(",").map((k) => k.trim()).filter(Boolean),
      canonical_url: canonical || null,
      robots_index: robotsIndex,
      robots_follow: robotsFollow,
      reading_time_minutes: readingOverride ? parseInt(readingOverride, 10) : autoReading,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setSaving(false);
    if (result.error) { toast.error(result.error); return false; }
    toast.success("Saved");
    router.refresh();
    return true;
  }

  async function handlePublishToggle() {
    const next = status === "published" ? "draft" : "published";
    setStatusPending(true);
    const saved = await handleSave();
    if (!saved) { setStatusPending(false); return; }
    const r = await setBlogPostStatus(post.id, next);
    setStatusPending(false);
    if (r.error) { toast.error(r.error); return; }
    setStatus(next);
    toast.success(next === "published" ? "Published — live on the marketing site" : "Moved to draft");
  }

  if (!editor) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  const isPublished = status === "published";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => router.push("/admin/blog")} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Posts
        </button>
        <div className="flex items-center gap-2">
          <Badge variant={isPublished ? "success" : "neutral"} className="rounded-full">{isPublished ? "Published" : "Draft"}</Badge>
          <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving || statusPending}>
            {saving && <Loader2 className="size-4 animate-spin" />}Save
          </Button>
          <Button size="sm" onClick={handlePublishToggle} disabled={saving || statusPending}>
            {statusPending && <Loader2 className="size-4 animate-spin" />}{isPublished ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Post title"
          className="h-auto border-0 bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0" />
        <div className="space-y-1.5">
          <Label htmlFor="blog-excerpt" className="text-xs text-muted-foreground">Excerpt</Label>
          <Textarea id="blog-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} placeholder="Short summary shown in listings and used as the default meta description" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="blog-cover" className="text-xs text-muted-foreground">Cover image URL</Label>
            <Input id="blog-cover" value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="Cover image URL" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="blog-cover-alt" className="text-xs text-muted-foreground">Cover image alt text</Label>
            <Input id="blog-cover-alt" value={coverAlt} onChange={(e) => setCoverAlt(e.target.value)} placeholder="Describe the cover image" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="blog-tags" className="text-xs text-muted-foreground">Tags (comma separated)</Label>
          <Input id="blog-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="strata, levies, compliance" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="sticky top-16 z-10 flex flex-wrap items-center gap-1 rounded-md border border-border bg-card p-1.5">
        <ToolbarButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton title="Big heading" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Heading" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Subheading" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton title="Image" onClick={addImage}><ImageIcon className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="YouTube embed" onClick={addYoutube}><YoutubeIcon className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Timeline" onClick={() => editor.commands.insertTimeline()}><GitCommitHorizontal className="h-4 w-4" /></ToolbarButton>
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <EditorContent editor={editor} />
      </div>

      {/* SEO & metadata */}
      <div className="rounded-md border border-border bg-card">
        <button type="button" onClick={() => setSeoOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground cursor-pointer">
          <span className="inline-flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /> SEO &amp; metadata</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${seoOpen ? "rotate-180" : ""}`} />
        </button>
        {seoOpen && (
          <div className="space-y-4 border-t border-border p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="seo-title" className="text-xs text-muted-foreground">Meta title</Label>
                <Input id="seo-title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder={title || "Defaults to the post title"} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seo-slug" className="text-xs text-muted-foreground">URL slug</Label>
                <Input id="seo-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="post-url-slug" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seo-desc" className="text-xs text-muted-foreground">Meta description</Label>
              <Textarea id="seo-desc" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={2} placeholder={excerpt || "Defaults to the excerpt"} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seo-keywords" className="text-xs text-muted-foreground">Keywords (comma separated)</Label>
              <Input id="seo-keywords" value={seoKeywords} onChange={(e) => setSeoKeywords(e.target.value)} placeholder="owners corporation, strata levies" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="seo-canonical" className="text-xs text-muted-foreground">Canonical URL</Label>
                <Input id="seo-canonical" value={canonical} onChange={(e) => setCanonical(e.target.value)} placeholder="Leave blank to use the post URL" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reading-time" className="text-xs text-muted-foreground">Reading time (min)</Label>
                <NumberInput id="reading-time" allowDecimal={false} value={readingOverride} onChange={setReadingOverride} placeholder={`Auto: ${autoReading}`} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cover-caption" className="text-xs text-muted-foreground">Cover caption</Label>
                <Input id="cover-caption" value={coverCaption} onChange={(e) => setCoverCaption(e.target.value)} placeholder="Optional caption under the cover" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cover-w" className="text-xs text-muted-foreground">Cover width</Label>
                  <NumberInput id="cover-w" allowDecimal={false} value={coverW} onChange={setCoverW} placeholder="1600" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cover-h" className="text-xs text-muted-foreground">Cover height</Label>
                  <NumberInput id="cover-h" allowDecimal={false} value={coverH} onChange={setCoverH} placeholder="900" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={robotsIndex} onCheckedChange={(v) => setRobotsIndex(v === true)} className="bg-card" />
                Allow search engines to index
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={robotsFollow} onCheckedChange={(v) => setRobotsFollow(v === true)} className="bg-card" />
                Follow links
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
