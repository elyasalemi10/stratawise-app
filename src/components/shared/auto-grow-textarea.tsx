"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * One line at rest, as tall as it needs while you are in it.
 *
 * Earlier attempts measured the textarea and every one of them bounced, and
 * I concluded a textarea could not be measured without being seen to resize.
 * That was wrong, and the three details below are why:
 *
 *  1. **Add the border back.** box-sizing is border-box and `scrollHeight`
 *     excludes the border, so a height taken from scrollHeight alone lands
 *     two pixels short. The box shrinks, then grows to fit. That is the
 *     bounce, and it happened on every single focus.
 *
 *  2. **Turn the transition off around the measurement.** Reading
 *     scrollHeight after setting height to 0 forces a style flush, so 0
 *     becomes the transition's starting point and the box animates open from
 *     nothing. Off, restore the old height, force a reflow, back on, then
 *     set the real height. It must only ever move once.
 *
 *  3. **Clear the height rather than setting the base.** Only ever assign an
 *     inline height when the content genuinely needs more than one line.
 *     Clicking into a short note should do nothing at all, and deleting back
 *     down to one line should snap rather than ease.
 *
 * Past `maxHeight` it scrolls, with no visible scrollbar: a bar appearing
 * inside the box takes width from the text and rewraps every line, which
 * reads as a flash.
 */
export function AutoGrowTextarea({
  value,
  onChange,
  onCommit,
  placeholder,
  className,
  maxHeight = 160,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  /** Fired on blur, and only when the value actually changed. */
  onCommit?: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Past this it scrolls instead of growing. */
  maxHeight?: number;
} & Omit<React.ComponentProps<"textarea">, "value" | "onChange" | "className">) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  /** The one-line height and the border, measured once while at rest. */
  const metrics = React.useRef<{ base: number; border: number } | null>(null);
  const [focused, setFocused] = React.useState(false);
  const committed = React.useRef(value);

  const grow = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;

    if (!metrics.current) {
      const style = getComputedStyle(el);
      metrics.current = {
        base: el.offsetHeight,
        border:
          (parseFloat(style.borderTopWidth) || 0) +
          (parseFloat(style.borderBottomWidth) || 0),
      };
    }
    const { base, border } = metrics.current;

    const saved = el.style.height;
    el.style.transition = "none";
    el.style.height = "0px";
    const needed = el.scrollHeight + border;
    el.style.height = saved;
    // Force the restored height to land before transitions come back on, or
    // the browser coalesces the whole sequence and animates from zero.
    void el.offsetHeight;
    el.style.transition = "";

    el.style.height = needed <= base ? "" : `${Math.min(needed, maxHeight)}px`;
  }, [maxHeight]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      value={value}
      // The whole note on hover, since the box shows one line of it.
      title={value || undefined}
      placeholder={placeholder}
      onFocus={(e) => {
        setFocused(true);
        grow();
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        // Back to one line. A grid of cards each holding four lines of
        // someone else's note is not a grid anyone can scan.
        e.currentTarget.style.height = "";
        if (committed.current !== value) {
          committed.current = value;
          onCommit?.(value);
        }
        props.onBlur?.(e);
      }}
      onChange={(e) => {
        onChange(e.target.value);
        grow();
      }}
      className={cn(
        "block min-h-0 w-full resize-none overflow-y-auto rounded-md border bg-card px-2.5 py-1.5",
        "text-xs leading-snug text-foreground placeholder:text-muted-foreground focus-visible:outline-none",
        // Border colour only. A ring is drawn OUTSIDE the border and made
        // the box look a pixel bigger on every side the moment it was
        // clicked, which is what "it expands" was.
        focused ? "border-[color:var(--brand-gold)]" : "border-border",
        "transition-[height,border-color] duration-200 ease-out",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    />
  );
}
