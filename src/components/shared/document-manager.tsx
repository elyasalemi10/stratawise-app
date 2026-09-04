"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { DocumentCard } from "@/components/shared/document-card";
import { DocumentLightbox } from "@/components/shared/document-lightbox";
import type { DocumentTag, TagColour } from "@/lib/document-tags-shared";
import {
  createDocumentTag,
  listDocumentTags,
  setDocumentDescription,
  setDocumentTags,
} from "@/lib/actions/document-tags";
import { FileText, Upload, Download, Trash2, Loader2, X, Search } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DocumentRecord } from "@/lib/validations/documents";
import { ALLOWED_EXTENSIONS } from "@/lib/validations/documents";
import { EmptyState } from "@/components/shared/empty-state";

// Categories used to drive a filter row + upload-tag pill row above the
// grid. Both UIs are gone; documents always show as a flat list and new
// uploads default to "other" (General). The category column is still
// captured on each row for sorting / search infrastructure.

interface UploadProgress {
  id: string;
  fileName: string;
  progress: number;
  error?: string;
}

// Extended to include public_url from upload response
interface DocWithUrl extends DocumentRecord {
  public_url?: string;
}

interface DocumentManagerProps {
  ocId: string;
  lotId?: string;
  initialDocuments: DocumentRecord[];
  readOnly?: boolean;
}




// Build accept string for file input
const ACCEPT_STRING = ALLOWED_EXTENSIONS.join(",");

export function DocumentManager({ ocId, lotId, initialDocuments, readOnly }: DocumentManagerProps) {
  const [documents, setDocuments] = useState<DocWithUrl[]>(initialDocuments);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [dragging, setDragging] = useState(false);
  const [renameDoc, setRenameDoc] = useState<DocWithUrl | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteDoc, setDeleteDoc] = useState<DocWithUrl | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocWithUrl | null>(null);
  // Upload-time tag and active filter. The user-facing pill rows for both
  // are gone; selectedCategory always defaults to "other" (General) and the
  // filter stays on "all" (show every document). Constants kept so the
  // underlying filtering/sorting infra continues to work.
  const selectedCategory = "other";
  const filterCategory = "all";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  // Selection lives here rather than on each card so "select all" and the
  // toolbar have one thing to read.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [tags, setTags] = useState<DocumentTag[]>([]);
  const [search, setSearch] = useState("");

  // The firm's tag vocabulary, fetched once. Seeding happens server-side on
  // first read, so a new company opens this page with something in the list.
  useEffect(() => {
    if (readOnly) return;
    listDocumentTags()
      .then(setTags)
      .catch((err) => console.error("[documents] could not load tags:", err));
  }, [readOnly]);

  const uploadFile = useCallback((file: File) => {
    const uploadId = crypto.randomUUID();
    setUploads((prev) => [...prev, { id: uploadId, fileName: file.name, progress: 0 }]);

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("oc_id", ocId);
    formData.append("category", selectedCategory);
    if (lotId) formData.append("lot_id", lotId);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, progress: pct } : u))
        );
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const doc = JSON.parse(xhr.responseText);
        setDocuments((prev) => [doc, ...prev]);
        setUploads((prev) => prev.filter((u) => u.id !== uploadId));
      } else {
        let errMsg = "Upload failed";
        try { errMsg = JSON.parse(xhr.responseText).error || errMsg; } catch { /* ignore */ }
        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, error: errMsg } : u))
        );
        toast.error(errMsg);
      }
    });

    xhr.addEventListener("error", () => {
      setUploads((prev) =>
        prev.map((u) => (u.id === uploadId ? { ...u, error: "Network error" } : u))
      );
      toast.error("Upload failed , network error");
    });

    xhr.open("POST", "/api/documents");
    xhr.send(formData);
  }, [ocId, lotId, selectedCategory]);

  function handleFiles(files: FileList | File[]) {
    Array.from(files).forEach(uploadFile);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    dragDepthRef.current = 0;
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  // Window-level drag listeners , show a floating overlay only when the user
  // drags an actual file (not a text selection or anchor link). The counter
  // pattern handles browsers firing dragleave on every child element.
  const dragDepthRef = useRef(0);
  useEffect(() => {
    if (readOnly) return;
    function isFileDrag(e: DragEvent): boolean {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      for (let i = 0; i < types.length; i++) if (types[i] === "Files") return true;
      return false;
    }
    function onEnter(e: DragEvent) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setDragging(true);
    }
    function onOver(e: DragEvent) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
    }
    function onLeave() {
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDragging(false);
    }
    function onDrop(e: DragEvent) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setDragging(false);
      if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
    }
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  // Split the filename into its display stem + locked .ext suffix. We only
  // ever ask the user to rename the stem; the extension follows the binary
  // and must stay attached so OS-level apps still know how to open the file.
  function splitFilename(filename: string): { stem: string; ext: string } {
    const lastDot = filename.lastIndexOf(".");
    if (lastDot <= 0 || lastDot === filename.length - 1) {
      return { stem: filename, ext: "" };
    }
    return { stem: filename.slice(0, lastDot), ext: filename.slice(lastDot) };
  }

  async function handleRename() {
    if (!renameDoc || !renameName.trim()) return;
    const { ext } = splitFilename(renameDoc.file_name);
    const newName = `${renameName.trim()}${ext}`;
    const res = await fetch(`/api/documents/${renameDoc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    if (res.ok) {
      setDocuments((prev) =>
        prev.map((d) => (d.id === renameDoc.id ? { ...d, file_name: newName } : d))
      );
      setRenameDoc(null);
    } else {
      toast.error("Failed to rename");
    }
  }

  async function handleDelete() {
    if (!deleteDoc) return;
    setDeleting(true);
    const res = await fetch(`/api/documents/${deleteDoc.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      setDocuments((prev) => prev.filter((d) => d.id !== deleteDoc.id));
      setDeleteDoc(null);
    } else {
      toast.error("Failed to delete");
    }
  }

  /** Write through locally first: the manager has already typed it, and a
   *  round trip before the words appear is the thing that makes a text box
   *  feel broken. */
  async function saveDescription(documentId: string, value: string) {
    setDocuments((prev) =>
      prev.map((d) => (d.id === documentId ? { ...d, description: value } : d)),
    );
    const res = await setDocumentDescription(ocId, documentId, value);
    if (res.error) toast.error(res.error);
  }

  async function toggleDocTag(documentId: string, tagId: string) {
    const doc = documents.find((d) => d.id === documentId);
    if (!doc) return;
    const current = doc.tags ?? [];
    const has = current.some((t) => t.id === tagId);
    const nextTags = has
      ? current.filter((t) => t.id !== tagId)
      : [...current, tags.find((t) => t.id === tagId)!].filter(Boolean);

    setDocuments((prev) =>
      prev.map((d) => (d.id === documentId ? { ...d, tags: nextTags } : d)),
    );
    const res = await setDocumentTags(ocId, documentId, nextTags.map((t) => t.id));
    if (res.error) {
      toast.error(res.error);
      // Put it back: the screen must not claim a filing that did not happen.
      setDocuments((prev) =>
        prev.map((d) => (d.id === documentId ? { ...d, tags: current } : d)),
      );
    }
  }

  async function createTag(name: string, colour: TagColour): Promise<DocumentTag | null> {
    const res = await createDocumentTag(name, colour);
    if (res.error || !res.tag) {
      toast.error(res.error ?? "Couldn't add that tag.");
      return null;
    }
    setTags((prev) => [...prev, res.tag!].sort((a, b) => a.name.localeCompare(b.name)));
    return res.tag;
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function selectAllVisible() {
    setSelectedIds(new Set(documents.map((d) => d.id)));
  }

  /** Zip whatever is selected. The export route already builds a zip for an
   *  OC; passing ids narrows it to the selection, which is what a manager
   *  asked for by selecting. */
  async function downloadSelected() {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/documents/export?oc_id=${ocId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      if (!res.ok) {
        toast.error("Couldn't prepare that download.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `documents-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't prepare that download.");
    } finally {
      setExporting(false);
    }
  }

  async function deleteSelected() {
    setBulkDeleting(true);
    const ids = [...selectedIds];
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/documents/${id}`, { method: "DELETE" })
          .then((r) => (r.ok ? id : null))
          .catch(() => null),
      ),
    );
    const removed = results.filter((r): r is string => r !== null);
    setBulkDeleting(false);
    setBulkDeleteOpen(false);
    if (removed.length > 0) {
      const gone = new Set(removed);
      setDocuments((prev) => prev.filter((d) => !gone.has(d.id)));
      clearSelection();
    }
    if (removed.length === ids.length) {
      toast.success(`${removed.length} ${removed.length === 1 ? "document" : "documents"} deleted`);
    } else {
      // Partial failure is worth naming: the manager needs to know the
      // rest are still there rather than assuming the whole batch went.
      toast.error(
        `Deleted ${removed.length} of ${ids.length}. The rest are still here, try again.`,
      );
    }
  }


  function getDocViewUrl(doc: DocWithUrl): string {
    return `/api/documents/${doc.id}?view=true`;
  }

  /** A document the preview pane can actually render: a PDF, or an Office
   *  file whose PDF rendition is ready. */

  function viewDocument(doc: DocWithUrl) {
    setPreviewDoc(doc);
  }


  return (
    <div className="space-y-4">
      {/* Search. Matches the manager's description and tags as well as the
          filename, which is the point of having them: "scan_0043.pdf" is
          not what anyone types when looking for the insurance certificate.
          The server already indexes the CONTENTS of every document; this is
          the client-side filter over what is on the page. */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search documents"
          className="pl-9"
        />
      </div>

      {/* No Upload button and no Export ZIP.
          Uploading is the first tile in the grid, where the thing being
          created belongs, and exporting everything was a guess about what
          the manager wanted: they nearly always want SOME of it. Selecting
          documents and acting on the selection covers both, and it is the
          only way to delete more than one at a time.

          The toolbar replaces nothing when empty: it is absent, so the grid
          starts at the top and does not shift when a selection begins. */}
      {!readOnly && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
          <span className="text-sm font-medium text-foreground tabular-nums">
            {selectedIds.size} selected
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={selectAllVisible}>
              Select all
            </Button>
            <Button variant="secondary" size="sm" onClick={clearSelection}>
              Clear
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={exporting}
              loading={exporting}
              onClick={downloadSelected}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              Download as ZIP
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="text-destructive"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_STRING}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Dropping anywhere on the page still works. The tile in the grid is
          the discoverable target; this is the one that catches a file
          dragged at the page in general, which is what people actually do
          once they know uploading is possible. */}
      {!readOnly && dragging && (
        <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center bg-white/50">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="pointer-events-auto flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-primary bg-card/95 px-12 py-10 shadow-lg"
          >
            <Upload className="h-10 w-10 text-primary" />
            <p className="text-base font-semibold text-foreground">Drop files to upload</p>
            <p className="text-xs text-muted-foreground">
              PDF, Word, Excel, PowerPoint, images and CSV. Up to 25MB each.
            </p>
          </div>
        </div>
      )}

      {/* Document grid , in-flight uploads render as ghost cards at the
          front of the grid with a spinning wheel where the preview / icon
          would normally sit, so the user sees one consistent surface
          instead of a separate progress strip above the grid. */}
      {(() => {
        const q = search.trim().toLowerCase();
        const searched = q
          ? documents.filter(
              (d) =>
                d.file_name.toLowerCase().includes(q) ||
                (d.description ?? "").toLowerCase().includes(q) ||
                (d.tags ?? []).some((t) => t.name.toLowerCase().includes(q)),
            )
          : documents;
        const visibleDocs = filterCategory === "all"
          ? searched
          : searched.filter((d) => {
              const cat = (d.category ?? "other").toLowerCase();
              if (filterCategory === "general") return cat === "other" || cat === "general";
              return cat === filterCategory;
            });
        if (visibleDocs.length === 0 && uploads.length === 0 && q) {
          return (
            <EmptyState
              card
              illustration="search"
              title="No documents match"
              description={`Nothing here matches "${search.trim()}".`}
            />
          );
        }
        if (visibleDocs.length === 0 && uploads.length === 0 && readOnly) {
          return (
            <Card>
              <CardContent>
                <EmptyState
                  card={false}
                  illustration="documents"
                  title="No documents yet"
                  description="Documents will appear here once uploaded by your strata manager."
                />
              </CardContent>
            </Card>
          );
        }
        return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Uploading is the first tile, not a button somewhere above.
              The thing you are making appears where it will live, the drop
              target is the size of a document rather than the size of a
              button, and the grid reads as "here are your documents, and
              here is where the next one goes". */}
          {!readOnly && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
              }}
              className="flex min-h-[22rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card p-4 text-center transition-colors hover:border-primary/50 hover:bg-muted"
            >
              <Upload className="h-7 w-7 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Add a document</span>
              <span className="text-xs text-muted-foreground">Drop it here, or click to choose</span>
            </button>
          )}
          {uploads.map((upload) => (
            <Card key={upload.id} className="relative">
              <CardContent className="p-3">
                <div className="flex h-24 items-center justify-center rounded-md bg-muted/50 mb-3 overflow-hidden">
                  {upload.error ? (
                    <FileText className="h-8 w-8 text-destructive/60" />
                  ) : (
                    <Loader2 className="h-7 w-7 animate-spin text-[color:var(--brand-gold)]" />
                  )}
                </div>
                <p
                  className="truncate text-sm font-medium text-foreground"
                  title={upload.fileName}
                >
                  {upload.fileName}
                </p>
                {upload.error && (
                  <p className="mt-0.5 text-xs text-destructive">
                    {upload.error}
                  </p>
                )}
                {upload.error && (
                  <button
                    type="button"
                    onClick={() =>
                      setUploads((prev) =>
                        prev.filter((u) => u.id !== upload.id),
                      )
                    }
                    className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Dismiss failed upload"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </CardContent>
            </Card>
          ))}
          {visibleDocs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              viewUrl={getDocViewUrl(doc)}
              selected={selectedIds.has(doc.id)}
              selectionActive={selectedIds.size > 0}
              readOnly={readOnly}
              allTags={tags}
              onOpen={() => viewDocument(doc)}
              onToggleSelect={() => toggleSelected(doc.id)}
              onDelete={() => setDeleteDoc(doc)}
              onDescriptionCommit={(value) => saveDescription(doc.id, value)}
              onToggleTag={(tagId) => toggleDocTag(doc.id, tagId)}
              onCreateTag={createTag}
            />
          ))}
        </div>
        );
      })()}

      <DocumentLightbox
        open={!!previewDoc}
        url={previewDoc ? getDocViewUrl(previewDoc) : null}
        mimeType={previewDoc?.mime_type ?? null}
        pdfReady={previewDoc?.pdf_status === "complete"}
        onClose={() => setPreviewDoc(null)}
      />

      <Dialog open={!!renameDoc} onOpenChange={() => setRenameDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
          </DialogHeader>
          <div className="flex items-stretch overflow-hidden rounded-md border border-border bg-card focus-within:ring-2 focus-within:ring-primary/20">
            <input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
              }}
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
              autoFocus
            />
            {renameDoc && (
              <span className="inline-flex shrink-0 items-center border-l border-border bg-muted px-3 py-2 text-sm font-mono text-muted-foreground">
                {splitFilename(renameDoc.file_name).ext || ""}
              </span>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRenameDoc(null)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!renameName.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteDoc} onOpenChange={() => setDeleteDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &ldquo;{deleteDoc?.file_name}&rdquo;? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteDoc(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} loading={deleting}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteOpen} onOpenChange={(o) => { if (!o && !bulkDeleting) setBulkDeleteOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size} {selectedIds.size === 1 ? "document" : "documents"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteSelected} disabled={bulkDeleting} loading={bulkDeleting}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
