"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FollowupEditor } from "@/components/shared/followup-editor";
import { getFollowupForOC, overrideFollowupForOC, revertFollowupForOC } from "@/lib/actions/followup";
import type { FollowupWorkflow } from "@/lib/validations/escalation";

export function OCFollowupCard({ ocId }: { ocId: string }) {
  const [mode, setMode] = useState<"default" | "override">("default");
  const [workflow, setWorkflow] = useState<FollowupWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  function load() {
    setLoading(true);
    getFollowupForOC(ocId)
      .then((r) => { setMode(r.mode); setWorkflow(r.workflow); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ocId]);

  if (loading) {
    return (
      <Card><CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading follow-up</CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Levy follow-up</h3>
              <p className="text-sm text-muted-foreground">
                {mode === "override"
                  ? "This OC uses its own follow-up steps."
                  : "This OC follows the company default. Changes to the company default apply here automatically."}
              </p>
            </div>
          </div>
          {mode === "override" ? (
            <Button
              variant="secondary"
              className="cursor-pointer"
              disabled={pending}
              onClick={() => startTransition(async () => {
                const res = await revertFollowupForOC(ocId);
                if (res.error) { toast.error(res.error); return; }
                toast.success("Reverted to company default");
                load();
              })}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Revert to company default
            </Button>
          ) : (
            <Button
              className="cursor-pointer"
              disabled={pending}
              onClick={() => startTransition(async () => {
                const res = await overrideFollowupForOC(ocId);
                if (res.error) { toast.error(res.error); return; }
                toast.success("Override created , edit the steps below");
                load();
              })}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Override for this OC
            </Button>
          )}
        </CardContent>
      </Card>

      {mode === "override" && workflow && (
        <FollowupEditor workflow={workflow} onSaved={load} />
      )}
    </div>
  );
}
