"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Paperclip, X, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { sendBatchEmailsCustom } from "@/lib/actions/levy";

interface LevyRow {
  id: string;
  lot_number: number;
  unit_number: string | null;
  owner_display_name: string | null;
  owner_contact_email: string | null;
  reference_number: string;
}

interface Props {
  ocId: string;
  batchId: string;
  draftLevies: LevyRow[];
  /** Which mail provider this OC's emails go through. Surfaced to the
   *  manager so they can change it in OC settings BEFORE sending if
   *  needed , per-send override is intentionally not supported (too
   *  easy to misuse, and the per-OC mail config is the durable signal). */
  mailProviderLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: (sentCount: number) => void;
}

const ATTACHMENT_LIMIT_BYTES = 20 * 1024 * 1024; // 20 MB safety cap (under Gmail's 25 MB)

export function SendEmailsDialog({
  ocId, batchId, draftLevies, mailProviderLabel, open, onOpenChange, onSent,
}: Props) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [sending, setSending] = useState(false);

  const totalAttachBytes = useMemo(
    () => attachments.reduce((s, f) => s + f.size, 0),
    [attachments],
  );

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const next = [...attachments];
    for (const f of Array.from(files)) {
      if (next.find((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    const total = next.reduce((s, f) => s + f.size, 0);
    if (total > ATTACHMENT_LIMIT_BYTES) {
      toast.error(`Attachments exceed the 20 MB email cap.`);
      return;
    }
    setAttachments(next);
  }

  function removeFile(name: string, size: number) {
    setAttachments((prev) => prev.filter((f) => !(f.name === name && f.size === size)));
  }

  async function handleSend() {
    setSending(true);
    startTransition(async () => {
      // Convert files to base64 so they survive the server-action JSON hop.
      // Big-O is fine , total is capped at 20 MB.
      const extras = await Promise.all(
        attachments.map(async (f) => ({
          filename: f.name,
          contentType: f.type || "application/octet-stream",
          contentBase64: Buffer.from(await f.arrayBuffer()).toString("base64"),
        })),
      );

      // Strip empty overrides , we only want explicit ones in the payload.
      const cleanOverrides = Object.fromEntries(
        Object.entries(overrides).filter(([, v]) => v.trim().length > 0),
      );

      const result = await sendBatchEmailsCustom(ocId, batchId, {
        emailOverrides: cleanOverrides,
        extraAttachments: extras,
      });
      setSending(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.sentCount} levy emails sent`);
      onSent(result.sentCount ?? 0);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Send levies by email
          </DialogTitle>
          <DialogDescription>
            {draftLevies.length} {draftLevies.length === 1 ? "levy" : "levies"} ready to send via{" "}
            <strong className="text-foreground">{mailProviderLabel}</strong>.
            Override any owner&apos;s email below for this send only, and attach extra files
            (cover letter, agenda, etc.) that go out alongside every levy notice.
          </DialogDescription>
        </DialogHeader>

        {/* Recipient list */}
        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          <Table variant="bordered" className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Lot</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Email (override for this send)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draftLevies.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">
                    {l.lot_number}{l.unit_number ? `/${l.unit_number}` : ""}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {l.owner_display_name ?? "Unassigned"}
                  </TableCell>
                  <TableCell>
                    <Input
                      value={overrides[l.id] ?? ""}
                      onChange={(e) =>
                        setOverrides((prev) => ({ ...prev, [l.id]: e.target.value }))
                      }
                      placeholder={l.owner_contact_email ?? "no email on file"}
                      className="h-8 text-sm"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Attachments */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Attachments</Label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" />
              Add files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
            />
          </div>
          {attachments.length > 0 ? (
            <ul className="space-y-1 rounded-md border border-border p-2">
              {attachments.map((f) => (
                <li key={`${f.name}-${f.size}`} className="flex items-center justify-between text-sm">
                  <span className="truncate text-foreground">
                    {f.name}{" "}
                    <span className="text-muted-foreground text-xs">
                      ({(f.size / 1024).toFixed(0)} KB)
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(f.name, f.size)}
                    aria-label="Remove attachment"
                    className="text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              <li className="border-t border-border pt-1 text-xs text-muted-foreground">
                Total {(totalAttachBytes / 1024 / 1024).toFixed(2)} MB / 20 MB
              </li>
            </ul>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || pending}>
            {sending && <Loader2 className="size-4 animate-spin" />}
            Send {draftLevies.length} {draftLevies.length === 1 ? "email" : "emails"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
