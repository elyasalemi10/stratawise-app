"use client";

import { useEffect } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { AUSTRALIAN_BANKS, type BankOption } from "@/lib/data/australian-banks";

// Searchable bank picker.
//
// This was a hand-rolled dropdown: its own trigger button, its own
// click-outside listener, its own absolutely-positioned panel, with a raw
// cmdk Command inside. All of that is what <Combobox> already does, so none
// of it is here any more , and the picker now behaves and looks identical to
// every other combobox in the app instead of being a one-off.

interface BankSelectProps {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  id?: string;
  /** Append an "Other" choice to the list (id "other") for banks not listed. */
  includeOther?: boolean;
}

const OTHER_OPTION: BankOption = { id: "other", name: "Other", logo: null };

function BankRow({ bank }: { bank: BankOption }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {bank.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bank.logo} alt="" width={20} height={20} className="shrink-0 rounded" />
      )}
      <span className="truncate">{bank.name}</span>
      {bank.recommended && (
        <span className="ml-1 shrink-0 rounded bg-success-muted px-1.5 py-0.5 text-[10px] font-medium text-success-foreground">
          DEFT auto-recon
        </span>
      )}
    </span>
  );
}

export function BankSelect({ value, onChange, error, id, includeOther }: BankSelectProps) {
  const options = includeOther ? [...AUSTRALIAN_BANKS, OTHER_OPTION] : AUSTRALIAN_BANKS;
  const selected = options.find((b) => b.id === value) ?? null;

  // Preload the logos so the list does not pop in row by row on first open.
  useEffect(() => {
    AUSTRALIAN_BANKS.forEach((bank) => {
      if (bank.logo) {
        const img = new Image();
        img.src = bank.logo;
      }
    });
  }, []);

  return (
    <Combobox id={id} items={options} value={value} onValueChange={(v) => onChange(v ?? "")}>
      <ComboboxInput
        placeholder="Select a bank…"
        display={selected ? <BankRow bank={selected} /> : undefined}
        className={error ? "h-9 border-destructive" : "h-9"}
      />
      <ComboboxContent>
        <ComboboxEmpty>No banks found.</ComboboxEmpty>
        <ComboboxList>
          {(bank: BankOption) => (
            <ComboboxItem key={bank.id} value={bank.id} keywords={[bank.name]}>
              <BankRow bank={bank} />
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
