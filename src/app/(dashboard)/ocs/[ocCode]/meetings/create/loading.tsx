import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MEETING_TYPE_LABELS, type MeetingType } from "@/lib/validations/meetings";
import { StepIndicator } from "./create-meeting-form";

// No shimmer. Step 1 of the wizard is the meeting-type picker, and every
// part of it (the step strip, the label, both choice cards) is fixed copy.
// Nothing the server fetches is used until step 2, so the loading state is
// the real first screen with the choices inert.
//
// It previously rendered the generic PageSkeleton, which is a different
// page entirely.

export default function Loading() {
  return (
    <div className="space-y-6">
      <StepIndicator current="type" />

      <Card>
        <CardContent className="space-y-4 pt-5">
          <Label>
            Meeting type <span className="text-destructive">*</span>
          </Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["agm", "sgm"] as MeetingType[]).map((t) => (
              <div
                key={t}
                className="flex h-full flex-col items-start gap-2 rounded-md border border-border bg-card p-4 text-left"
              >
                <FileText className="h-5 w-5 text-primary" />
                <div className="text-sm font-medium text-foreground">
                  {MEETING_TYPE_LABELS[t]}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
