"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"
import { useScrimSlot } from "./use-scrim-stack"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

// Its own component so that claiming a place in the scrim stack happens
// where the scrim actually renders.
//
// This used to be a hook call at the top of PopoverContent, which is
// OUTSIDE the portal. React runs a component function whenever its parent
// renders the element, so every <PopoverContent> in the tree registered a
// scrim: closed ones, and ones passing showBackdrop={false} that never paint
// anything. A page holding a closed date picker or filter popover therefore
// sat permanently on top of the stack, and every sheet and dialog opened
// underneath it rendered transparent. That is why the maintenance drawer
// lost its scrim and why "regenerate levies" had none.
//
// Rendered inside the portal and behind the showBackdrop check, it mounts
// only when there is a scrim to be top OF.
function PopoverBackdrop() {
  useScrimSlot();
  return (
    <PopoverPrimitive.Backdrop
      data-slot="popover-backdrop"
      className={cn(
        // Transparent: the page is dimmed by the single ScrimLayer near the
        // root, not by each overlay. This element exists to catch the click
        // that dismisses. See use-scrim-stack.
        "fixed inset-0 z-40",
      )}
    />
  )
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  showBackdrop = true,
  matchTriggerWidth = false,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  > & { showBackdrop?: boolean; matchTriggerWidth?: boolean }) {
  return (
    <PopoverPrimitive.Portal>
      {showBackdrop && <PopoverBackdrop />}
      <PopoverPrimitive.Positioner
        // fixed, not the Base UI default of absolute.
        //
        // An absolutely-positioned popup is placed in DOCUMENT coordinates,
        // so one that opens near the bottom of a long page extends the
        // document's height. The scroll extent changes, the page reflows,
        // and whatever sits below the trigger visibly jumps , opening a
        // date picker nudged the next field down. Fixed positions against
        // the viewport and can never change document size.
        positionMethod="fixed"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        // --anchor-width is set by Base UI on the POSITIONER, not the popup,
        // so a width on the popup was sizing against nothing. Putting it here
        // is what actually makes the panel match the control it opened from.
        className={cn("isolate z-50", matchTriggerWidth && "w-[var(--anchor-width)]")}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
