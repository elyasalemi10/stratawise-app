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
}: {
  allTags: DocumentTag[];
  selectedIds: string[];
  onToggle: (tagId: string) => void;
  onCreate: (name: string, colour: TagColour) => Promise<DocumentTag | null>;
  disabled?: boolean;
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
      <PopoverTrigger
        disabled={disabled}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-50"
      >
        <TagIcon className="h-3.5 w-3.5" />
        Add tags
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
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggle(tag.id)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
              >
                <span
                  className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TAG_COLOUR_DOT[tag.colour] ?? TAG_COLOUR_DOT.slate)}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{tag.name}</span>
                {on && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
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
