"use client";

import * as React from "react";
import { Check, Plus, Tag as TagIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TAG_COLOURS,
  TAG_COLOUR_CLASS,
  TAG_COLOUR_DOT,
  randomTagColour,
  type DocumentTag,
  type TagColour,
} from "@/lib/document-tags-shared";

/** One tag, rendered the same everywhere it appears. */
export function TagChip({ tag, onRemove }: { tag: DocumentTag; onRemove?: () => void }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TAG_COLOUR_CLASS[tag.colour] ?? TAG_COLOUR_CLASS.slate,
      )}
    >
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="cursor-pointer opacity-60 hover:opacity-100"
          aria-label={`Remove ${tag.name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

/**
 * Pick tags, or make one on the spot.
 *
 * Creating from inside the picker matters more than it looks: filing happens
 * while you are looking at the document, and sending someone to a settings
 * page to define a label first means the document gets filed untagged.
 */
export function TagPicker({
  allTags,
  selectedIds,
  onToggle,
  onCreate,
  disabled,
  compact,
}: {
  allTags: DocumentTag[];
  selectedIds: string[];
  onToggle: (tagId: string) => void;
  onCreate: (name: string, colour: TagColour) => Promise<DocumentTag | null>;
  disabled?: boolean;
  /** Icon only. Once a card is already showing tags the word is redundant
   *  and the strip needs the width. */
  compact?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [colour, setColour] = React.useState<TagColour>(() => randomTagColour());

  const trimmed = query.trim();
  const filtered = allTags.filter((t) =>
    t.name.toLowerCase().includes(trimmed.toLowerCase()),
  );
  const exact = allTags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase());

  async function create() {
    if (!trimmed || creating) return;
    setCreating(true);
    const tag = await onCreate(trimmed, colour);
    setCreating(false);
    if (tag) {
      setQuery("");
      setColour(randomTagColour());
    }
  }

  return (
    <Popover>
      {/* Outlined, so it reads as a control rather than a caption. It sits
          next to a bordered note box and looked like stray text without one. */}
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card font-medium text-muted-foreground transition-colors",
          "hover:border-primary/40 hover:text-foreground disabled:cursor-default disabled:opacity-50",
          compact ? "w-8 justify-center" : "w-full justify-start px-2.5 text-sm",
        )}
        aria-label="Add tags"
      >
        <TagIcon className="h-3.5 w-3.5 shrink-0" />
        {!compact && "Add tags"}
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-0"
        align="start"
        showBackdrop={false}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmed && !exact) {
                e.preventDefault();
                void create();
              }
            }}
            placeholder="Find or create a tag"
            className="h-8"
          />
        </div>

        <div className="max-h-56 overflow-y-auto p-1">
          {filtered.map((tag) => {
            const on = selectedIds.includes(tag.id);
            return (
              // A checkbox, not a row that might be selected. Tags are
              // multi-select, and a tick that only appears once chosen does
              // not say so until after you have guessed.
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggle(tag.id)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-muted"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                  )}
                >
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <TagChip tag={tag} />
              </button>
            );
          })}
          {filtered.length === 0 && !trimmed && (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">No tags yet.</p>
          )}
        </div>

        {trimmed && !exact && (
          <div className="border-t border-border p-2">
            <div className="mb-2 flex items-center gap-1">
              {TAG_COLOURS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColour(c)}
                  aria-label={c}
                  className={cn(
                    "h-4 w-4 cursor-pointer rounded-full ring-offset-1 transition-transform",
                    TAG_COLOUR_DOT[c],
                    colour === c ? "scale-110 ring-2 ring-foreground/40" : "hover:scale-110",
                  )}
                />
              ))}
            </div>
            <Button size="sm" className="w-full" onClick={create} disabled={creating} loading={creating}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Create &ldquo;{trimmed}&rdquo;
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
