"use client";

// Combobox = a Popover-anchored Command (cmdk) with a render-prop list of
// items. Caller passes `items` on <Combobox>, the input filters them on
// type, and the render function inside <ComboboxList> renders each
// matching item. Mirrors the shadcn-style API:
//
//   <Combobox items={["Next.js", "Astro"]}>
//     <ComboboxInput placeholder='Select a framework' />
//     <ComboboxContent>
//       <ComboboxEmpty>No items found.</ComboboxEmpty>
//       <ComboboxList>
//         {item => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}
//       </ComboboxList>
//     </ComboboxContent>
//   </Combobox>
//
// Object items work too , the caller picks how to render. value/onValueChange
// are optional (controlled) , when omitted the component manages its own
// selection.

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { ChevronsUpDownIcon, CheckIcon } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ── Context ──────────────────────────────────────────────────────
type CtxValue = {
  items: ReadonlyArray<unknown>;
  query: string;
  setQuery: (q: string) => void;
  value: string;
  setValue: (v: string) => void;
  selectedLabel: React.ReactNode | null;
  setSelectedLabel: (r: React.ReactNode | null) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  disabled: boolean;
  triggerWidth: number | null;
  setTriggerWidth: (w: number | null) => void;
  placeholder: string | null;
  setPlaceholder: (p: string | null) => void;
};
const Ctx = React.createContext<CtxValue | null>(null);
function useCtx(): CtxValue {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("Combobox.* must live under <Combobox>");
  return c;
}

// ── Root ─────────────────────────────────────────────────────────
interface ComboboxProps<T> {
  items: ReadonlyArray<T>;
  /** Controlled value; omit for uncontrolled. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  disabled?: boolean;
  id?: string;
  children: React.ReactNode;
}

function Combobox<T>({
  items, value, defaultValue, onValueChange, disabled = false, id, children,
}: ComboboxProps<T>) {
  const [innerValue, setInnerValue] = React.useState(defaultValue ?? "");
  const v = value ?? innerValue;
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [selectedLabel, setSelectedLabel] = React.useState<React.ReactNode | null>(null);
  const [triggerWidth, setTriggerWidth] = React.useState<number | null>(null);
  const [placeholder, setPlaceholder] = React.useState<string | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  function commit(next: string) {
    if (value === undefined) setInnerValue(next);
    onValueChange?.(next);
  }

  // Derive a label from the items list when the caller passes a preset
  // `value`. Without this, the trigger shows the placeholder until the
  // user picks something even though there's already a selection. We
  // look for common shapes: string item, { value, label }, { id, label },
  // { id, name }, { value, name }.
  React.useEffect(() => {
    if (!v) {
      setSelectedLabel(null);
      return;
    }
    for (const it of items) {
      if (typeof it === "string") {
        if (it === v) { setSelectedLabel(it); return; }
      } else if (it && typeof it === "object") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj = it as any;
        const keyVal = obj.value ?? obj.id;
        if (String(keyVal) === v) {
          const label = obj.label ?? obj.name ?? String(keyVal);
          setSelectedLabel(label);
          return;
        }
      }
    }
  }, [v, items]);

  const ctx: CtxValue = {
    items: items as ReadonlyArray<unknown>,
    query, setQuery,
    value: v, setValue: commit,
    selectedLabel, setSelectedLabel,
    open, setOpen,
    triggerRef, disabled,
    triggerWidth, setTriggerWidth,
    placeholder, setPlaceholder,
  };

  // Apply id to the trigger button via a ref-effect once mounted, since
  // the trigger is itself a child component.
  React.useEffect(() => {
    if (id && triggerRef.current) triggerRef.current.id = id;
  }, [id]);

  return (
    <Ctx.Provider value={ctx}>
      <Popover open={open} onOpenChange={setOpen}>
        {children}
      </Popover>
    </Ctx.Provider>
  );
}

// ── Trigger / Input (the button that opens the popover) ─────────
// The "Input" name comes from the user's pattern; in practice this is the
// trigger button that displays either the placeholder or the selected
// label. Typing happens inside the popover.
function ComboboxInput({
  placeholder = "Select an option",
  className,
}: {
  placeholder?: string;
  className?: string;
}) {
  const ctx = useCtx();
  React.useEffect(() => { ctx.setPlaceholder(placeholder); }, [placeholder, ctx]);

  // Measure trigger width so the popover content can match it.
  const ref = React.useCallback((node: HTMLButtonElement | null) => {
    ctx.triggerRef.current = node;
    if (node) {
      const w = node.getBoundingClientRect().width;
      ctx.setTriggerWidth(w);
    }
  }, [ctx]);

  return (
    <PopoverTrigger
      ref={ref}
      disabled={ctx.disabled}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm",
        "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=open]:border-primary",
        className,
      )}
    >
      <span className={cn("truncate", !ctx.selectedLabel && "text-muted-foreground")}>
        {ctx.selectedLabel ?? placeholder}
      </span>
      <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 text-muted-foreground" />
    </PopoverTrigger>
  );
}

// ── Content (popover surface) ───────────────────────────────────
function ComboboxContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const ctx = useCtx();
  return (
    <PopoverContent
      align="start"
      sideOffset={4}
      showBackdrop={false}
      // Match the trigger width so the popover is visually aligned with
      // the field that opened it.
      style={ctx.triggerWidth ? { width: ctx.triggerWidth } : undefined}
      className={cn("p-0 overflow-hidden", className)}
    >
      <CommandPrimitive
        className="flex flex-col"
        // cmdk concatenates the item's `value` + every entry in
        // `keywords` and matches the search against that combined
        // string. Substring-includes (not fuzzy) keeps the behaviour
        // predictable for code lookups , typing "man" matches
        // "Management fees" via the keyword payload.
        filter={(value, search, keywords) => {
          const haystack = [value, ...(keywords ?? [])].join(" ").toLowerCase();
          return haystack.includes(search.toLowerCase()) ? 1 : 0;
        }}
      >
        <div className="border-b border-border">
          <CommandPrimitive.Input
            value={ctx.query}
            onValueChange={ctx.setQuery}
            placeholder="Search..."
            className="flex h-9 w-full bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
          />
        </div>
        {children}
      </CommandPrimitive>
    </PopoverContent>
  );
}

// ── Empty / List / Item ─────────────────────────────────────────
function ComboboxEmpty({ children }: { children: React.ReactNode }) {
  return (
    <CommandPrimitive.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
      {children}
    </CommandPrimitive.Empty>
  );
}

function ComboboxList<T>({
  children,
  className,
}: {
  children: (item: T) => React.ReactNode;
  className?: string;
}) {
  const ctx = useCtx();
  return (
    <CommandPrimitive.List className={cn("max-h-72 overflow-y-auto p-1", className)}>
      <CommandPrimitive.Group>
        {(ctx.items as ReadonlyArray<T>).map((item) => children(item))}
      </CommandPrimitive.Group>
    </CommandPrimitive.List>
  );
}

function ComboboxItem({
  value, children, className, onSelect, keywords,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
  onSelect?: (v: string) => void;
  /** Extra search terms cmdk should match against (in addition to
   *  `value`). Pass the human-readable label here when `value` is a
   *  UUID/id , otherwise typing the label won't find the item. */
  keywords?: string[];
}) {
  const ctx = useCtx();
  const isSelected = ctx.value === value;

  return (
    <CommandPrimitive.Item
      value={value}
      keywords={keywords}
      onSelect={(v) => {
        ctx.setValue(v);
        ctx.setSelectedLabel(children);
        if (onSelect) onSelect(v);
        ctx.setOpen(false);
        ctx.setQuery("");
      }}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
        "outline-none aria-selected:bg-muted hover:bg-muted",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        className,
      )}
    >
      <CheckIcon className={cn("size-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
      <span className="flex-1 truncate">{children}</span>
    </CommandPrimitive.Item>
  );
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
};
