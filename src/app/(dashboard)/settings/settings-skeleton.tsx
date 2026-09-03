import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors settings-tabs.tsx: a left rail of two labelled groups beside a
// content panel. Both group headings and every nav label are fixed, so they
// render for real; only the panel's field values are server data.

const NAV = [
  { label: "Account", items: ["Profile", "Security", "Notifications"] },
  { label: "Workspace", items: ["Company", "Team", "Email", "Levy follow-up"] },
];

export function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <nav className="shrink-0 lg:w-56">
        {NAV.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            <p className="px-2 pb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((label, i) => (
                <span
                  key={label}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${
                    group.label === "Account" && i === 0
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  <Skeleton className="size-4 shrink-0 rounded-sm" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        <Card>
          <CardContent className="space-y-4 pt-5">
            {["Name", "Email", "Phone", "Postal address"].map((label) => (
              <div key={label} className="space-y-1.5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
