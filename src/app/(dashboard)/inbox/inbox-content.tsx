"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, FileText, Shield, CalendarDays, Mail, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateLong } from "@/lib/utils";
import { markAsRead, markAllAsRead, type Notification } from "@/lib/actions/notifications";

const TYPE_ICONS: Record<string, typeof FileText> = {
  levy_issued: FileText,
  insurance_expiry: Shield,
  meeting_notice: CalendarDays,
  invitation: Mail,
  system: Info,
};

export function InboxContent({ notifications: initial }: { notifications: Notification[] }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initial);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function handleClick(notification: Notification) {
    if (!notification.read_at) {
      await markAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n)
      );
    }
    if (notification.link) {
      router.push(notification.link);
    }
  }

  async function handleMarkAllRead() {
    await markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Inbox</h1>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            <Check className="mr-2 h-3.5 w-3.5" />
            Mark all as read ({unreadCount})
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-base font-medium text-foreground">No notifications</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              You&apos;ll receive notifications here for levy notices, insurance alerts, meetings, and more.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-0">
            {notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] ?? Info;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`flex w-full items-start gap-3 px-3 py-4 text-left hover:bg-muted/30 transition-colors cursor-pointer border-b border-border/50 last:border-b-0 rounded-none ${
                    !n.read_at ? "bg-primary/5" : ""
                  }`}
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-md shrink-0 mt-0.5 ${
                    !n.read_at ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm ${!n.read_at ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>
                        {n.title}
                      </p>
                      <span className="text-xs text-muted-foreground shrink-0">{formatDateLong(n.created_at)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                  </div>
                  {!n.read_at && (
                    <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-3" />
                  )}
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
