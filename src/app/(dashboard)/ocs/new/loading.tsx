import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StepIndicator } from "./step-indicator";

// Loading state for /ocs/new. Mirrors the structure of the wizard's
// first step (plan-of-subdivision upload) so the route swap feels
// instant — the previous page disappears immediately and the wizard's
// scaffolding is visible while the server action that creates the
// draft is still in flight.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="relative mb-2 flex h-8 items-center">
        <span className="absolute left-0 top-0 inline-flex h-6 w-6 items-center justify-center text-muted-foreground">
          <X className="h-4 w-4" />
        </span>
        <p className="w-full text-center text-xs text-muted-foreground">
          Each step is saved when you click <strong>Continue</strong>. You can leave anytime
          and resume from the OC switcher in the sidebar.
        </p>
      </div>
      <StepIndicator current={1} />
      <div className="mt-2 space-y-6">
        <div className="text-center">
          <Skeleton className="mx-auto h-6 w-72" />
          <Skeleton className="mx-auto mt-2 h-4 w-96" />
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
    </div>
  );
}
