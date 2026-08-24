import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

// No shimmer here on purpose.
//
// Step 0 of the wizard is entirely fixed: the "What kind of levy?" label and
// the two choice cards are hardcoded in generate-levies-form.tsx, and nothing
// the server fetches (budgets, periods, the chart of accounts, the lot
// schedule) is used until the manager has picked one. So the loading state
// IS the first screen, with the choices inert until the form takes over.
//
// It previously rendered a two-column Account / Amount table skeleton, which
// is a screen that appears several steps later and never at this point.
//
// Mirrors generate-levies-form.tsx step 0. Keep the copy in step.

const CHOICES = [
  {
    title: "Regular levy",
    body: "Budget-driven contribution. Quarterly / annual issuance from an approved budget.",
  },
  {
    title: "Special levy",
    body: "One-off raise outside the budget (paint job, legal action, insurance shortfall, etc).",
  },
];

export default function Loading() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <Label>What kind of levy?</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {CHOICES.map((c) => (
              <div
                key={c.title}
                className="rounded-md border border-border bg-card p-4 text-left"
              >
                <div className="text-sm font-semibold text-foreground">{c.title}</div>
                <p className="mt-1 text-xs text-muted-foreground">{c.body}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
