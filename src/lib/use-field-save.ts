"use client";

import * as React from "react";
import { toast } from "sonner";

// Settings fields save when you leave them, not when you press Save.
//
// A Save button at the bottom of a settings page makes you remember to press
// it and punishes you for not. These are independent single fields with
// nothing to keep consistent between them, so there is nothing for a Save
// button to batch , and an Edit drawer is worse still, because it hides the
// current values behind a click before you can change one.
//
// Rules the hook enforces so this stays predictable:
//   - it writes ONLY when the value actually changed, so tabbing through a
//     form does not fire a save per field
//   - a rejected save puts back what was there, rather than leaving the box
//     showing something the server refused
//   - the toast is the only feedback; nothing moves, nothing reflows

export function useFieldSave(
  initial: string,
  save: (value: string) => Promise<{ error?: string }>,
  options?: {
    /** Shown on success. Defaults to "Saved". */
    successMessage?: string;
    /** Return a message to block the save and flag the field. */
    validate?: (value: string) => string | null;
  },
) {
  const [value, setValue] = React.useState(initial);
  const [invalid, setInvalid] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const committed = React.useRef(initial);

  // A value that changed underneath us (another tab, a server refresh) should
  // win over a field the user has not touched.
  React.useEffect(() => {
    if (committed.current === initial) return;
    committed.current = initial;
    setValue(initial);
  }, [initial]);

  async function onBlur() {
    const next = value.trim();
    if (next === committed.current) return;

    const problem = options?.validate?.(next);
    if (problem) {
      setInvalid(true);
      toast.error(problem);
      return;
    }

    setSaving(true);
    const res = await save(next);
    setSaving(false);

    if (res.error) {
      setInvalid(true);
      toast.error(res.error);
      setValue(committed.current);
      return;
    }
    committed.current = next;
    setInvalid(false);
    toast.success(options?.successMessage ?? "Saved");
  }

  function onChange(next: string) {
    setValue(next);
    if (invalid) setInvalid(false);
  }

  return { value, onChange, onBlur, invalid, saving };
}
