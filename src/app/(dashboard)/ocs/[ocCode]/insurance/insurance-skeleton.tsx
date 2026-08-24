import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors insurance-timeline.tsx.
//
// The page is a gantt, not a table: an "Add policy" action above a card
// holding a quarter-tick time axis and one ~90px hatched band per policy
// type, with policy bars laid along a shared axis. The previous skeleton was
// the generic PageSkeleton, which looks like a completely different page.
//
// The button and the hatch are fixed so they render for real. Only the axis
// tick labels and the policy bars shimmer, positioned roughly where real
// bars land so the layout does not jump.

const ROW_H = 90;

// Left offset / width as percentages, so the bars sit at plausible spots on
// the axis without pretending to know the real dates.
const BARS = [
  { left: "6%", width: "38%" },
  { left: "30%", width: "44%" },
  { left: "52%", width: "30%" },
];

export function InsuranceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3">
        <Button disabled>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add policy
        </Button>
      </div>

      <div className="relative rounded-md border border-border bg-card">
        <div className="overflow-hidden">
          {/* Time axis. The quarter labels are dates we do not have yet. */}
          <div className="border-b border-border bg-card">
            <div className="relative flex h-9 items-start">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="relative flex flex-1 flex-col items-start">
                  <Skeleton className="mt-1 ml-1 h-2.5 w-12" />
                  <div className="mt-auto h-6 w-px bg-border" />
                </div>
              ))}
            </div>
          </div>

          {BARS.map((bar, i) => (
            <div key={i} className="border-b border-border/50 last:border-b-0">
              <div
                className="relative"
                style={{
                  height: ROW_H,
                  backgroundImage:
                    "repeating-linear-gradient(45deg, hsl(0, 72%, 92%) 0 8px, hsl(0, 0%, 100%) 8px 16px)",
                }}
              >
                <Skeleton
                  className="absolute top-4 bottom-4 rounded-md"
                  style={{ left: bar.left, width: bar.width }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
