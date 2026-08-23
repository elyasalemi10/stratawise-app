import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// The five tab labels are a hardcoded TABS array in manage-content.tsx, so
// they render as real text with Overview active. Only the panel contents
// come from the server.
//
// Mirrors manage-content.tsx. Keep TABS in step.

const TABS = ["Overview", "Lots & Owners", "Financials", "Meetings", "Documents"];

export default function ManageLoading() {
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-5 space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
