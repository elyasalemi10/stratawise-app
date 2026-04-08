"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Check, FileText, Shield, CalendarDays, Mail, Info, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateLong } from "@/lib/utils";
import { markAsRead, markAllAsRead, type Notification } from "@/lib/actions/notifications";

const TYPE_ICONS: Record<string, typeof FileText> = {
  levy_issued: FileText,
  insurance_expiry: Shield,
  meeting_notice: CalendarDays,
  invitation: Mail,
  payment_received: FileText,
  system: Info,
};

const TYPE_COLORS: Record<string, string> = {
  levy_issued: "bg-blue-50 text-blue-600",
  insurance_expiry: "bg-amber-50 text-amber-600",
  meeting_notice: "bg-purple-50 text-purple-600",
  invitation: "bg-green-50 text-green-600",
  payment_received: "bg-emerald-50 text-emerald-600",
  system: "bg-muted text-muted-foreground",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateLong(dateStr);
}

export function InboxContent({ notifications: initial }: { notifications: Notification[] }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const openNotification = notifications.find((n) => n.id === openId);

  async function handleOpen(notification: Notification) {
    setOpenId(notification.id);
    if (!notification.read_at) {
      await markAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n)
      );
    }
  }

  async function handleMarkAllRead() {
    await markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  }

  // Single notification view
  if (openNotification) {
    const Icon = TYPE_ICONS[openNotification.type] ?? Info;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-lg font-semibold text-foreground">Inbox</h1>
          </div>
        </div>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3 pb-4 border-b border-border">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${
                TYPE_COLORS[openNotification.type] ?? TYPE_COLORS.system
              }`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-foreground">{openNotification.title}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{formatDateLong(openNotification.created_at)}</p>
              </div>
            </div>

            <div className="pt-4">
              <p className="text-sm text-foreground leading-relaxed">{openNotification.message}</p>
            </div>

            {openNotification.link && (
              <div className="pt-4 mt-4 border-t border-border">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => router.push(openNotification.link!)}
                  className="cursor-pointer"
                >
                  View details
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Notification list
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Inbox</h1>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} className="cursor-pointer">
            <Check className="mr-2 h-3.5 w-3.5" />
            Mark all as read ({unreadCount})
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-base font-medium text-foreground">All caught up</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              You&apos;ll receive notifications here for levy notices, insurance alerts, meetings, and more.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {notifications.map((n) => {
                const Icon = TYPE_ICONS[n.type] ?? Info;
                const isUnread = !n.read_at;

                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleOpen(n)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                      isUnread ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/30"
                    }`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${
                      TYPE_COLORS[n.type] ?? TYPE_COLORS.system
                    }`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm truncate ${isUnread ? "font-semibold text-foreground" : "text-foreground"}`}>
                          {n.title}
                        </p>
                        <span className="text-xs text-muted-foreground/60 shrink-0">{timeAgo(n.created_at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{n.message}</p>
                    </div>
                    {isUnread && (
                      <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
