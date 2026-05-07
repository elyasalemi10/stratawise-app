import { Badge } from "@/components/ui/badge";

// ============================================================================
// LevyStatusBadge — shared status pill for levy_notices rows.
// ----------------------------------------------------------------------------
// Renders the appropriate badge for a levy's lifecycle state. Two PP6-D
// tiers in the past-due range:
//
//   - "Overdue"        amber  — past due_date, no escalation step fired yet
//   - "Reminder sent"  red    — past due_date AND escalation_instances row
//                                 with current_step >= 1 exists for the levy
//                                 (PP6-C-1 fired step 1 of the escalation)
//
// Tiers 3 ("Firm notice") + 4 ("Final notice") gated on PP6-C-3 escalation
// engine — deferred to Prompt 6.5 per PP6-D-0 ratification.
//
// Existing levy_status enum values (paid, draft, written_off,
// partially_paid + future-dated issued) keep their existing visual.
//
// CRON DORMANCY NOTE (PP6-D-0 SG-D7): until Trigger.dev is wired in
// production, escalation_instances will be empty. The "Reminder sent" tier
// will never render until the cron starts firing — the "Overdue" amber tier
// is the active state. Acceptable; tier flips on automatically post-deploy.
// ============================================================================

export interface LevyStatusBadgeProps {
  status: "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "written_off";
  dueDate: string;            // 'YYYY-MM-DD'
  reminderSent?: boolean;     // true when escalation_instances row with current_step >= 1 exists
  className?: string;
}

export function LevyStatusBadge({
  status,
  dueDate,
  reminderSent,
  className,
}: LevyStatusBadgeProps) {
  const today = new Date().toISOString().slice(0, 10);
  const isPastDue = dueDate < today;

  // Terminal / non-active states keep their existing visual.
  if (status === "paid") {
    return <Badge variant="success" className={className}>Paid</Badge>;
  }
  if (status === "written_off") {
    return <Badge variant="neutral" className={className}>Written off</Badge>;
  }
  if (status === "draft") {
    return <Badge variant="neutral" className={className}>Draft</Badge>;
  }

  // Active states — branch on past-due + reminder-sent.
  if (isPastDue) {
    if (reminderSent) {
      return <Badge variant="destructive" className={className}>Reminder sent</Badge>;
    }
    return <Badge variant="warning" className={className}>Overdue</Badge>;
  }

  // Future-dated active.
  if (status === "partially_paid") {
    return <Badge variant="warning" className={className}>Partially paid</Badge>;
  }
  return <Badge variant="info" className={className}>Issued</Badge>;
}
