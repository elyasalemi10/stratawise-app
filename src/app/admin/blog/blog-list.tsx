"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2, Newspaper, Trash2, Pencil, Sparkles, Copy, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { createBlogPost, deleteBlogPost, importAiPost, type BlogPostRow } from "@/lib/actions/blog";
import { AI_POST_PROMPT } from "@/lib/blog/ai-prompt";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function BlogList({ posts }: { posts: BlogPostRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BlogPostRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    await navigator.clipboard.writeText(AI_POST_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleImport() {
    setImporting(true);
    const r = await importAiPost(importJson);
    if (r.error || !r.id) {
      setImporting(false);
      toast.error(r.error ?? "Import failed");
      return;
    }
    router.push(`/admin/blog/${r.id}`);
  }

  async function handleNew() {
    setCreating(true);
    const r = await createBlogPost();
    if (r.error || !r.id) {
      setCreating(false);
      toast.error(r.error ?? "Couldn't create post");
      return;
    }
    router.push(`/admin/blog/${r.id}`);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const r = await deleteBlogPost(deleteTarget.id);
    setDeleting(false);
    if (r.error) { toast.error(r.error); return; }
    toast.success("Post deleted");
    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Blog</h1>
          <p className="text-sm text-muted-foreground">Posts published here appear on the marketing site.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Import AI post
          </Button>
          <Button size="sm" onClick={handleNew} disabled={creating}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
            New post
          </Button>
        </div>
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="No posts yet"
          description="Write your first post — headings, images, tables, YouTube embeds and timelines are all supported."
          action={<Button size="sm" onClick={handleNew} disabled={creating}><Plus className="mr-1.5 h-3.5 w-3.5" />New post</Button>}
        />
      ) : (
        <div className="space-y-2">
          {posts.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between gap-4 py-3">
                <button
                  type="button"
                  onClick={() => router.push(`/admin/blog/${p.id}`)}
                  className="min-w-0 flex-1 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{p.title}</span>
                    <Badge variant={p.status === "published" ? "success" : "neutral"} className="rounded-full shrink-0">
                      {p.status === "published" ? "Published" : "Draft"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">/{p.slug} · updated {fmtDate(p.updated_at)}</p>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push(`/admin/blog/${p.id}`)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(p)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={importOpen} onOpenChange={(o) => { if (!importing) setImportOpen(o); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import AI post</DialogTitle>
            <DialogDescription>
              Copy the prompt below into any AI chat, describe your topic, then paste the JSON it returns here. Title, body, SEO, cover, audience and tags all come across as a draft for you to review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button type="button" variant="secondary" size="sm" onClick={copyPrompt}>
              {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy AI prompt"}
            </Button>
            <Textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder="Paste the JSON the AI returned"
              className="min-h-48 font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setImportOpen(false)} disabled={importing}>Cancel</Button>
            <Button onClick={handleImport} disabled={importing || !importJson.trim()}>
              {importing && <Loader2 className="size-4 animate-spin" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete post?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; will be permanently deleted. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
