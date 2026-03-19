"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
  CommandGroup,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { SUBURBS_BY_STATE } from "@/lib/data/australian-suburbs";

interface StateSuburbSelectProps {
  state: string | null;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  id?: string;
}

export function StateSuburbSelect({
  state,
  value,
  onChange,
  error,
  id,
}: StateSuburbSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const suburbs = state ? (SUBURBS_BY_STATE[state] ?? []) : [];
  const disabled = !state;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 text-sm",
          disabled && "cursor-not-allowed bg-muted text-muted-foreground",
          error ? "border-destructive" : "border-border",
          !disabled && "hover:border-primary/50"
        )}
      >
        <span className={cn(!value && "text-muted-foreground")}>
          {disabled
            ? "Select a state first"
            : value || "Search suburbs..."}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && !disabled && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-md">
          <Command>
            <CommandInput placeholder="Search suburb or postcode..." />
            <CommandList className="max-h-48">
              <CommandEmpty>No suburbs found</CommandEmpty>
              <CommandGroup>
                {suburbs.map((suburb) => (
                  <CommandItem
                    key={suburb}
                    value={suburb}
                    data-checked={value === suburb}
                    onSelect={() => {
                      onChange(suburb);
                      setOpen(false);
                    }}
                  >
                    {suburb}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
