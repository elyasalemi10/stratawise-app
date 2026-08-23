import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// The five tab labels are a hardcoded TABS array in settings-content.tsx,
// so they render as real text with General active. Only the field values
// come from the server.
//
// Mirrors settings-content.tsx. Keep TABS in step.

const TABS = ["General", "Financial", "Communications", "Banking", "Automation"];

export default function OCSettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex w-full flex-wrap justify-start gap-0">
        {TABS.map((label, i) => (
          <span
            key={label}
            className={`relative flex h-11 min-w-[6.5rem] items-center justify-center px-4 text-sm font-medium ${
              i === 0
                ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[color:var(--brand-gold)]"
                : "text-muted-foreground"
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-5 space-y-4">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between gap-6">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3.5 w-56" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
