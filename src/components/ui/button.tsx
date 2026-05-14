"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm rounded-md hover:bg-primary/90 hover:ring-2 hover:ring-[var(--brand-gold)]/40 transition-shadow",
        // Secondary buttons sit on EITHER the grey page bg OR the white
        // dialog bg, so they explicitly carry white (bg-card) + a border.
        // This gives them clear button affordance on both surfaces — the
        // earlier bg-transparent version disappeared into the dialog's
        // white card with only a faint border to suggest a clickable
        // shape. Use this variant for every Back / Cancel / "go back to
        // previous state" button.
        secondary:
          "bg-card border border-border text-foreground rounded-md hover:bg-muted",
        destructive:
          "bg-destructive text-white rounded-md shadow-sm hover:bg-destructive/90",
        ghost:
          "bg-transparent text-muted-foreground rounded-md hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        outline:
          "border border-border bg-background rounded-md hover:bg-muted hover:text-foreground",
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
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
