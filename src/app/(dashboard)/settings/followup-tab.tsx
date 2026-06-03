"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getCompanyFollowup } from "@/lib/actions/followup";
import { FollowupEditor } from "@/components/shared/followup-editor";
import type { FollowupWorkflow } from "@/lib/validations/escalation";

export function FollowupTab() {
  const [workflow, setWorkflow] = useState<FollowupWorkflow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCompanyFollowup()
      .then((w) => { if (!cancelled) setWorkflow(w); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading follow-up</div>;
  }
  if (!workflow) {
    return <p className="py-8 text-sm text-muted-foreground">No follow-up workflow is set up yet.</p>;
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Levy follow-up</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The reminders sent automatically when a levy goes unpaid. Every OC follows this unless it sets its own override in its settings.
        </p>
      </div>
      <FollowupEditor workflow={workflow} />
    </div>
  );
}
