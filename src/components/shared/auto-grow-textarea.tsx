"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A fixed-height note box.
 *
 * It does not resize. Not on focus, not while typing, not on blur.
 *
 * Three attempts at growing it all produced the same complaint, and the
 * reason is that a textarea cannot be measured and resized without changing
 * size: `scrollHeight` is read with `height: auto`, which reflows the element
 * before the new height is applied, and the browser paints that intermediate
 * frame. Even when the arithmetic lands on the same number it started from,
 * the element has been through a different height to get there. The only way
 * for a box not to change size is for nothing to set its size.
 *
 * So it is one height always, tall enough to show a line and the top of the
 * next, and long notes scroll inside it. The scrollbar is hidden because at
 * this width a visible one is most of the control; the content moving is the
 * affordance.
 */
export function AutoGrowTextarea({
  value,
  onChange,
  onCommit,
  placeholder,
  className,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  /** Fired on blur, and only when the value actually changed. */
  onCommit?: (value: string) => void;
  placeholder?: string;
  className?: string;
} & Omit<React.ComponentProps<"textarea">, "value" | "onChange" | "className">) {
  const [focused, setFocused] = React.useState(false);
  const committed = React.useRef(value);

  return (
    <textarea
      {...props}
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
        // h-[38px] is one 20px line plus 6px padding each side plus 1px
        // border each side, and then some: enough of the second line to
        // show the tops of its letters, so a wrapped note is visibly
        // continuing rather than ending.
        "block h-[38px] w-full resize-none overflow-y-auto rounded-md border bg-card px-2.5 py-1.5",
        "text-sm leading-5 text-foreground placeholder:text-muted-foreground focus-visible:outline-none",
        // Border colour only. A ring is drawn OUTSIDE the border and made
        // the box look a pixel bigger on every side the moment it was
        // clicked, which is what "it expands" was.
        focused ? "border-[color:var(--brand-gold)]" : "border-border",
        "transition-[border-color] duration-150 ease-out",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    />
  );
}
