"use client";

import { useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Plus, Trash2, Pencil, Search } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ICON_SVG, ICON_NAMES, iconDataUri } from "@/lib/blog/timeline-icons";

export interface TimelineItem { icon: string; title: string }

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    timeline: { insertTimeline: () => ReturnType };
  }
}

export const Timeline = Node.create({
  name: "timeline",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      items: {
        default: [
          { icon: "Rocket", title: "Started" },
          { icon: "TrendingUp", title: "Grew" },
        ] as TimelineItem[],
        parseHTML: (el) => {
          try { return JSON.parse(el.getAttribute("data-items") ?? "[]"); } catch { return []; }
        },
        renderHTML: (attrs) => ({ "data-items": JSON.stringify(attrs.items ?? []) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="timeline"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const items = (node.attrs.items ?? []) as TimelineItem[];
    // Icons are emitted as <img> with an SVG data-URI — TipTap's DOM-spec
    // renderHTML can't take a raw SVG string as a child, and an <img> renders
    // fine in the marketing site's static HTML.
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "timeline", class: "sw-timeline" }),
      ...items.map((it) => [
        "div", { class: "sw-timeline-item" },
        ["div", { class: "sw-timeline-emoji" },
          ["img", { src: iconDataUri(it.icon), alt: "", width: "20", height: "20" }],
        ],
        ["div", { class: "sw-timeline-body" },
          ["div", { class: "sw-timeline-title" }, it.title || ""],
        ],
      ]),
    ];
  },

  addCommands() {
    return {
      insertTimeline: () => ({ commands }) =>
        commands.insertContent({
          type: this.name,
          attrs: { items: [{ icon: "Rocket", title: "Started" }, { icon: "TrendingUp", title: "Grew" }] },
        }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TimelineNodeView);
  },
});

function TimelineNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const items = (node.attrs.items ?? []) as TimelineItem[];
  const [open, setOpen] = useState(false);

  return (
    <NodeViewWrapper className="my-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline</span>
        {editor.isEditable && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit timeline
          </Button>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {items.map((it, i) => (
          <div key={i} className="relative flex w-44 shrink-0 flex-col items-center text-center">
            {i < items.length - 1 && <span className="absolute left-1/2 top-5 h-0.5 w-full bg-border" aria-hidden />}
            <div
              className="z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground [&_svg]:h-5 [&_svg]:w-5"
              dangerouslySetInnerHTML={{ __html: ICON_SVG[it.icon] ?? ICON_SVG.Rocket }}
            />
            <div className="mt-2 text-sm font-medium text-foreground">{it.title}</div>
          </div>
        ))}
      </div>

      {open && (
        <TimelineEditDialog
          items={items}
          onClose={() => setOpen(false)}
          onSave={(next) => { updateAttributes({ items: next }); setOpen(false); }}
        />
      )}
    </NodeViewWrapper>
  );
}

function TimelineEditDialog({
  items, onClose, onSave,
}: {
  items: TimelineItem[];
  onClose: () => void;
  onSave: (items: TimelineItem[]) => void;
}) {
  const [steps, setSteps] = useState<TimelineItem[]>(items.length ? items : [{ icon: "Rocket", title: "" }]);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filtered = ICON_NAMES.filter((n) => n.toLowerCase().includes(search.toLowerCase().replace(/\s/g, "")));

  function patch(i: number, p: Partial<TimelineItem>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...p } : s)));
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit timeline</DialogTitle>
          <DialogDescription>Add steps; pick an icon and give each a title.</DialogDescription>
        </DialogHeader>

        {pickerFor === null ? (
          <div className="space-y-2">
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2">
                  <button
                    type="button"
                    onClick={() => { setPickerFor(i); setSearch(""); }}
                    title="Choose icon"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground [&_svg]:h-5 [&_svg]:w-5 hover:bg-muted cursor-pointer"
                    dangerouslySetInnerHTML={{ __html: ICON_SVG[s.icon] ?? ICON_SVG.Rocket }}
                  />
                  <Input value={s.title} onChange={(e) => patch(i, { title: e.target.value })} placeholder="Step title" className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-destructive cursor-pointer"
                    aria-label="Remove step"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSteps((prev) => [...prev, { icon: "Star", title: "" }])}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Add step
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button type="button" onClick={() => setPickerFor(null)} className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">← Back to steps</button>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search icons" className="pl-8" autoFocus />
            </div>
            <div className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto">
              {filtered.map((name) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => { patch(pickerFor, { icon: name }); setPickerFor(null); }}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-foreground [&_svg]:h-5 [&_svg]:w-5 hover:bg-muted cursor-pointer"
                  dangerouslySetInnerHTML={{ __html: ICON_SVG[name] }}
                />
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(steps.filter((s) => s.title.trim() || true))}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
