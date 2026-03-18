import { Bell } from "lucide-react";

export function NotificationsTab() {
  return (
    <div className="max-w-lg">
      <div className="rounded-lg border border-border bg-card shadow-none py-16">
        <div className="flex flex-col items-center text-center">
          <Bell className="h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-base font-medium text-foreground">
            Notification preferences
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Configure which notifications you receive and how. Coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
