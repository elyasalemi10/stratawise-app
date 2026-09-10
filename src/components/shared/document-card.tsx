"use client";

import * as React from "react";
import { Download, Loader2, Tag as TagIcon, Trash2, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AutoGrowTextarea } from "@/components/shared/auto-grow-textarea";
import { BrandLoader } from "@/components/shared/brand-mark";
import {
  FileTypeIllustration,
  fileKindFor,
  fileTypeLabel,
} from "@/components/shared/file-type-illustration";
import { TagField } from "@/components/shared/tag-picker";
import { relativeDate } from "@/lib/relative-date";
import { cn } from "@/lib/utils";
import type { DocumentTag, TagColour } from "@/lib/document-tags-shared";

// A document card is mostly the document.
//
// The chrome lives in a strip ABOVE the preview rather than over it: the date
// on the right, the checkbox on the left, and download / delete appearing in
// that strip on hover. Sitting them on the image meant they were unreadable
// against a light page and covered the part of the document you were trying
// to recognise. Each cluster gets its own small plate so it stays legible
// wherever it lands.
//
// The filename is not shown. "scan_0043.pdf" identifies nothing, and it is
// still on the row as original_filename. What replaces it is the manager's
// note and their tags, which are the things that make a document findable.

/** The CARD is square, not the preview inside it.
 *
 *  Making the preview square left the card a tall rectangle: the chrome
 *  strip and the two-control footer are another 130-odd pixels on top of a
 *  full card's width. So the square is the outside, and the preview takes
 *  whatever height is left over, which is also what makes a growing note
 *  box safe: it eats into the preview instead of the card.
 *
 *  Every column is the same width, so every card is exactly as tall as its
 *  neighbours at any window size. */
const CARD_SHAPE = "aspect-square";

export interface DocumentCardDoc {
  id: string;
  file_name: string;
  mime_type: string | null;
  created_at: string;
  description?: string | null;
  pdf_status?: string;
  ocr_status?: string;
  thumbnail_storage_key?: string | null;
  tags?: DocumentTag[];
}

export function DocumentCard({
  doc,
  thumbnailUrl,
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
  thumbnailUrl: string;
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

  // Everything with a preview now has a STORED thumbnail: images get one at
  // upload, PDFs get their first page rendered, and an Office file gets one
  // when it is converted. The card never embeds a PDF any more, so the
  // browser's grey built-in viewer cannot appear in the grid, and opening
  // the page no longer downloads twelve whole documents to show twelve
  // pictures.
  const hasThumbnail = Boolean(doc.thumbnail_storage_key);
  const typeLabel = fileTypeLabel(doc.mime_type, doc.file_name);
  const tags = doc.tags ?? [];

  return (
    <div
      className={cn(
        CARD_SHAPE,
        "group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
      )}
    >
      {/* Chrome strip. Fixed height so hover does not resize the card. */}
      <div
        className="relative flex h-9 shrink-0 items-center justify-between px-2"
        onClick={selectionActive && !readOnly ? onToggleSelect : undefined}
      >
        {!readOnly ? (
          <div
            className={cn(
              // Its own ground, like the action cluster: a bare checkbox
              // against a light strip is invisible half the time.
              "rounded-md bg-muted/90 p-1 shadow-sm backdrop-blur-sm transition-opacity",
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

        {/* Over the date, on hover, on its own plate. The date is not needed
            while you are reaching for an action, and the two never fight for
            the corner. */}
        {!readOnly && (
          <div className="absolute right-1.5 flex items-center gap-0.5 rounded-md bg-muted/90 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100">
            <a
              href={downloadUrl}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Download ${doc.file_name}`}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              aria-label={`Delete ${doc.file_name}`}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-card hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Once ANYTHING is selected the whole preview toggles selection
          instead of opening. Picking out six documents to zip meant six
          trips to a 16px checkbox, and hitting the card by mistake threw
          you into the viewer and lost your place. The note box, the tag
          field and the two action buttons keep their own behaviour, so
          nothing you can reach is ambiguous. */}
      <button
        type="button"
        onClick={selectionActive && !readOnly ? onToggleSelect : onOpen}
        className="relative block min-h-0 w-full flex-1 cursor-pointer overflow-hidden bg-muted"
        aria-label={
          selectionActive && !readOnly
            ? `${selected ? "Deselect" : "Select"} ${doc.file_name}`
            : `Open ${doc.file_name}`
        }
      >
        {hasThumbnail ? (
          <>
            {!previewReady && <BrandLoader className="absolute inset-0" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailUrl}
              alt=""
              decoding="async"
              loading="lazy"
              onLoad={() => setPreviewReady(true)}
              onError={() => setPreviewReady(true)}
              className={cn(
                // object-top, not the default centre. The interesting part
                // of a document is its top, and centring the crop cut it off.
                "h-full w-full object-cover object-top transition-opacity duration-200",
                previewReady ? "opacity-100" : "opacity-0",
              )}
            />
          </>
        ) : (
          // No page to show. The drawing says what kind of thing it is at a
          // glance; the caption says WHICH one, because "spreadsheet" does
          // not distinguish the CSV bank export from the XLSX budget and the
          // manager thinks of them by exactly that difference.
          //
          // It does not say "No preview". That is a sentence about what the
          // app failed to do, printed on every card that will never have one,
          // and it told the manager nothing they could act on. And no
          // promises either: this used to say "Getting this one ready" while
          // a conversion was pending, which is hope, not information.
          <div className="flex h-full w-full flex-col items-center justify-center gap-1">
            <FileTypeIllustration
              kind={fileKindFor(doc.mime_type, doc.file_name)}
              className="h-14 w-14"
            />
            {typeLabel && (
              <span className="text-xs font-medium tracking-wide text-muted-foreground">
                {typeLabel}
              </span>
            )}
          </div>
        )}
      </button>

      <div className="flex shrink-0 flex-col gap-1.5 border-t border-border p-2.5">
        <AutoGrowTextarea
          value={description}
          onChange={setDescription}
          onCommit={onDescriptionCommit}
          placeholder="Add a note"
          disabled={readOnly}
        />
        {/* One field holding the tags, not a row of loose pills. It looks
            like the note box above it because it does the same job, and it
            scrolls sideways so adding a tag never grows the card. */}
        <TagField
          tags={tags}
          allTags={allTags}
          readOnly={readOnly}
          onToggle={onToggleTag}
          onCreate={onCreateTag}
        />
      </div>
    </div>
  );
}

/** A file mid-upload. The square is the shape it will be; nothing else is
 *  known yet, so nothing else is shown. */
export function DocumentUploadCard({
  failed,
  error,
  onDismiss,
}: {
  failed?: boolean;
  error?: string;
  onDismiss?: () => void;
}) {
  return (
    <div className={cn(CARD_SHAPE, "relative flex flex-col overflow-hidden rounded-lg border border-border bg-card")}>
      {/* The same strip a finished card has, carrying today's date. The
          card is about to become one, and a blank white band that fills in
          a second later is a layout the eye has to re-read. */}
      <div className="flex h-9 shrink-0 items-center justify-end px-2">
        <span className="text-xs font-medium text-muted-foreground">Just now</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-muted px-4 text-center">
        {failed ? (
          <>
            <span className="text-sm font-medium text-destructive">Upload failed</span>
            {error && <span className="text-xs text-muted-foreground">{error}</span>}
          </>
        ) : (
          // A wheel, not the brand mark. The mark means "your document is
          // coming"; a spinner means "this is working", which is the honest
          // description of an upload in flight.
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        )}
      </div>
      {/* The footer a finished card has, with the two controls drawn as they
          will look. Two empty outlines, one a thin strip and one a box with
          nothing in it, read as a card that had failed to render; the same
          two boxes saying "Add a note" and "Add tags" read as a card that is
          simply not filled in yet, which is what it is. */}
      <div
        aria-hidden
        className="flex shrink-0 flex-col gap-1.5 border-t border-border p-2.5"
      >
        <div className="flex h-[38px] items-center rounded-md border border-border bg-card px-2.5 text-sm text-muted-foreground">
          Add a note
        </div>
        <div className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-2.5">
          <TagIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Add tags</span>
        </div>
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
