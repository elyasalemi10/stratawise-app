"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { sendInvitations } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

interface InviteRow {
  email: string;
  name: string;
}

export function StepInvite({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<InviteRow[]>([{ email: "", name: "" }]);
  const [pending, setPending] = useState(false);

  function updateRow(index: number, field: keyof InviteRow, value: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function addRow() {
    setRows((prev) => [...prev, { email: "", name: "" }]);
  }

  function removeRow(index: number) {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSend() {
    const validRows = rows.filter((r) => r.email.trim() && r.name.trim());
    if (validRows.length === 0) {
      toast.error("Please add at least one valid invite.");
      return;
    }

    setPending(true);
    const result = await sendInvitations(validRows);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    onNext();
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">
        Invite team members
      </h2>
      <p className="mt-1 text-sm text-muted-foreground mb-6">
        You can always do this later.
      </p>

      <div className="space-y-3">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_1fr_2rem] gap-3">
          <Label>Email</Label>
          <Label>Name</Label>
          <div />
        </div>

        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_2rem] gap-3 items-start">
            <Input
              placeholder="colleague@company.com"
              value={row.email}
              onChange={(e) => updateRow(i, "email", e.target.value)}
            />
            <Input
              placeholder="Jane Smith"
              value={row.name}
              onChange={(e) => updateRow(i, "name", e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeRow(i)}
              disabled={rows.length <= 1}
              className="text-muted-foreground"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addRow}
        >
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add another
        </Button>
      </div>

      <div className="flex justify-between pt-6">
        <Button type="button" variant="ghost" onClick={onBack}>
          &larr; Back
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onNext}>
            Skip for now
          </Button>
          <Button onClick={handleSend} disabled={pending}>
            {pending ? <><Spinner className="mr-2" /> Send</> : "Send invitations"}
          </Button>
        </div>
      </div>
    </div>
  );
}
