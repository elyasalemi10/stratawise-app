"use client";

import { useState, useRef, useCallback } from "react";
import {
  FileText, Upload, Download, Eye, Pencil, Trash2, X,
  FileSpreadsheet, FileImage, File,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DocumentRecord } from "@/lib/validations/documents";

interface UploadProgress {
  id: string;
  fileName: string;
  progress: number;
  error?: string;
}

interface DocumentManagerProps {
  subdivisionId: string;
  lotId?: string;
  initialDocuments: DocumentRecord[];
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return <File className="h-4 w-4 text-muted-foreground" />;
  if (mimeType.includes("pdf")) return <FileText className="h-4 w-4 text-red-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv"))
    return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
  if (mimeType.startsWith("image/")) return <FileImage className="h-4 w-4 text-blue-500" />;
  if (mimeType.includes("word")) return <FileText className="h-4 w-4 text-blue-600" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
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

export function DocumentManager({ subdivisionId, lotId, initialDocuments }: DocumentManagerProps) {
  const [documents, setDocuments] = useState<DocumentRecord[]>(initialDocuments);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [dragging, setDragging] = useState(false);
  const [renameDoc, setRenameDoc] = useState<DocumentRecord | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteDoc, setDeleteDoc] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback((file: File) => {
    const uploadId = crypto.randomUUID();

    setUploads((prev) => [...prev, { id: uploadId, fileName: file.name, progress: 0 }]);

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("subdivision_id", subdivisionId);
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
        const err = JSON.parse(xhr.responseText);
        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, error: err.error || "Upload failed" } : u))
        );
        toast.error(err.error || "Upload failed");
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
  }, [subdivisionId, lotId]);

  function handleFiles(files: FileList | File[]) {
    Array.from(files).forEach(uploadFile);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

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

  function viewDocument(doc: DocumentRecord) {
    const url = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ""}/${doc.file_path}`;
    window.open(url, "_blank");
  }

  function downloadDocument(doc: DocumentRecord) {
    const url = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ""}/${doc.file_path}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.file_name;
    a.click();
  }

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
        <p className="mt-2 text-sm text-foreground font-medium">
          Drop files here or click to upload
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF, DOC, XLS, images, CSV. Max 25MB per file.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

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

      {/* Document list */}
      {documents.length === 0 && uploads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium text-foreground">No documents yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload your first document using the area above.
            </p>
          </CardContent>
        </Card>
      ) : documents.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left">Size</th>
                <th className="px-4 py-2.5 text-left">Uploaded</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-t border-border/50 h-12 hover:bg-muted/30 transition-colors">
                  <td className="px-4">
                    <div className="flex items-center gap-2">
                      {getFileIcon(doc.mime_type)}
                      <span className="text-foreground truncate max-w-[300px]">{doc.file_name}</span>
                    </div>
                  </td>
                  <td className="px-4 text-muted-foreground tabular-nums">
                    {formatFileSize(doc.file_size)}
                  </td>
                  <td className="px-4 text-muted-foreground">
                    {formatDate(doc.created_at)}
                  </td>
                  <td className="px-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => viewDocument(doc)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="View"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadDocument(doc)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenameDoc(doc);
                          setRenameName(doc.file_name);
                        }}
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
