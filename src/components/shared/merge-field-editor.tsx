"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";
import { MERGE_FIELDS } from "@/lib/validations/escalation";

// Inline merge-field editor. Renders {{tokens}} as atomic coloured chips inside
// a contentEditable box; the manager never sees or types raw {{...}}. The value
// in/out is the canonical "...{{token}}..." string so the server's
// renderTemplate keeps working unchanged. Chips behave as one character (the
// browser deletes a contenteditable=false span as a unit).

export interface MergeFieldEditorHandle {
  insertToken: (token: string) => void;
}

const LABEL_BY_TOKEN = new Map(MERGE_FIELDS.map((f) => [f.token, f.label]));

function chipEl(token: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.dataset.token = token;
  span.contentEditable = "false";
  span.className = "mfe-chip";
  span.textContent = LABEL_BY_TOKEN.get(token) ?? token;
  return span;
}

// Build DOM nodes for a value string into the given element.
function renderInto(el: HTMLElement, value: string) {
  el.textContent = "";
  const parts = value.split(/(\{\{[a-z_]+\}\})/g);
  for (const part of parts) {
    if (!part) continue;
    if (/^\{\{[a-z_]+\}\}$/.test(part) && LABEL_BY_TOKEN.has(part)) {
      el.appendChild(chipEl(part));
    } else {
      el.appendChild(document.createTextNode(part));
    }
  }
}

// Serialize the DOM back to the canonical {{token}} string.
function serialize(el: HTMLElement): string {
  let out = "";
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
    else if (node instanceof HTMLElement) {
      if (node.dataset.token) out += node.dataset.token;
      else if (node.tagName === "BR") out += "\n";
      else out += node.textContent ?? "";
    }
  });
  return out;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  singleLine?: boolean;
  rows?: number;
}

export const MergeFieldEditor = forwardRef<MergeFieldEditorHandle, Props>(function MergeFieldEditor(
  { value, onChange, onFocus, placeholder, singleLine, rows = 6 },
  ref,
) {
  const elRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string>("");

  // Initial + external-change render (skip while focused so typing isn't clobbered).
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (value === lastEmitted.current) return;
    renderInto(el, value ?? "");
    lastEmitted.current = value ?? "";
  }, [value]);

  function emit() {
    const el = elRef.current;
    if (!el) return;
    const next = serialize(el);
    lastEmitted.current = next;
    onChange(next);
  }

  useImperativeHandle(ref, () => ({
    insertToken(token: string) {
      const el = elRef.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      const chip = chipEl(token);
      const space = document.createTextNode(" ");
      if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(space);
        range.insertNode(chip);
        range.setStartAfter(space);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        el.appendChild(chip);
        el.appendChild(space);
      }
      emit();
    },
  }));

  return (
    <div
      ref={elRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={!singleLine}
      data-placeholder={placeholder}
      onInput={emit}
      onBlur={emit}
      onFocus={onFocus}
      onKeyDown={(e) => { if (singleLine && e.key === "Enter") e.preventDefault(); }}
      style={singleLine ? undefined : { minHeight: `${rows * 1.5}rem` }}
      className={cn(
        "mfe w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground",
        "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
        singleLine ? "overflow-x-auto whitespace-nowrap" : "whitespace-pre-wrap break-words",
      )}
    />
  );
});
