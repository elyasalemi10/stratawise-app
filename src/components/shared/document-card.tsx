"use client";

import * as React from "react";
import { Download, Trash2, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AutoGrowTextarea } from "@/components/shared/auto-grow-textarea";
import { BrandLoader } from "@/components/shared/brand-mark";
import { TagChip, TagPicker } from "@/components/shared/tag-picker";
import { relativeDate } from "@/lib/relative-date";
import { cn } from "@/lib/utils";
import type { DocumentTag, TagColour } from "@/lib/document-tags-shared";

// A document card is mostly the document.
//
// The chrome lives in a strip ABOVE the preview rather than over it: the date
// on the right, the checkbox on the left, and download / delete appearing in
// that strip on hover. Sitting them on the image meant they were unreadable
// against a light page and covered the part of the document you were trying
// to recognise.
//
// The filename is not shown. "scan_0043.pdf" identifies nothing, and it is
// still on the row as original_filename. What replaces it is the manager's
// note and their tags, which are the things that make a document findable.

export interface DocumentCardDoc {
  id: string;
  file_name: string;
  mime_type: string | null;
  created_at: string;
  description?: string | null;
  pdf_status?: string;
  tags?: DocumentTag[];
}

export function DocumentCard({
  doc,
  viewUrl,
  downloadUrl,
  selected,
  selectionActive,
  readOnly,
  allTags,
  onOpen,
  onToggleSelect,
  onDelete,
  onDescriptionCommit,
  onToggleTag,
  onCreateTag,
}: {
  doc: DocumentCardDoc;
  viewUrl: string;
  downloadUrl: string;
  selected: boolean;
  selectionActive: boolean;
  readOnly?: boolean;
  allTags: DocumentTag[];
  onOpen: () => void;
  onToggleSelect: () => void;
  onDelete: () => void;
  onDescriptionCommit: (value: string) => void;
  onToggleTag: (tagId: string) => void;
  onCreateTag: (name: string, colour: TagColour) => Promise<DocumentTag | null>;
}) {
  const [description, setDescription] = React.useState(doc.description ?? "");
  // The preview is hidden until it has fully decoded. A photo that paints
  // top-down as it loads looks like a broken file; the mark pulsing looks
  // like work in progress, and then the image arrives whole.
  const [previewReady, setPreviewReady] = React.useState(false);

  const isImage = doc.mime_type?.startsWith("image/");
  const isPdf = doc.mime_type === "application/pdf" || doc.pdf_status === "complete";
  const tags = doc.tags ?? [];
  const extension =
    doc.file_name.includes(".") ? doc.file_name.split(".").pop()!.toUpperCase() : "FILE";

  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
      )}
    >
      {/* Chrome strip. Fixed height so hover does not resize the card. */}
      <div className="relative flex h-9 shrink-0 items-center justify-between px-2">
        {!readOnly ? (
          <div
            className={cn(
              "transition-opacity",
              selected || selectionActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <Checkbox
              checked={selected}
              onCheckedChange={onToggleSelect}
              aria-label={`Select ${doc.file_name}`}
            />
          </div>
        ) : (
          <span />
        )}

        <span className="text-xs font-medium text-muted-foreground transition-opacity group-hover:opacity-0">
          {relativeDate(doc.created_at)}
        </span>

        {/* Over the date, on hover. The date is not needed while you are
            reaching for an action, and the two never fight for the corner. */}
        {!readOnly && (
          <div className="absolute right-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <a
              href={downloadUrl}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Download ${doc.file_name}`}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              aria-label={`Delete ${doc.file_name}`}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="relative block h-64 w-full cursor-pointer overflow-hidden bg-muted"
        aria-label={`Open ${doc.file_name}`}
      >
        {isImage ? (
          <>
            {!previewReady && <BrandLoader className="absolute inset-0" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewUrl}
              alt=""
              // decoding="async" plus the readiness flag is what makes it
              // appear all at once rather than scanning down the card.
              decoding="async"
              loading="lazy"
              onLoad={() => setPreviewReady(true)}
              onError={() => setPreviewReady(true)}
              className={cn(
                "h-full w-full object-cover transition-opacity duration-200",
                previewReady ? "opacity-100" : "opacity-0",
              )}
            />
          </>
        ) : isPdf ? (
          <>
            {!previewReady && <BrandLoader className="absolute inset-0" />}
            <object
              data={`${viewUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              type="application/pdf"
              onLoad={() => setPreviewReady(true)}
              className={cn(
                "pointer-events-none h-full w-full transition-opacity duration-200",
                previewReady ? "opacity-100" : "opacity-0",
              )}
              aria-hidden
            />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="rounded-md bg-cool-muted px-3 py-1.5 text-sm font-semibold text-cool-muted-foreground">
              {extension}
            </span>
          </div>
        )}
      </button>

      <div className="flex flex-col gap-1.5 border-t border-border p-2.5">
        <AutoGrowTextarea
          value={description}
          onChange={setDescription}
          onCommit={onDescriptionCommit}
          placeholder="Add a note"
          disabled={readOnly}
        />
        {/* Tags scroll sideways in their own strip rather than wrapping.
            Wrapping made a card grow as tags were added, which shifted every
            card after it in the grid while the manager was mid-task. */}
        <div className="flex items-center gap-1.5">
          {tags.length > 0 && (
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tags.map((t) => (
                <span key={t.id} className="shrink-0">
                  <TagChip tag={t} onRemove={readOnly ? undefined : () => onToggleTag(t.id)} />
                </span>
              ))}
            </div>
          )}
          {!readOnly && (
            <div className="shrink-0">
              <TagPicker
                allTags={allTags}
                selectedIds={tags.map((t) => t.id)}
                onToggle={onToggleTag}
                onCreate={onCreateTag}
                compact={tags.length > 0}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A file mid-upload. The square is the shape it will be; nothing else is
 *  known yet, so nothing else is shown. */
export function DocumentUploadCard({
  failed,
  onDismiss,
}: {
  failed?: boolean;
  onDismiss?: () => void;
}) {
  return (
    <div className="relative flex h-[22rem] flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="h-9 shrink-0" />
      <div className="flex flex-1 items-center justify-center bg-muted">
        {failed ? (
          <span className="text-sm text-destructive">Upload failed</span>
        ) : (
          <BrandLoader />
        )}
      </div>
      {failed && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss failed upload"
          className="absolute right-2 top-2 cursor-pointer rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
