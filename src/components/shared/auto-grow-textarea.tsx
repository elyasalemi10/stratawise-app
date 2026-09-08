"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A note box that shows what it holds and grows only when it has to.
 *
 * Two things it must not do, both of which it did:
 *
 * It must not change size when clicked. It was sized in rows and re-measured
 * on focus, so a short note produced a scrollHeight under the resting height
 * and the box shrank away from the cursor. The resting height is now fixed at
 * two lines and focus does not shrink below it.
 *
 * It must not un-wrap. The collapsed state was one nowrap line with an
 * ellipsis, so a two-line note looked like a one-line note until you clicked
 * it and the text reflowed. It now wraps at rest and clips, showing a second
 * line partly cut off, which is what tells you there is more.
 */
export function AutoGrowTextarea({
  value,
  onChange,
  onCommit,
  placeholder,
  maxHeight = 132,
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

  // Resting height: two 20px lines plus padding and borders. Fixed, so the
  // control is exactly the same size before and after a click.
  const REST_HEIGHT = 54;

  const resize = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (!focused) {
      // At rest it is always the resting height. Content taller than that is
      // clipped mid-line, which is the signal that there is more to read.
      el.style.height = `${REST_HEIGHT}px`;
      el.style.overflowY = "hidden";
      return;
    }
    el.style.height = "auto";
    // Never below the resting height, so focusing can only ever grow it.
    const next = Math.min(Math.max(el.scrollHeight, REST_HEIGHT), maxHeight);
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
        "block w-full resize-none rounded-md border bg-card px-2.5 py-1.5 text-sm leading-5 text-foreground",
        "placeholder:text-muted-foreground focus-visible:outline-none",
        // Gold while focused, against the same grey border everything else
        // has. It is the one control on the card you type into.
        focused
          ? "border-[color:var(--brand-gold)] ring-1 ring-[color:var(--brand-gold)]/30"
          : "border-border",
        // Only the border transitions. Height is set imperatively and
        // animating it fought the measurement.
        "transition-[border-color,box-shadow] duration-150 ease-out",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    />
  );
}
