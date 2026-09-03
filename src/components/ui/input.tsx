import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      // The BORDER marks a field, not the fill.
      //
      // On the old grey page a white fill was enough to say "type here". On
      // white it says nothing, so --input is a deliberately darker grey than
      // --border: a card edge should be quiet, a field edge should not.
      //
      // Inputs sit on white (bg-card) regardless of whether the surrounding
      // container is the cream/grey page bg or a card. Grey border defines
      // the shape; white fill keeps it readable against a grey wizard layout
      // and keeps in-card inputs visually consistent.
      className={cn(
        "h-9 w-full rounded-md border border-input bg-card px-3 text-sm transition-colors outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
