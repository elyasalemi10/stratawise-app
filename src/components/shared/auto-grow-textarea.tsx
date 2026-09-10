"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A note box that is one line until you are in it.
 *
 * Three earlier attempts grew it with JavaScript and all three produced the
 * same complaint, that it changes size when you click it. They did, and they
 * could not not: `scrollHeight` can only be read with `height: auto`, which
 * reflows the element to its content height before the new height is
 * applied, and the browser paints that frame. Even landing on the number it
 * started from, the box has been through a different size to get there.
 *
 * So nothing measures anything. The textarea and an invisible copy of its
 * own text share one grid cell; the copy is a normal block that wraps
 * normally, so the cell is exactly as tall as the text needs, and the
 * textarea is stretched to fill it. What the box does on focus is raise a
 * cap, not measure anything, so there is still nothing that can paint an
 * intermediate height.
 *
 * The two have to agree on every property that affects wrapping, so the font,
 * the padding, the border and the line height are declared once and used by
 * both.
 *
 * It is one line at REST, whatever it holds. A card is a thing you scan
 * twelve of, and a long note rendered in full turns its card into a wall of
 * text with the tags pushed off the bottom. So the cap is one line until the
 * box has focus and four lines after that, which is enough to read a note
 * while editing it and few enough that the preview above still has room.
 *
 * The cap is on the SIZER, not the wrapper. Clipping the wrapper would leave
 * a textarea stretched to the full height of its content and simply cut off,
 * so the part below the fold would be unreachable: capping the thing that
 * sets the row height means the textarea is exactly the visible height and
 * scrolls inside it.
 */

/** Everything that decides where a line breaks. Shared, or the mirror lies. */
const SHARED =
  "w-full min-w-0 rounded-md border px-2.5 py-2 text-sm leading-5 font-normal tracking-normal " +
  "whitespace-pre-wrap break-words";

export function AutoGrowTextarea({
  value,
  onChange,
  onCommit,
  placeholder,
  className,
  maxLines = 4,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  /** Fired on blur, and only when the value actually changed. */
  onCommit?: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Beyond this it scrolls instead of growing. */
  maxLines?: number;
} & Omit<React.ComponentProps<"textarea">, "value" | "onChange" | "className">) {
  const [focused, setFocused] = React.useState(false);
  const committed = React.useRef(value);

  // 20px per line + 8px padding each side + 1px border each side.
  const lineBox = (lines: number) => lines * 20 + 18;
  const capped = focused ? lineBox(maxLines) : lineBox(1);

  return (
    <div className="grid">
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
          SHARED,
          "col-start-1 row-start-1 resize-none bg-card text-foreground",
          // Scrollable only while being edited. At rest the box is one line
          // and a scrollbar on it invites a scroll that reveals one line at
          // a time.
          focused ? "overflow-y-auto" : "overflow-hidden",
          "placeholder:text-muted-foreground focus-visible:outline-none",
          // Border colour only. A ring is drawn OUTSIDE the border and made
          // the box look a pixel bigger on every side the moment it was
          // clicked, which is what "it expands" was.
          focused ? "border-[color:var(--brand-gold)]" : "border-border",
          "transition-[border-color] duration-150 ease-out",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
      />
      {/* The sizer. Not rendered to anyone: invisible, untouchable, and out
          of the accessibility tree. The trailing space is what keeps a
          newline at the very end from being collapsed away, which would let
          the box shrink out from under a cursor sitting on the new line. */}
      <div
        aria-hidden
        style={{ maxHeight: capped }}
        className={cn(
          SHARED,
          "pointer-events-none invisible col-start-1 row-start-1 overflow-hidden border-transparent",
          "transition-[max-height] duration-150 ease-out",
          className,
        )}
      >
        {value + " "}
      </div>
    </div>
  );
}
