"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Plus, Trash2 } from "lucide-react";

// A horizontal timeline block for blog posts. Each item is { emoji, title,
// description }. The data lives in the node's `items` attribute; renderHTML
// emits semantic markup (with sw-timeline-* classes) so the published HTML
// drops straight into the marketing site, and a React node view handles
// editing inside the admin editor.

export interface TimelineItem {
  emoji: string;
  title: string;
  description: string;
}

const QUICK_EMOJIS = ["🚀", "🎉", "📈", "🛠️", "✅", "💡", "🏢", "📅", "🔒", "⭐"];

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    timeline: {
      insertTimeline: () => ReturnType;
    };
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
        default: [{ emoji: "🚀", title: "Milestone", description: "Describe this step" }] as TimelineItem[],
        parseHTML: (el) => {
          const raw = el.getAttribute("data-items");
          try {
            return raw ? JSON.parse(raw) : [];
          } catch {
            return [];
          }
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
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "timeline", class: "sw-timeline" }),
      ...items.map((it) => [
        "div",
        { class: "sw-timeline-item" },
        ["div", { class: "sw-timeline-emoji" }, it.emoji || "•"],
        [
          "div",
          { class: "sw-timeline-body" },
          ["div", { class: "sw-timeline-title" }, it.title || ""],
          ["div", { class: "sw-timeline-desc" }, it.description || ""],
        ],
      ]),
    ];
  },

  addCommands() {
    return {
      insertTimeline:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              items: [
                { emoji: "🚀", title: "Started", description: "What happened first" },
                { emoji: "📈", title: "Grew", description: "What happened next" },
              ],
            },
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TimelineNodeView);
  },
});

function TimelineNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const items = (node.attrs.items ?? []) as TimelineItem[];
  const editable = editor.isEditable;

  function update(next: TimelineItem[]) {
    updateAttributes({ items: next });
  }
  function patch(i: number, patch: Partial<TimelineItem>) {
    update(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    update([...items, { emoji: "⭐", title: "New step", description: "" }]);
  }
  function removeItem(i: number) {
    update(items.filter((_, idx) => idx !== i));
  }

  return (
    <NodeViewWrapper className="my-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline</span>
        {editable && (
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted cursor-pointer"
          >
            <Plus className="h-3 w-3" /> Add step
          </button>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {items.map((it, i) => (
          <div key={i} className="relative flex w-48 shrink-0 flex-col items-center text-center">
            {/* connector line */}
            {i < items.length - 1 && (
              <span className="absolute left-1/2 top-5 h-0.5 w-full bg-border" aria-hidden />
            )}
            <div className="z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-lg">
              {it.emoji || "•"}
            </div>
            {editable ? (
              <div className="mt-2 w-full space-y-1.5">
                <div className="flex flex-wrap justify-center gap-1">
                  {QUICK_EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => patch(i, { emoji: e })}
                      className={`rounded px-1 text-sm hover:bg-muted ${it.emoji === e ? "bg-muted" : ""}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <input
                  value={it.emoji}
                  onChange={(e) => patch(i, { emoji: e.target.value.slice(0, 4) })}
                  placeholder="Emoji"
                  className="w-full rounded-md border border-border bg-card px-2 py-1 text-center text-sm"
                />
                <input
                  value={it.title}
                  onChange={(e) => patch(i, { title: e.target.value })}
                  placeholder="Title"
                  className="w-full rounded-md border border-border bg-card px-2 py-1 text-center text-sm font-medium"
                />
                <textarea
                  value={it.description}
                  onChange={(e) => patch(i, { description: e.target.value })}
                  placeholder="Description"
                  rows={2}
                  className="w-full rounded-md border border-border bg-card px-2 py-1 text-center text-xs"
                />
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              </div>
            ) : (
              <div className="mt-2">
                <div className="text-sm font-medium text-foreground">{it.title}</div>
                <div className="text-xs text-muted-foreground">{it.description}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </NodeViewWrapper>
  );
}
