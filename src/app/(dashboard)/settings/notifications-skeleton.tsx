import * as React from "react";
import { Mail, Monitor } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NOTIFICATION_GROUPS } from "@/lib/notification-types";

// The ONE notifications skeleton , rendered by the route boundary and by the
// client while it fetches, so the two frames are the same frame.
//
// Every label, description, group heading and channel icon on this page is
// fixed , the only server data is which switches are on. So the whole table
// renders for real and only the switches shimmer.
//
// The group rows use React.Fragment with a key, not a bare <>. A shorthand
// fragment cannot take one, so mapping to it drops the key onto the first
// child instead of the mapped element, which is what React was warning
// about.

const CHANNELS = [
  { label: "Email", Icon: Mail },
  { label: "In app", Icon: Monitor },
];

export function NotificationsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-full pb-3 text-left align-bottom text-sm font-semibold text-foreground">
                Notify me about
              </th>
              {CHANNELS.map(({ label, Icon }) => (
                <th key={label} className={label === "Email" ? "w-32 whitespace-nowrap pb-3 pr-14 align-bottom" : "w-32 whitespace-nowrap pb-3 align-bottom"}>
                  <div className="flex flex-col items-center gap-1">
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    {/* Fixed copy, and the reason the header is three lines
                        tall. Leaving it out made the skeleton shorter than
                        the page it stands in for, so everything below it
                        jumped the moment the data arrived. */}
                    <span className="text-xs text-muted-foreground">Turn all on</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_GROUPS.map((group) => (
              <React.Fragment key={group.label}>
                <tr>
                  <th
                    colSpan={3}
                    className="bg-muted px-3 py-2 text-left text-sm font-medium text-foreground"
                  >
                    {group.label}
                  </th>
                </tr>
                {group.items.map((item) => (
                  <tr key={item.type} className="border-b border-border/60 last:border-b-0">
                    <td className="py-3 pr-6">
                      <div className="text-sm font-medium text-foreground">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.description}</div>
                    </td>
                    {CHANNELS.map(({ label }) => (
                      <td key={label} className={label === "Email" ? "py-3 pr-14 text-center" : "py-3 text-center"}>
                        <Skeleton className="mx-auto h-5 w-9 rounded-full" />
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
