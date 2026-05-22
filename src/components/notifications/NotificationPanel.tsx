'use client';

import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/useNotifications';
import type { PosNotification } from '@/lib/api/notifications';

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function NotificationItem({ n }: { n: PosNotification }) {
  const markRead = useMarkNotificationRead();
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 ${n.is_read ? 'opacity-60' : ''}`}
    >
      <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${n.is_read ? 'bg-transparent' : 'bg-primary'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{n.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.body}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">{formatTimeAgo(n.created_at)}</p>
      </div>
      {!n.is_read && (
        <button
          type="button"
          onClick={() => markRead.mutate(n.id)}
          className="h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
          title="Mark as read"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

interface NotificationPanelProps {
  onClose: () => void;
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const { data, isLoading } = useNotifications(true);
  const markAll = useMarkAllNotificationsRead();
  const notifications = data?.data ?? [];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" aria-hidden="true" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-2xl shadow-2xl border border-border bg-popover overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-bold flex-1">Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
              title="Mark all as read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              All read
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* List */}
        <div className="max-h-96 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Loading…
            </div>
          )}
          {!isLoading && notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Bell className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          )}
          {notifications.map((n) => (
            <NotificationItem key={n.id} n={n} />
          ))}
        </div>
      </div>
    </>
  );
}
