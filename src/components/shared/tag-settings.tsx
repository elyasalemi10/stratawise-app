"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  TAG_COLOURS,
  TAG_COLOUR_CLASS,
  TAG_COLOUR_DOT,
  randomTagColour,
  type DocumentTag,
  type TagColour,
} from "@/lib/document-tags-shared";
import {
  createDocumentTag,
  deleteDocumentTag,
  listDocumentTags,
} from "@/lib/actions/document-tags";

// The firm's filing vocabulary, managed in one place.
//
// Tags can also be created from the document card, which is where filing
// actually happens. This screen is for the other half: seeing the whole list,
// renaming the habit, and removing labels that turned out to be duplicates.
//
// Company-scoped, not per OC: a certificate of currency means the same thing
// on every building the firm runs, and per-OC vocabularies would mean
// retyping the same twenty labels for each.

export function TagSettings() {
  const [tags, setTags] = React.useState<DocumentTag[] | null>(null);
  const [name, setName] = React.useState("");
  const [colour, setColour] = React.useState<TagColour>(() => randomTagColour());
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    listDocumentTags()
      .then(setTags)
      .catch((err) => {
        console.error("[tag-settings] load failed:", err);
        setTags([]);
      });
  }, []);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const res = await createDocumentTag(trimmed, colour);
    setSaving(false);
    if (res.error || !res.tag) {
      toast.error(res.error ?? "Couldn't add that tag.");
      return;
    }
    setTags((prev) => [...(prev ?? []), res.tag!].sort((a, b) => a.name.localeCompare(b.name)));
    setName("");
    setColour(randomTagColour());
  }

  async function remove(tag: DocumentTag) {
    // Optimistic: the row is gone from the screen before the round trip, and
    // put back if the server refuses.
    const previous = tags ?? [];
    setTags(previous.filter((t) => t.id !== tag.id));
    const res = await deleteDocumentTag(tag.id);
    if (res.error) {
      toast.error(res.error);
      setTags(previous);
      return;
    }
    toast.success(`"${tag.name}" removed`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="new-tag">
            New tag
          </label>
          <Input
            id="new-tag"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="Tag name"
          />
        </div>
        <div className="flex items-center gap-1 pb-2">
          {TAG_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColour(c)}
              aria-label={c}
              className={cn(
                "h-5 w-5 cursor-pointer rounded-full transition-transform",
                TAG_COLOUR_DOT[c],
                colour === c ? "scale-110 ring-2 ring-foreground/40 ring-offset-1" : "hover:scale-110",
              )}
            />
          ))}
        </div>
        <Button onClick={add} disabled={saving || !name.trim()} loading={saving}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {tags === null ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-24 rounded-full" />
          ))}
        </div>
      ) : tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tags yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                TAG_COLOUR_CLASS[tag.colour] ?? TAG_COLOUR_CLASS.slate,
              )}
            >
              {tag.name}
              <button
                type="button"
                onClick={() => remove(tag)}
                aria-label={`Remove ${tag.name}`}
                className="cursor-pointer opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
