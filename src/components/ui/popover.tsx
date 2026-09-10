"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"
import { useScrimSlot } from "./use-scrim-stack"

// The trigger element, so a popup that wants to be as wide as its control
// can measure it.
//
// Base UI publishes --anchor-width for this, and the wiring for it read
// correctly and did not work: the variable lands on whichever element the
// positioning treats as "floating", the popup is inside that element, and a
// width sourced from a variable that may or may not be set yet resolves to
// `auto` on the frames where it is not. Three attempts at the CSS route all
// produced a panel narrower than the field it opened from. A number we took
// ourselves cannot be undefined at the wrong moment.
const PopoverAnchorContext = React.createContext<{
  element: HTMLElement | null
  setElement: (el: HTMLElement | null) => void
} | null>(null)

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  const [element, setElement] = React.useState<HTMLElement | null>(null)
  const value = React.useMemo(() => ({ element, setElement }), [element])
  return (
    <PopoverAnchorContext.Provider value={value}>
      <PopoverPrimitive.Root data-slot="popover" {...props} />
    </PopoverAnchorContext.Provider>
  )
}

function PopoverTrigger({ ref, ...props }: PopoverPrimitive.Trigger.Props) {
  const anchor = React.useContext(PopoverAnchorContext)
  const setRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      anchor?.setElement(node)
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.RefObject<HTMLButtonElement | null>).current = node
    },
    [anchor, ref],
  )
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" ref={setRef} {...props} />
}

/** The trigger's current width, measured at mount so the first painted frame
 *  is already right, then kept in step with it. */
function useAnchorWidth(enabled: boolean): number | undefined {
  const anchor = React.useContext(PopoverAnchorContext)
  const element = anchor?.element ?? null
  const [width, setWidth] = React.useState<number | undefined>(() =>
    enabled && element ? element.getBoundingClientRect().width : undefined,
  )
  React.useEffect(() => {
    if (!enabled || !element) return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0]
      setWidth(box ? box.inlineSize : element.getBoundingClientRect().width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [enabled, element])
  return enabled ? width : undefined
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
  style,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  > & { showBackdrop?: boolean; matchTriggerWidth?: boolean }) {
  const anchorWidth = useAnchorWidth(matchTriggerWidth)
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
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          // Inline, so it beats every width class the caller or the base
          // could bring, and there is nothing left to lose a merge against.
          style={
            anchorWidth !== undefined
              ? { width: anchorWidth, maxWidth: "none", ...style }
              : style
          }
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
