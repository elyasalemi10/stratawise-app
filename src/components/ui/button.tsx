"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm rounded-md hover:bg-primary/90 hover:ring-2 hover:ring-[var(--brand-gold)]/40 transition-shadow",
        // Grey fill, no border. The page is white now, so a white button
        // needed a border just to be seen, and the border was doing all the
        // work. Grey IS the button, which also frees the border to mean
        // "this is a field" instead of meaning two things at once.
        // Use for every Back / Cancel / "go back" action.
        secondary:
          "bg-secondary text-secondary-foreground rounded-md hover:bg-secondary-hover",
        destructive:
          "bg-destructive text-white rounded-md shadow-sm hover:bg-destructive/90",
        ghost:
          "bg-transparent text-muted-foreground rounded-md hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        outline:
          "border border-input bg-background rounded-md hover:bg-muted hover:text-foreground",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5",
        icon: "h-8 w-8",
        "icon-sm": "h-7 w-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Show a spinner and block interaction, WITHOUT resizing the button.
     *
     *  The pattern this replaces was `{pending && <Loader2 />}` in front of
     *  the label, which widens the button by the icon plus its gap the
     *  moment you click it. Every row of buttons around it shifts, which is
     *  the one thing a loading state should not do.
     *
     *  Here the label stays in the layout and just goes invisible, so the
     *  button keeps its exact width, and the spinner is centred over it.
     *  The label text is unchanged too , never swap it for "Saving..."
     *  (CLAUDE.md). */
    loading?: boolean
  }) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }), loading && "relative")}
      // A button mid-request must not be clickable twice, but `disabled`
      // alone would also drop the focus ring and the pointer cursor, so
      // aria-busy carries the meaning for assistive tech.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span
          className="absolute inset-0 flex items-center justify-center"
          aria-hidden
        >
          <Loader2 className="size-4 animate-spin" />
        </span>
      )}
      {/* invisible, not hidden: it still occupies its width. */}
      <span className={cn("contents", loading && "invisible")}>{children}</span>
    </button>
  )
}

export { Button, buttonVariants }
