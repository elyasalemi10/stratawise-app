"use client";

import { Plus } from "lucide-react";
import {
  Combobox,
  ComboboxContent,
  ComboboxCreateItem,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import type { CoaAccount } from "@/lib/chart-of-accounts";

// Pick an account from the firm-wide chart of accounts, with an "Add new
// account" row for when nothing matches.
//
// This existed TWICE, once in create-budget-form.tsx and once in
// budget-detail-content.tsx, as byte-for-byte duplicates: a bare <Input>, a
// hand-rolled click-outside listener, a manual Enter/Escape handler, and an
// absolutely-positioned results panel. Two copies of a widget is two places
// for its behaviour to drift, and neither copy behaved like any other picker
// in the app.
//
// It is one component on the shared <Combobox> now. The caller swaps a
// button out for this, so it opens on mount, and closing it (outside click
// or Escape) is the cancel.

export function AccountPicker({
  accounts,
  usedAccountIds,
  onSelect,
  onCancel,
  onRequestCreate,
}: {
  accounts: CoaAccount[];
  /** Already on the budget , hidden rather than shown-and-disabled, since
   *  an account can only be added once. */
  usedAccountIds: string[];
  onSelect: (account: CoaAccount) => void;
  onCancel: () => void;
  onRequestCreate: (seedName: string) => void;
}) {
  const available = accounts.filter((a) => !usedAccountIds.includes(a.id));

  return (
    <Combobox
      items={available}
      defaultOpen
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      onValueChange={(id) => {
        const picked = available.find((a) => a.id === id);
        if (picked) onSelect(picked);
      }}
    >
      <ComboboxInput className="h-8 text-sm" placeholder="Search code or account name…" />
      <ComboboxContent>
        <ComboboxEmpty>No accounts left to add.</ComboboxEmpty>
        <ComboboxList>
          {(a: CoaAccount) => (
            <ComboboxItem key={a.id} value={a.id} keywords={[a.name, a.code]}>
              <span className="flex w-full items-center justify-between gap-3">
                <span className="truncate">{a.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {a.code}
                </span>
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxCreateItem onCreate={onRequestCreate}>
          {(query) => (
            <>
              <Plus className="size-3.5" />
              Add new account{query ? ` , "${query}"` : ""}
            </>
          )}
        </ComboboxCreateItem>
      </ComboboxContent>
    </Combobox>
  );
}
