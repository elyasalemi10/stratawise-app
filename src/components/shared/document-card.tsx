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
import { TAG_FIELD_SHELL, TagField } from "@/components/shared/tag-picker";
import {
  CARD_CHROME,
  CARD_FOOTER,
} from "@/components/shared/document-card-skeleton";
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

/** 4:3, on every branch, and nothing inside it may affect its height.
 *
 *  `aspect-ratio` sets the height from the width, but only when nothing else
 *  wins first, and inside a flex column two things do. A flex item's
 *  automatic minimum size is its CONTENT size, so a portrait photo made the
 *  box as tall as the photo. And an element whose contents are in normal
 *  flow still has an intrinsic height for the ratio to lose to, which is why
 *  the same box came out barely taller than an icon when there was no image.
 *
 *  So: `min-h-0` removes the automatic minimum, and everything inside is
 *  positioned absolutely, which takes it out of flow entirely. The box's
 *  height then has exactly one source. That is why the branches all look the
 *  same now and did not before, whatever they contain.
 *
 *  The card itself has no height. It is a flex column of strip, preview and
 *  footer, and the footer carries flex-1 so it absorbs whatever slack the
 *  grid gives it. Do not set a height on the card to "fix" the alignment. */
const PREVIEW_SHAPE = "relative block aspect-[4/3] w-full min-h-0 shrink-0 overflow-hidden";

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

function DocumentCardInner({
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
  onTagsClosed,
}: {
  doc: DocumentCardDoc;
  thumbnailUrl: string;
  downloadUrl: string;
  selected: boolean;
  selectionActive: boolean;
  readOnly?: boolean;
  allTags: DocumentTag[];
  // Every callback takes the document id rather than closing over it, so
  // the parent can hand all sixty cards the same function reference. Without
  // that, memo below buys nothing: a new closure per card per render makes
  // every prop compare unequal, and one keystroke in one note re-renders the
  // whole grid.
  onOpen: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDescriptionCommit: (id: string, value: string) => void;
  onToggleTag: (id: string, tagId: string) => void;
  onCreateTag: (name: string, colour: TagColour) => Promise<DocumentTag | null>;
  /** The tag picker has shut. Whatever was ticked gets reported once. */
  onTagsClosed: (id: string) => void;
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
        "group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
      )}
    >
      {/* Chrome strip, at a fixed height so nothing inside it can decide
          how tall the card's top is. */}
      <div
        className={cn(CARD_CHROME, "justify-between")}
        onClick={selectionActive && !readOnly ? () => onToggleSelect(doc.id) : undefined}
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
              onCheckedChange={() => onToggleSelect(doc.id)}
              aria-label={`Select ${doc.file_name}`}
            />
          </div>
        ) : (
          <span />
        )}

        <span className="shrink-0 text-[11px] font-medium text-muted-foreground transition-opacity group-hover:opacity-0">
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
              onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
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
        onClick={() => (selectionActive && !readOnly ? onToggleSelect(doc.id) : onOpen(doc.id))}
        className={cn(PREVIEW_SHAPE, "cursor-pointer bg-muted/40")}
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
                // Absolute, so the image cannot set the box's height. And
                // object-top, not the default centre: the interesting part
                // of a document is its top, and centring the crop cut it off.
                "absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-200",
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
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <FileTypeIllustration
              kind={fileKindFor(doc.mime_type, doc.file_name)}
              className="size-10"
            />
            {typeLabel && (
              <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
                {typeLabel}
              </span>
            )}
          </span>
        )}
      </button>

      {/* flex-1 is load-bearing: it is what takes up the slack when the grid
          stretches this card to match a taller neighbour, so the tag row is
          flush with the bottom on every card in the row. */}
      <div className={CARD_FOOTER}>
        <AutoGrowTextarea
          value={description}
          onChange={setDescription}
          onCommit={(value) => onDescriptionCommit(doc.id, value)}
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
          onToggle={(tagId) => onToggleTag(doc.id, tagId)}
          onClosed={() => onTagsClosed(doc.id)}
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
    <div className="relative flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      {/* The same strip a finished card has, carrying today's date. The
          card is about to become one, and a blank white band that fills in
          a second later is a layout the eye has to re-read. */}
      <div className={cn(CARD_CHROME, "justify-end")}>
        <span className="text-[11px] font-medium text-muted-foreground">Just now</span>
      </div>
      <div className={cn(PREVIEW_SHAPE, "bg-muted/40")}>
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
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
        </span>
      </div>
      {/* The footer a finished card has, as the same two controls, disabled.
          They were hand-drawn look-alikes before, and a look-alike is only
          ever as accurate as whoever last changed the real one remembered to
          copy: the note box came out a couple of pixels off, which is what
          made a finished upload nudge its whole grid row down. A real
          textarea and the real tag strip cannot be a couple of pixels off. */}
      <div aria-hidden className={CARD_FOOTER}>
        <AutoGrowTextarea
          value=""
          onChange={() => {}}
          placeholder="Add a note"
          disabled
          tabIndex={-1}
          className="bg-muted/40 placeholder:text-muted-foreground/60"
        />
        <div
          className={cn(
            TAG_FIELD_SHELL,
            "border border-border bg-muted/40 text-muted-foreground/60",
          )}
        >
          <TagIcon className="h-3.5 w-3.5 shrink-0" />
          <span>Add tags</span>
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

/** Memoised, because a documents page is sixty of these and a note is typed
 *  one character at a time. The parent's callbacks are stable (see the prop
 *  types above), so a card only re-renders when its own row changes. */
export const DocumentCard = React.memo(DocumentCardInner);
