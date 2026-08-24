"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { SUBURBS_BY_STATE } from "@/lib/data/australian-suburbs";

// Suburb picker, scoped to the chosen state.
//
// Was a hand-rolled trigger + click-outside listener + absolutely-positioned
// panel wrapping a raw cmdk Command. <Combobox> is all of that, already
// consistent with every other picker, so the bespoke version is gone.
//
// Disabled until a state is chosen, since the list is state-scoped and
// offering every suburb in Australia would be useless.

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
  const suburbs = state ? (SUBURBS_BY_STATE[state] ?? []) : [];
  const disabled = !state;

  return (
    <Combobox
      id={id}
      items={suburbs}
      value={value}
      onValueChange={(v) => onChange(v ?? "")}
      disabled={disabled}
    >
      <ComboboxInput
        placeholder={disabled ? "Select a state first" : "Search suburbs…"}
        display={value || undefined}
        className={error ? "h-9 border-destructive" : "h-9"}
      />
      <ComboboxContent>
        <ComboboxEmpty>No suburbs found.</ComboboxEmpty>
        <ComboboxList>
          {(suburb: string) => (
            <ComboboxItem key={suburb} value={suburb}>
              {suburb}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
