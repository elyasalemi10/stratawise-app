"use client";

import { useState, useCallback, useMemo, useRef } from "react";
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
  Image as ImageIcon, Youtube as YoutubeIcon, Table as TableIcon,
  Loader2, ArrowLeft, Strikethrough, UploadCloud, AudioLines,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { NarrationPlayer } from "./narration-player";
import { saveBlogPost, setBlogPostStatus, type BlogPostRow } from "@/lib/actions/blog";
import { generateNarration, type NarrationWordTiming } from "@/lib/actions/blog-audio";

const REQ = <span className="text-destructive">*</span>;

// Upload an image to R2 (blog/ prefix) and read its natural dimensions
// client-side so we can store width/height (avoids layout shift / CLS on the
// marketing site) without the author entering them.
async function uploadBlogImage(file: File): Promise<{ url: string; width: number; height: number }> {
  const dims = await new Promise<{ width: number; height: number }>((resolve) => {
    const img = new window.Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(objUrl); };
    img.onerror = () => { resolve({ width: 0, height: 0 }); URL.revokeObjectURL(objUrl); };
    img.src = objUrl;
  });
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/blog-upload", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Upload failed");
  return { url: json.url as string, width: dims.width, height: dims.height };
}

function ToolbarButton({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors cursor-pointer ${active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}>{children}</button>
  );
}

export function BlogEditor({ post }: { post: BlogPostRow }) {
  const router = useRouter();
  const [title, setTitle] = useState(post.title === "Untitled post" ? "" : post.title);
  const [slug, setSlug] = useState(post.slug.startsWith("untitled-post-") ? "" : post.slug);
  const [excerpt, setExcerpt] = useState(post.excerpt ?? "");
  const [audience, setAudience] = useState<"lot_owners" | "strata_managers">(post.audience ?? "strata_managers");
  const [coverImage, setCoverImage] = useState(post.cover_image_url ?? "");
  const [coverAlt, setCoverAlt] = useState(post.cover_image_alt ?? "");
  const [coverW, setCoverW] = useState<number | null>(post.cover_image_width);
  const [coverH, setCoverH] = useState<number | null>(post.cover_image_height);
  const [coverUploading, setCoverUploading] = useState(false);
  const [tags, setTags] = useState((post.tags ?? []).map((t) => t.name).join(", "));
  // SEO
  const [seoTitle, setSeoTitle] = useState(post.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(post.seo_description ?? "");
  const [seoKeywords, setSeoKeywords] = useState((post.seo_keywords ?? []).join(", "));
  const [canonical, setCanonical] = useState(post.canonical_url ?? "");
  const [robotsIndex, setRobotsIndex] = useState(post.robots_index);
  const [robotsFollow, setRobotsFollow] = useState(post.robots_follow);
  const [readingOverride, setReadingOverride] = useState(post.reading_time_minutes != null ? String(post.reading_time_minutes) : "");

  const [saving, setSaving] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [status, setStatus] = useState(post.status);
  // Narration
  const [audioUrl, setAudioUrl] = useState<string | null>(post.audio_url);
  const [audioWords, setAudioWords] = useState<NarrationWordTiming[]>(
    Array.isArray(post.audio_words) ? (post.audio_words as NarrationWordTiming[]) : [],
  );
  const [narrating, setNarrating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const contentImageInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Image.configure({ HTMLAttributes: { loading: "lazy", decoding: "async" } }),
      Youtube.configure({ width: 640, height: 360, nocookie: true }),
      Placeholder.configure({ placeholder: "Write your post… use the toolbar for headings, images, tables, and YouTube." }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
    ],
    // Prefer the TipTap JSON (faithful round-trip of timelines/tables); fall
    // back to the stored HTML, then an empty doc.
    content: post.content_json && Object.keys(post.content_json).length > 0
      ? post.content_json
      : (post.body && post.body.trim().length > 0 ? post.body : "<p></p>"),
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[360px] focus:outline-none [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_td]:align-top [&_td]:break-words [&_td]:whitespace-normal [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_th]:align-top [&_th]:break-words [&_th]:whitespace-normal",
      },
    },
  });

  const autoReading = useMemo(() => {
    const txt = editor?.getText() ?? "";
    const words = txt.trim() ? txt.trim().split(/\s+/).length : 0;
    return Math.max(1, Math.round(words / 200));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.state]);

  async function onCoverFile(file: File) {
    setCoverUploading(true);
    try {
      const { url, width, height } = await uploadBlogImage(file);
      setCoverImage(url); setCoverW(width || null); setCoverH(height || null);
      toast.success("Cover uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setCoverUploading(false);
    }
  }

  const onContentImageFile = useCallback(async (file: File) => {
    if (!editor) return;
    const t = toast.loading("Uploading image…");
    try {
      const { url } = await uploadBlogImage(file);
      const alt = window.prompt("Describe the image (alt text , important for SEO & accessibility)") ?? "";
      editor.chain().focus().setImage({ src: url, alt }).run();
      toast.success("Image added", { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed", { id: t });
    }
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
      content_json: editor.getJSON(),
      cover_image_url: coverImage || null,
      cover_image_alt: coverAlt || null,
      cover_image_width: coverW,
      cover_image_height: coverH,
      cover_image_caption: null,
      seo_title: seoTitle || null,
      seo_description: seoDescription || null,
      seo_keywords: seoKeywords.split(",").map((k) => k.trim()).filter(Boolean),
      canonical_url: canonical || null,
      robots_index: robotsIndex,
      robots_follow: robotsFollow,
      reading_time_minutes: readingOverride ? parseInt(readingOverride, 10) : autoReading,
      audience,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setSaving(false);
    if (result.error) { toast.error(result.error); return false; }
    toast.success("Saved");
    router.refresh();
    return true;
  }

  async function handleGenerateNarration() {
    setNarrating(true);
    // Save first , the action narrates the post's saved content.
    const saved = await handleSave();
    if (!saved) { setNarrating(false); return; }
    const r = await generateNarration(post.id);
    setNarrating(false);
    if (r.error || !r.audioUrl) { toast.error(r.error ?? "Narration failed"); return; }
    setAudioUrl(r.audioUrl);
    setAudioWords(r.words ?? []);
    toast.success("Narration ready");
    setPreviewOpen(true);
  }

  async function handlePublishToggle() {
    const next = status === "published" ? "draft" : "published";
    // Require the SEO essentials before going live.
    if (next === "published") {
      const missing: string[] = [];
      if (!title.trim()) missing.push("title");
      if (!slug.trim()) missing.push("URL slug");
      if (!excerpt.trim()) missing.push("excerpt");
      if (!coverImage) missing.push("cover image");
      if (!coverAlt.trim()) missing.push("cover image alt text");
      if (missing.length) {
        toast.error(`Add the ${missing.join(", ")} before publishing.`);
        return;
      }
    }
    setStatusPending(true);
    const saved = await handleSave();
    if (!saved) { setStatusPending(false); return; }
    const r = await setBlogPostStatus(post.id, next);
    setStatusPending(false);
    if (r.error) { toast.error(r.error); return; }
    setStatus(next);
    toast.success(next === "published" ? "Published , live on the marketing site" : "Moved to draft");
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

      <div>
        <Label className="text-xs text-muted-foreground">Title {REQ}</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Post title"
          className="h-auto border-0 bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0" />
      </div>

      {/* Post details + SEO , all visible at the top (no dropdown). */}
      <div className="space-y-4 rounded-md border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Audience (for records)</Label>
            <Select value={audience} onValueChange={(v) => setAudience((v as "lot_owners" | "strata_managers") ?? "strata_managers")}>
              <SelectTrigger className="w-full">
                <SelectValue>{audience === "lot_owners" ? "Lot owners" : "Strata managers"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strata_managers">Strata managers</SelectItem>
                <SelectItem value="lot_owners">Lot owners</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="blog-slug" className="text-xs text-muted-foreground">URL slug {REQ}</Label>
            <Input id="blog-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="post-url-slug" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="blog-excerpt" className="text-xs text-muted-foreground">Excerpt {REQ}</Label>
          <Textarea id="blog-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} placeholder="Short summary shown in listings (also the default meta description)" />
        </div>

        {/* Cover image , upload from computer; dimensions captured automatically. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Cover image {REQ}</Label>
            {coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <div className="relative overflow-hidden rounded-md border border-border">
                <img src={coverImage} alt={coverAlt} className="h-32 w-full object-cover" />
                <button type="button" onClick={() => coverInputRef.current?.click()} className="absolute bottom-2 right-2 rounded-md bg-card/90 px-2 py-1 text-xs font-medium text-foreground hover:bg-card cursor-pointer">Replace</button>
              </div>
            ) : (
              <button type="button" onClick={() => coverInputRef.current?.click()} disabled={coverUploading}
                className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:border-primary/40 cursor-pointer">
                {coverUploading ? <Loader2 className="size-5 animate-spin" /> : <UploadCloud className="size-5" />}
                {coverUploading ? "Uploading…" : "Upload cover image"}
              </button>
            )}
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onCoverFile(f); e.target.value = ""; }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cover-alt" className="text-xs text-muted-foreground">Cover image alt text {REQ}</Label>
            <Input id="cover-alt" value={coverAlt} onChange={(e) => setCoverAlt(e.target.value)} placeholder="Describe the cover image" />
            {coverW && coverH ? <p className="text-xs text-muted-foreground">{coverW}×{coverH}px (auto)</p> : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="blog-tags" className="text-xs text-muted-foreground">Tags (comma separated)</Label>
          <Input id="blog-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="strata, levies, compliance" />
        </div>

        <div className="border-t border-border pt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="seo-title" className="text-xs text-muted-foreground">Meta title</Label>
              <Input id="seo-title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder="Search-result title" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reading-time" className="text-xs text-muted-foreground">Reading time (min)</Label>
              <NumberInput id="reading-time" allowDecimal={false} value={readingOverride} onChange={setReadingOverride} placeholder={`Auto: ${autoReading}`} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seo-desc" className="text-xs text-muted-foreground">Meta description</Label>
            <Textarea id="seo-desc" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={2} placeholder="Search-result description" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="seo-keywords" className="text-xs text-muted-foreground">Keywords (comma separated)</Label>
              <Input id="seo-keywords" value={seoKeywords} onChange={(e) => setSeoKeywords(e.target.value)} placeholder="owners corporation, strata levies" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seo-canonical" className="text-xs text-muted-foreground">Canonical URL</Label>
              <Input id="seo-canonical" value={canonical} onChange={(e) => setCanonical(e.target.value)} placeholder="Leave blank to use the post URL" />
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
        <ToolbarButton title="Upload image" onClick={() => contentImageInputRef.current?.click()}><ImageIcon className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="YouTube embed" onClick={addYoutube}><YoutubeIcon className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className="h-4 w-4" /></ToolbarButton>
        <input ref={contentImageInputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onContentImageFile(f); e.target.value = ""; }} />
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <EditorContent editor={editor} />
      </div>

      {/* Narration , ElevenLabs read-aloud with synced word highlighting. */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-4">
        <AudioLines className="h-5 w-5 text-muted-foreground" />
        <div className="mr-auto">
          <p className="text-sm font-medium text-foreground">Audio narration</p>
          <p className="text-xs text-muted-foreground">
            Reads headings, paragraphs and lists aloud (tables, images and embeds are skipped) and highlights each word as it&apos;s spoken.
          </p>
        </div>
        {audioUrl && (
          <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(true)} disabled={narrating}>
            Preview
          </Button>
        )}
        <Button size="sm" onClick={handleGenerateNarration} disabled={narrating || saving}>
          {narrating && <Loader2 className="size-4 animate-spin" />}
          {audioUrl ? "Regenerate narration" : "Generate narration"}
        </Button>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Narration preview</DialogTitle>
            <DialogDescription>Press play , each word highlights as it&apos;s read. This is exactly what readers get.</DialogDescription>
          </DialogHeader>
          {audioUrl && (
            <div className="max-h-[60vh] overflow-y-auto">
              <NarrationPlayer html={editor.getHTML()} audioUrl={audioUrl} words={audioWords} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
