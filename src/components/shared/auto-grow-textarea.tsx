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
    const next = Math.min(el.scrollHeight, maxHeight);
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
        "w-full resize-none rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground",
        "placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none",
        // The collapsed state is exactly one line, and the transition is on
        // height so growing reads as the box opening rather than jumping.
        "transition-[height] duration-150 ease-out",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        !focused && "overflow-hidden whitespace-nowrap text-ellipsis",
        className,
      )}
    />
  );
}
