"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Gavel, Loader2, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getVcatStatus, generateVcatPack, type VcatStatus } from "@/lib/actions/vcat";

export function VcatPackPanel({ lotId }: { lotId: string }) {
  const [status, setStatus] = useState<VcatStatus | null>(null);
  const [packId, setPackId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    getVcatStatus(lotId)
      .then((s) => { setStatus(s); setPackId(s.latestPackId); })
      .catch(() => {});
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lotId]);

  // Nothing to show until a final notice exists (or a pack was already made).
  if (!status) return null;
  if (!status.levyNoticeId && !status.latestPackId && !status.reason?.includes("28 days")) {
    // No final notice in play , don't clutter the tab.
    if (!status.latestPackId) return null;
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
        <div className="flex items-start gap-3">
          <Gavel className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">VCAT fee recovery</h3>
            <p className="text-sm text-muted-foreground">
              {status.eligible
                ? "A final notice has been served and the 28-day period has passed. You can prepare the VCAT application pack."
                : status.reason ?? "Available once a final notice has been served for 28 days."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {packId && (
            <a
              href={`/api/vcat-docs/${packId}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm text-foreground hover:bg-muted"
            >
              <Download className="h-4 w-4" /> Download pack
            </a>
          )}
          {status.eligible && status.levyNoticeId && (
            <Button
              className="cursor-pointer"
              disabled={pending}
              onClick={() => startTransition(async () => {
                const res = await generateVcatPack(lotId, status.levyNoticeId!);
                if (res.error || !res.packId) { toast.error(res.error ?? "Could not generate the pack"); return; }
                setPackId(res.packId);
                toast.success("VCAT pack ready to download");
              })}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {packId ? "Regenerate pack" : "Prepare VCAT pack"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
