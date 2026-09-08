"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * One row that grows as you type and snaps back when you leave.
 *
 * The collapsed state is deliberately one line: a grid of cards each holding
 * a four-line box is mostly empty boxes. It grows to fit while focused, up to
 * a ceiling, then scrolls, so one long description cannot push a card to
 * twice the height of its neighbours and break the grid.
 *
 * The scrollbar is hidden rather than styled. At this size a visible bar is
 * most of the width of the control, and the content scrolling is the
 * affordance.
 */
/** The resting height, matching min-h-9 plus the border. */
const MIN_HEIGHT = 36;

export function AutoGrowTextarea({
  value,
  onChange,
  onCommit,
  placeholder,
  maxHeight = 120,
  className,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  /** Fired on blur, and only when the value actually changed. */
  onCommit?: (value: string) => void;
  placeholder?: string;
  maxHeight?: number;
  className?: string;
} & Omit<React.ComponentProps<"textarea">, "value" | "onChange" | "className">) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = React.useState(false);
  const committed = React.useRef(value);

  // Height is measured, not counted: wrapping depends on the rendered width
  // and the font, so scrollHeight is the only thing that knows.
  const resize = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (!focused) {
      el.style.height = "";
      el.style.overflowY = "hidden";
      return;
    }
    el.style.height = "auto";
    // Never below the collapsed height. Without the floor a short note
    // measured smaller than the resting box and the control shrank the
    // moment it was clicked.
    const next = Math.min(Math.max(el.scrollHeight, MIN_HEIGHT), maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [focused, maxHeight]);

  React.useEffect(() => {
    resize();
  }, [resize, value]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        if (committed.current !== value) {
          committed.current = value;
          onCommit?.(value);
        }
        props.onBlur?.(e);
      }}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        // min-h, not a row count. Sizing by rows let the box SHRINK on focus
        // when the resize measured a scrollHeight under one line, which read
        // as the control flinching away from the click.
        "block min-h-9 w-full resize-none rounded-md border bg-card px-2.5 py-1.5 text-sm leading-6 text-foreground",
        "placeholder:text-muted-foreground focus-visible:outline-none",
        // Gold while focused, against the same grey border everything else
        // has. It is the one control on the card you type into, and it
        // should look like it once you are in it.
        focused
          ? "border-[color:var(--brand-gold)] ring-1 ring-[color:var(--brand-gold)]/30"
          : "border-border",
        "transition-[height,border-color,box-shadow] duration-150 ease-out",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        !focused && "overflow-hidden whitespace-nowrap text-ellipsis",
        className,
      )}
    />
  );
}
