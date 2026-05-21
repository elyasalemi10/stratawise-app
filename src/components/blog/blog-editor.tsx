"use client";

import { useState, useCallback } from "react";
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
  Loader2, ArrowLeft, Eye, Strikethrough,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Timeline } from "./timeline-node";
import { saveBlogPost, setBlogPostStatus, type BlogPostRow } from "@/lib/actions/blog";

function ToolbarButton({
  active, onClick, title, children, disabled,
}: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors cursor-pointer disabled:opacity-40 ${
        active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

export function BlogEditor({ post }: { post: BlogPostRow }) {
  const router = useRouter();
  const [title, setTitle] = useState(post.title === "Untitled post" ? "" : post.title);
  const [slug, setSlug] = useState(post.slug);
  const [excerpt, setExcerpt] = useState(post.excerpt ?? "");
  const [coverImage, setCoverImage] = useState(post.cover_image_url ?? "");
  const [saving, setSaving] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [status, setStatus] = useState(post.status);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Image,
      Youtube.configure({ width: 640, height: 360, nocookie: true }),
      Placeholder.configure({ placeholder: "Write your post… use the toolbar for headings, images, tables, YouTube and timelines." }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Timeline,
    ],
    content: (post.content_json && Object.keys(post.content_json).length > 0
      ? (post.content_json as object)
      : "<p></p>"),
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[400px] focus:outline-none [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2",
      },
    },
  });

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Image URL");
    if (url) editor.chain().focus().setImage({ src: url }).run();
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
      cover_image_url: coverImage || null,
      content_json: editor.getJSON(),
      content_html: editor.getHTML(),
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return false;
    }
    toast.success("Saved");
    router.refresh();
    return true;
  }

  async function handlePublishToggle() {
    const next = status === "published" ? "draft" : "published";
    // Save first so we never publish stale content.
    setStatusPending(true);
    const saved = await handleSave();
    if (!saved) { setStatusPending(false); return; }
    const r = await setBlogPostStatus(post.id, next);
    setStatusPending(false);
    if (r.error) { toast.error(r.error); return; }
    setStatus(next);
    toast.success(next === "published" ? "Published" : "Moved to draft");
  }

  if (!editor) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/admin/blog")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Posts
        </button>
        <div className="flex items-center gap-2">
          <Badge variant={status === "published" ? "success" : "neutral"} className="rounded-full">
            {status === "published" ? "Published" : "Draft"}
          </Badge>
          <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving || statusPending}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
          <Button size="sm" onClick={handlePublishToggle} disabled={saving || statusPending}>
            {statusPending && <Loader2 className="size-4 animate-spin" />}
            {status === "published" ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
          className="h-auto border-0 bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="blog-slug" className="text-xs text-muted-foreground">URL slug</Label>
            <Input id="blog-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="post-url-slug" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="blog-cover" className="text-xs text-muted-foreground">Cover image URL</Label>
            <Input id="blog-cover" value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="Cover image URL" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="blog-excerpt" className="text-xs text-muted-foreground">Excerpt</Label>
          <Input id="blog-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Short summary shown in listings" />
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

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Eye className="h-3.5 w-3.5" />
        Published posts are read by the marketing site from <code className="rounded bg-cool-muted px-1">blog_posts</code> (content_html).
      </p>
    </div>
  );
}
