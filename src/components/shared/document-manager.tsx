"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  FileText, Upload, Download, Pencil, Trash2, X,
  FileSpreadsheet, FileImage, File,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DocumentRecord } from "@/lib/validations/documents";
import { ALLOWED_EXTENSIONS } from "@/lib/validations/documents";

// Categories drive both the filter row above the grid and the upload-tag row.
// "all" is the filter sentinel; it's not a valid tag for new uploads.
const CATEGORY_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "general", label: "General" },
  { value: "insurance", label: "Insurance" },
  { value: "levies", label: "Levies" },
  { value: "meetings", label: "Meetings" },
  { value: "legal", label: "Legal" },
  { value: "maintenance", label: "Maintenance" },
];

const UPLOAD_CATEGORY_OPTIONS = [
  { value: "other", label: "General" },
  { value: "insurance", label: "Insurance" },
  { value: "levies", label: "Levies" },
  { value: "meetings", label: "Meetings" },
  { value: "legal", label: "Legal" },
  { value: "maintenance", label: "Maintenance" },
];

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

function getFileIcon(mimeType: string | null, size: "sm" | "lg" = "sm") {
  const cls = size === "lg" ? "h-8 w-8" : "h-4 w-4";
  if (!mimeType) return <File className={`${cls} text-muted-foreground`} />;
  if (mimeType.includes("pdf")) return <FileText className={`${cls} text-red-500`} />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv"))
    return <FileSpreadsheet className={`${cls} text-green-600`} />;
  if (mimeType.startsWith("image/")) return <FileImage className={`${cls} text-blue-500`} />;
  if (mimeType.includes("word")) return <FileText className={`${cls} text-blue-600`} />;
  return <File className={`${cls} text-muted-foreground`} />;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
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
  // Upload-time tag. "all" is the filter sentinel and isn't a valid tag for new
  // uploads — when the filter is "all", new uploads default to "other".
  const [selectedCategory, setSelectedCategory] = useState<string>("other");
  // Filter: which category to display. "all" = show everything.
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

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
      toast.error("Upload failed — network error");
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

  // Window-level drag listeners — show a floating overlay only when the user
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

  async function handleRename() {
    if (!renameDoc || !renameName.trim()) return;
    const res = await fetch(`/api/documents/${renameDoc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameName.trim() }),
    });
    if (res.ok) {
      setDocuments((prev) =>
        prev.map((d) => (d.id === renameDoc.id ? { ...d, file_name: renameName.trim() } : d))
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

  function getDocDownloadUrl(doc: DocWithUrl): string {
    return `/api/documents/${doc.id}`;
  }

  function getDocViewUrl(doc: DocWithUrl): string {
    return `/api/documents/${doc.id}?view=true`;
  }

  function viewDocument(doc: DocWithUrl) {
    setPreviewDoc(doc);
  }

  async function downloadDocument(doc: DocWithUrl) {
    try {
      const url = getDocDownloadUrl(doc);
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = doc.file_name;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("Failed to download file");
    }
  }

  return (
    <div className="space-y-4">
      {/* Category filter pills + Upload + Export. Drop the folder tree entirely
          — categories ARE the folders for retrieval; Export reshapes the flat
          set into a folder structure when the user actually wants one. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORY_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilterCategory(opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                filterCategory === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={exporting || documents.length === 0}
              onClick={async () => {
                setExporting(true);
                try {
                  const res = await fetch(`/api/documents/export?oc_id=${ocId}`);
                  if (!res.ok) {
                    toast.error("Couldn't generate the export.");
                    return;
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `oc-documents-${new Date().toISOString().slice(0, 10)}.zip`;
                  a.click();
                  URL.revokeObjectURL(url);
                } finally {
                  setExporting(false);
                }
              }}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              {exporting ? "Preparing…" : "Export ZIP"}
            </Button>
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-3.5 w-3.5" />
              Upload
            </Button>
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
          </div>
        )}
      </div>

      {/* Tag row for uploads (only when readOnly=false). Separate from the
          filter pills above because they answer different questions: filter =
          "what do I want to see now"; tag = "what should new uploads be
          tagged as." */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">New uploads tagged as:</span>
          {UPLOAD_CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelectedCategory(opt.value)}
              className={`px-2 py-0.5 rounded-full font-medium cursor-pointer transition-colors ${
                selectedCategory === opt.value
                  ? "bg-primary/10 text-primary border border-primary/40"
                  : "border border-border text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Floating drag overlay — appears when the user drags files anywhere on
          the page. Click-through disabled so the underlying page handles the
          drop (handled by the window listener in the effect above). */}
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
              They&apos;ll be tagged as <span className="font-medium">{selectedCategory === "other" ? "General" : selectedCategory}</span>.
              PDF, DOC, XLS, images, CSV. Max 25MB per file.
            </p>
          </div>
        </div>
      )}

      {/* Upload progress bars */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((upload) => (
            <div key={upload.id} className="flex items-center gap-3 rounded-md border border-border p-3">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{upload.fileName}</p>
                {upload.error ? (
                  <p className="text-xs text-destructive">{upload.error}</p>
                ) : (
                  <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-200"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {upload.error ? "" : `${upload.progress}%`}
              </span>
              {upload.error && (
                <button
                  type="button"
                  onClick={() => setUploads((prev) => prev.filter((u) => u.id !== upload.id))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Document grid. Flat list filtered by selected category. */}
      {(() => {
        const visibleDocs = filterCategory === "all"
          ? documents
          : documents.filter((d) => {
              const cat = (d.category ?? "other").toLowerCase();
              if (filterCategory === "general") return cat === "other" || cat === "general";
              return cat === filterCategory;
            });
        if (visibleDocs.length === 0 && uploads.length === 0) {
          return (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  {filterCategory === "all" ? "No documents yet" : "No documents in this category"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {readOnly ? "Documents will appear here once uploaded by your strata manager." : "Click Upload above, or drag files anywhere on the page."}
                </p>
              </CardContent>
            </Card>
          );
        }
        return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleDocs.map((doc) => {
            const isImage = doc.mime_type?.startsWith("image/");
            return (
              <Card
                key={doc.id}
                className="group cursor-pointer transition-colors hover:border-primary/30"
                onClick={() => viewDocument(doc)}
              >
                <CardContent className="p-3">
                  {/* Preview area */}
                  <div className="flex items-center justify-center h-24 rounded-md bg-muted/50 mb-3 overflow-hidden">
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getDocViewUrl(doc)}
                        alt={doc.file_name}
                        className="h-full w-full object-cover rounded-md"
                      />
                    ) : (
                      getFileIcon(doc.mime_type, "lg")
                    )}
                  </div>

                  {/* File info */}
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground truncate flex-1" title={doc.file_name}>
                      {doc.file_name}
                    </p>
                    {doc.category && doc.category !== "other" && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                        {doc.category.charAt(0).toUpperCase() + doc.category.slice(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatFileSize(doc.file_size)} · {formatDate(doc.created_at)}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => downloadDocument(doc)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    {!readOnly && (
                      <>
                        <button
                          type="button"
                          onClick={() => { setRenameDoc(doc); setRenameName(doc.file_name); }}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Rename"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteDoc(doc)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        );
      })()}

      {/* Preview dialog */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{previewDoc?.file_name}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center min-h-[300px] max-h-[70vh] overflow-auto rounded-md bg-muted/30">
            {previewDoc?.mime_type?.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getDocViewUrl(previewDoc)}
                alt={previewDoc.file_name}
                className="max-w-full max-h-[65vh] object-contain"
              />
            ) : previewDoc?.mime_type === "application/pdf" ? (
              <iframe
                src={getDocViewUrl(previewDoc)}
                className="w-full h-[65vh] rounded-md"
                title={previewDoc.file_name}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-12">
                {getFileIcon(previewDoc?.mime_type ?? null, "lg")}
                <p className="text-sm text-muted-foreground">
                  Preview not available for this file type
                </p>
                <Button variant="secondary" size="sm" onClick={() => previewDoc && downloadDocument(previewDoc)}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Download to view
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreviewDoc(null)}>Close</Button>
            <Button onClick={() => previewDoc && downloadDocument(previewDoc)}>
              <Download className="mr-2 h-3.5 w-3.5" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameDoc} onOpenChange={() => setRenameDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameDoc(null)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!renameName.trim()}>Rename</Button>
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
            <Button variant="ghost" onClick={() => setDeleteDoc(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
