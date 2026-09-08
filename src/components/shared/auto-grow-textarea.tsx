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

  // Resting height: one line and a bit. Enough that a wrapped note is
  // visibly cut mid-second-line, which is what says there is more, without
  // a grid of cards each holding two mostly-empty lines. Fixed, so the
  // control is exactly the same size before and after a click.
  // One line, plus just enough of the next to show the dot of an i.
  //
  // leading-5 is a 20px line, py-1.5 is 6px each side, and the border is 1px
  // each side, so exactly one line occupies 34px. Five more is a sliver of
  // the second line: enough to say "there is more" and not enough to be a
  // second line of its own.
  const REST_HEIGHT = 39;

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
        // Border colour only, no ring. A ring is drawn OUTSIDE the border,
        // so the box visibly grew by a pixel on each side the moment it was
        // clicked, which is the "it expands a tiny bit" with no content in
        // it: the height never changed, the ring did.
        focused ? "border-[color:var(--brand-gold)]" : "border-border",
        // Only the border transitions. Height is set imperatively and
        // animating it fought the measurement.
        "transition-[border-color] duration-150 ease-out",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    />
  );
}
