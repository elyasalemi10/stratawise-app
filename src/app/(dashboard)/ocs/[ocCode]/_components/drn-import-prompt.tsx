"use client";

import { useState } from "react";
import { DrnImportDialog } from "./drn-import-dialog";

// Auto-opens the DEFT DRN import dialog the first time a manager lands on
// the OC dashboard after creation (?created=1 or ?drn=1). Closing the dialog
// without saving is allowed — we don't pester the user again automatically;
// they can re-open from the bank-account page if needed.

interface Props {
  ocId: string;
  ocCode: string;
  lots: Array<{ id: string; lot_number: number; unit_number: string | null }>;
}

export function DrnImportPrompt({ ocId, ocCode, lots }: Props) {
  const [open, setOpen] = useState(true);
  return (
    <DrnImportDialog
      open={open}
      onClose={() => setOpen(false)}
      ocId={ocId}
      ocCode={ocCode}
      lots={lots}
    />
  );
}
