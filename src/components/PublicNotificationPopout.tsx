import React, { useState } from 'react';
import {
  Bell,
  BellRing,
  BookOpen,
  ClipboardCheck,
  FileUp,
  LogIn,
  MessageSquare,
  X,
} from 'lucide-react';
import { PublicNotificationItem } from '../hooks/usePublicNotifications';
import { PortalIntent } from '../context/AuthContext';

interface PublicNotificationBellProps {
  notifications: PublicNotificationItem[];
  unreadCount: number;
  seenIds: Record<string, boolean>;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onSelectPortal: (portal: PortalIntent) => void;
  browserPermission: NotificationPermission;
  supportsBrowserNotifications: boolean;
  onRequestBrowserPermission: () => void;
}

export const PublicNotificationBell: React.FC<PublicNotificationBellProps> = ({
  notifications,
  unreadCount,
  seenIds,
  onMarkRead,
  onMarkAllRead,
  onSelectPortal,
  browserPermission,
  supportsBrowserNotifications,
  onRequestBrowserPermission,
}) => {
  const [open, setOpen] = useState(false);

  const renderIcon = (kind: PublicNotificationItem['kind']) => {
    if (kind === 'chat') return <MessageSquare className="h-4 w-4 text-accent-sky" />;
    if (kind === 'assessment') return <ClipboardCheck className="h-4 w-4 text-accent-gold-text" />;
    if (kind === 'submission') return <FileUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
    return <BookOpen className="h-4 w-4 text-accent-sky-text" />;
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-theme bg-surface text-body hover:bg-surface-muted transition-colors"
        aria-label="Platform upload and chat notifications"
        title="Recent uploads and institution chat alerts"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white tabular-nums">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-border-theme bg-surface shadow-xl z-40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div>
              <div className="font-display text-sm font-bold text-heading">
                Live Platform Alerts
              </div>
              <div className="text-[11px] text-muted">
                Uploads & Institution Chat updates
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-xs font-semibold text-accent-sky-text hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {supportsBrowserNotifications && browserPermission !== 'granted' && (
            <div className="border-b border-border-subtle bg-accent-sky-soft px-4 py-2.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-heading">
                Get pop-out device alerts even before login
              </span>
              <button
                type="button"
                onClick={onRequestBrowserPermission}
                className="inline-flex items-center gap-1 rounded-lg bg-btn-primary px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-btn-primary-hover shrink-0"
              >
                <BellRing className="h-3 w-3 text-accent-gold" />
                <span>Enable</span>
              </button>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto divide-y divide-border-subtle">
            {notifications.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted">
                No recent upload or chat alerts yet.
              </p>
            ) : (
              notifications.map((n) => {
                const isRead = Boolean(seenIds[n.id]);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      onMarkRead(n.id);
                      setOpen(false);
                      onSelectPortal('student');
                    }}
                    className={`w-full px-4 py-3 text-left flex items-start gap-3 hover:bg-surface-muted transition-colors ${
                      isRead ? 'opacity-75' : 'bg-accent-sky-soft/40'
                    }`}
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface border border-border-theme">
                      {renderIcon(n.kind)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-heading truncate">{n.title}</div>
                      <div className="text-[11px] text-body line-clamp-2">{n.summary}</div>
                      <div className="mt-0.5 text-[10px] text-faint">{n.timestampLabel}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface PublicNotificationPopoutProps {
  alert: PublicNotificationItem | null;
  onDismiss: () => void;
  onSignInStudent: () => void;
  browserPermission: NotificationPermission;
  supportsBrowserNotifications: boolean;
  onRequestBrowserPermission: () => void;
}

export const PublicNotificationPopout: React.FC<PublicNotificationPopoutProps> = ({
  alert,
  onDismiss,
  onSignInStudent,
  browserPermission,
  supportsBrowserNotifications,
  onRequestBrowserPermission,
}) => {
  if (!alert) return null;

  const isChat = alert.kind === 'chat';

  return (
    <div
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[24rem] z-50 animate-in fade-in slide-in-from-bottom-4 duration-300"
      role="status"
      aria-live="polite"
    >
      <div className="rounded-2xl border-2 border-[#EAB308]/70 bg-surface p-4 shadow-2xl ring-1 ring-[#124299]/15 space-y-3">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-btn-primary text-white shadow-xs">
              {isChat ? (
                <MessageSquare className="h-4 w-4 text-accent-gold" />
              ) : (
                <BellRing className="h-4 w-4 text-accent-gold" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-accent-sky-text">
                {isChat ? 'New Institution Chat' : 'New Platform Upload'} · BRIAN ACADEMY UG
              </div>
              <div className="truncate font-display text-sm font-bold text-heading">
                {alert.title}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg p-1 text-faint hover:bg-surface-muted hover:text-heading shrink-0"
            aria-label="Close notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-body leading-relaxed">{alert.summary}</p>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[11px] font-medium text-muted">{alert.timestampLabel}</span>
          <div className="flex items-center gap-2">
            {supportsBrowserNotifications && browserPermission === 'default' && (
              <button
                type="button"
                onClick={onRequestBrowserPermission}
                className="rounded-lg border border-border-theme bg-surface-subtle px-2.5 py-1.5 text-[11px] font-semibold text-heading hover:bg-surface-muted"
              >
                Enable Pop-ups
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onDismiss();
                onSignInStudent();
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-btn-primary px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-btn-primary-hover"
            >
              <LogIn className="h-3 w-3 text-accent-gold" />
              <span>Open Portal</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
