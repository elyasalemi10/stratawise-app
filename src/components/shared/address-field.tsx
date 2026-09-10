"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  VicAddressAutocomplete,
  type ParsedAddress,
} from "@/components/shared/vic-address-autocomplete";
import { joinAddress, splitAddress } from "@/lib/address-parts";
import { cn } from "@/lib/utils";

/**
 * One address, shown as a line and edited as its parts.
 *
 * A single free-text box is faster to skim and impossible to get right: a
 * suburb typed into the street line still looks like an address, and nothing
 * downstream can tell. Five fields make it checkable. So the resting state
 * is the line, and touching it opens the fields, which is the same bargain
 * the OC creation wizard makes on its owner table.
 *
 * Both states are stacked and animate in opposite directions rather than one
 * replacing the other. Swapping them made the row jump: the collapsed input
 * unmounted before the editor had any height, so everything below dropped a
 * line and then climbed back.
 *
 * Saved on the way out, when focus leaves the whole block, not per keystroke
 * and not per field: an address is one fact.
 */
export function AddressField({
  label,
  value,
  onChange,
  onCommit,
  disabled,
  error,
  id,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** Fired when focus leaves the block, and only if the text changed. */
  onCommit?: (next: string) => void;
  disabled?: boolean;
  error?: boolean;
  id?: string;
}) {
  const fieldId = id ?? `address-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const [open, setOpen] = React.useState(false);
  const [parts, setParts] = React.useState<ParsedAddress | null>(null);
  const committed = React.useRef(value);

  // Re-split only when the editor opens, so typing into one field does not
  // round-trip through the joined string and lose whatever the split could
  // not place.
  const current = parts ?? splitAddress(value);

  function close() {
    setOpen(false);
    if (committed.current !== value) {
      committed.current = value;
      onCommit?.(value);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId}>{label}</Label>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
      >
        <div className="overflow-hidden">
          <Input
            id={fieldId}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => {
              if (disabled) return;
              setParts(splitAddress(value));
              setOpen(true);
            }}
            aria-invalid={error || undefined}
            placeholder={label}
            tabIndex={open ? -1 : undefined}
          />
        </div>
      </div>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
            }}
          >
            <VicAddressAutocomplete
              id={`${fieldId}-parts`}
              value={current}
              onChange={(next) => {
                setParts(next);
                onChange(next.formatted || joinAddress(next));
              }}
              error={error}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
