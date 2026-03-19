"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
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
import { AUSTRALIAN_BANKS } from "@/lib/data/australian-banks";

interface BankSelectProps {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  id?: string;
}

export function BankSelect({ value, onChange, error, id }: BankSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedBank = AUSTRALIAN_BANKS.find((b) => b.id === value);

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
        <span className="flex items-center gap-2">
          {selectedBank ? (
            <>
              {selectedBank.logo && (
                <Image
                  src={selectedBank.logo}
                  alt={selectedBank.name}
                  width={20}
                  height={20}
                  className="rounded"
                />
              )}
              {selectedBank.name}
            </>
          ) : (
            <span className="text-muted-foreground">Search banks...</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-md">
          <Command>
            <CommandInput placeholder="Search bank..." />
            <CommandList className="max-h-48">
              <CommandEmpty>No banks found</CommandEmpty>
              <CommandGroup>
                {AUSTRALIAN_BANKS.map((bank) => (
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
                      {bank.logo ? (
                        <Image
                          src={bank.logo}
                          alt={bank.name}
                          width={20}
                          height={20}
                          className="rounded"
                        />
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">
                          ?
                        </span>
                      )}
                      {bank.name}
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
