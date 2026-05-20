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
import { AUSTRALIAN_BANKS, type BankOption } from "@/lib/data/australian-banks";

interface BankSelectProps {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  id?: string;
  /** Append an "Other" choice to the list (id "other") for banks not listed. */
  includeOther?: boolean;
}

const OTHER_OPTION: BankOption = { id: "other", name: "Other", logo: null };

export function BankSelect({ value, onChange, error, id, includeOther }: BankSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const options = includeOther ? [...AUSTRALIAN_BANKS, OTHER_OPTION] : AUSTRALIAN_BANKS;
  const selectedBank = options.find((b) => b.id === value);

  // Preload all bank images on mount
  useEffect(() => {
    AUSTRALIAN_BANKS.forEach((bank) => {
      if (bank.logo) {
        const img = new Image();
        img.src = bank.logo;
      }
    });
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 text-sm",
          error ? "border-destructive" : "border-border",
          "hover:border-primary/50"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedBank ? (
            <>
              {selectedBank.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedBank.logo}
                  alt={selectedBank.name}
                  width={20}
                  height={20}
                  className="rounded"
                />
              )}
              <span className="truncate">{selectedBank.name}</span>
              {selectedBank.recommended && (
                <span className="ml-1 shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-900">
                  DEFT auto-recon
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Select a bank…</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-md">
          <Command>
            <CommandInput placeholder="Search bank..." />
            <CommandList className="max-h-40">
              <CommandEmpty>No banks found</CommandEmpty>
              <CommandGroup>
                {options.map((bank) => (
                  <CommandItem
                    key={bank.id}
                    value={bank.name}
                    data-checked={value === bank.id}
                    onSelect={() => {
                      onChange(bank.id);
                      setOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      {bank.logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={bank.logo}
                          alt={bank.name}
                          width={20}
                          height={20}
                          className="rounded"
                        />
                      )}
                      {bank.name}
                      {bank.recommended && (
                        <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-900">
                          DEFT auto-recon
                        </span>
                      )}
                    </span>
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
