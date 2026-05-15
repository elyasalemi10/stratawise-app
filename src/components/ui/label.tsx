"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        // select-text (not select-none) so managers can copy field labels for
        // quick "do you have: <field name>?" pastes. The original shadcn
        // default blocks selection on labels for tap-and-hold UX on mobile;
        // we explicitly trade that for desktop copy ergonomics.
        "flex items-center gap-2 text-sm leading-none font-medium select-text group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
