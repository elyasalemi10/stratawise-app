"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Check, FileText, Shield, CalendarDays, Mail, Info, ChevronRight } from "lucide-react";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const selected = notifications.find((n) => n.id === selectedId);

  async function handleSelect(notification: Notification) {
    setSelectedId(notification.id);
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
            <Inbox className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-base font-medium text-foreground">All caught up</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              You&apos;ll receive notifications here for levy notices, insurance alerts, meetings, and more.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
          {/* Email list */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {notifications.map((n) => {
                  const Icon = TYPE_ICONS[n.type] ?? Info;
                  const isSelected = selectedId === n.id;
                  const isUnread = !n.read_at;

                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleSelect(n)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                        isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "border-l-2 border-l-transparent hover:bg-muted/30"
                      }`}
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 mt-0.5 ${
                        TYPE_COLORS[n.type] ?? TYPE_COLORS.system
                      }`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm truncate ${isUnread ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>
                            {n.title}
                          </p>
                          {isUnread && (
                            <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{n.message}</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Detail panel */}
          <Card>
            <CardContent className="pt-5">
              {selected ? (
                <div>
                  <div className="flex items-start gap-3 mb-4">
                    {(() => {
                      const Icon = TYPE_ICONS[selected.type] ?? Info;
                      return (
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${
                          TYPE_COLORS[selected.type] ?? TYPE_COLORS.system
                        }`}>
                          <Icon className="h-5 w-5" />
                        </div>
                      );
                    })()}
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{selected.title}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDateLong(selected.created_at)}</p>
                    </div>
                  </div>

                  <div className="border-t border-border pt-4">
                    <p className="text-sm text-foreground leading-relaxed">{selected.message}</p>
                  </div>

                  {selected.link && (
                    <div className="border-t border-border pt-4 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(selected.link!)}
                      >
                        View details
                        <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Mail className="h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 text-sm text-muted-foreground">Select a notification to view details</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
