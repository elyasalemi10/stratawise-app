import * as React from "react";
import { Mail, Monitor } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NOTIFICATION_GROUPS } from "@/lib/notification-types";

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

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className="pb-3 text-left align-bottom text-sm font-semibold text-foreground">
                Notify me about
              </th>
              {CHANNELS.map(({ label, Icon }) => (
                <th key={label} className="w-28 pb-3 align-bottom">
                  <div className="flex flex-col items-center gap-1">
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    <span className="text-sm font-medium text-foreground">{label}</span>
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
                      <td key={label} className="py-3 text-center">
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
