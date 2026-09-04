"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AutoGrowTextarea } from "@/components/shared/auto-grow-textarea";
import { TagChip, TagPicker } from "@/components/shared/tag-picker";
import { relativeDate } from "@/lib/relative-date";
import { cn } from "@/lib/utils";
import type { DocumentTag, TagColour } from "@/lib/document-tags-shared";

// A document card is mostly the document.
//
// It used to be a small thumbnail over a filename, a size, a date and a row
// of icon buttons, which is four lines of chrome about a thing you cannot
// see. The preview is now the card: big enough to recognise a page at a
// glance, which is how anyone actually finds a document.
//
// The filename is gone from the face of it. "scan_0043.pdf" identifies
// nothing, and it is still on the row (original_filename) for anyone who
// needs it. What replaces it is the manager's own description, typed here,
// and their tags. Those are the things that make a document findable later.
//
// Everything else is on hover: the date sits over the preview, delete
// appears in the corner. Nothing takes space when it is not being used.

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
  selected: boolean;
  /** True once anything on the page is selected, so every card shows its
   *  checkbox rather than only the ones already picked. */
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
  const isImage = doc.mime_type?.startsWith("image/");
  // A PDF, or an Office file we have rendered to one. Anything else has no
  // page to show and falls back to the extension plate.
  const isPreviewable =
    doc.mime_type === "application/pdf" || doc.pdf_status === "complete";
  const tags = doc.tags ?? [];

  const extension =
    doc.file_name.includes(".") ? doc.file_name.split(".").pop()!.toUpperCase() : "FILE";

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
      )}
    >
      {/* Preview. Tall enough that a page is legible, and the whole thing is
          the click target for opening. */}
      <button
        type="button"
        onClick={onOpen}
        className="relative block h-64 w-full cursor-pointer overflow-hidden bg-muted"
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={viewUrl} alt="" className="h-full w-full object-cover" />
        ) : isPreviewable ? (
          // The first page, rendered by the browser at a fixed scroll
          // position. Non-interactive: the card opens the real viewer.
          <object
            data={`${viewUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            type="application/pdf"
            className="pointer-events-none h-full w-full"
            aria-hidden
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="rounded-md bg-cool-muted px-3 py-1.5 text-sm font-semibold text-cool-muted-foreground">
              {extension}
            </span>
          </div>
        )}

        {/* Date, over the image. Relative while it still means something,
            then the date. */}
        <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-xs font-medium text-white">
          {relativeDate(doc.created_at)}
        </span>
      </button>

      {!readOnly && (
        <>
          <div
            className={cn(
              "absolute left-3 top-3 z-10 transition-opacity",
              selected || selectionActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <Checkbox
              checked={selected}
              onCheckedChange={onToggleSelect}
              aria-label={`Select ${doc.file_name}`}
              className="border-white/70 bg-black/40 data-[checked]:border-primary"
            />
          </div>

          {/* Delete lives under the date, appearing on hover, so the corner
              is not two permanent controls over the preview. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`Delete ${doc.file_name}`}
            className="absolute right-2 top-9 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}

      {/* What it is, in the manager's words, and how it is filed. */}
      <div className="flex flex-col gap-1.5 border-t border-border p-2.5">
        <AutoGrowTextarea
          value={description}
          onChange={setDescription}
          onCommit={onDescriptionCommit}
          placeholder="What is this?"
          disabled={readOnly}
        />
        <div className="flex flex-wrap items-center gap-1">
          {tags.map((t) => (
            <TagChip
              key={t.id}
              tag={t}
              onRemove={readOnly ? undefined : () => onToggleTag(t.id)}
            />
          ))}
          {!readOnly && (
            <TagPicker
              allTags={allTags}
              selectedIds={tags.map((t) => t.id)}
              onToggle={onToggleTag}
              onCreate={onCreateTag}
            />
          )}
        </div>
      </div>
    </div>
  );
}
