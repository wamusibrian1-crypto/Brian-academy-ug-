import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BellRing,
  BookOpen,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Home,
  LogOut,
  User,
  X,
} from 'lucide-react';
import { BrandMark } from '../BrandMark';
import { PWAInstallButton } from '../PWAInstallButton';
import { useAuth } from '../../context/AuthContext';
import { StudentNotificationItem } from '../../hooks/useStudentNotifications';

export type StudentTab = 'home' | 'courses' | 'profile';
export type StudentFeature =
  | null
  | 'live-class'
  | 'fees'
  | 'study-material'
  | 'test'
  | 'chat'
  | 'homework'
  | 'help';

const FEATURE_SEQUENCE: { id: Exclude<StudentFeature, null>; label: string }[] = [
  { id: 'live-class', label: 'Live Class' },
  { id: 'fees', label: 'Fees' },
  { id: 'study-material', label: 'Study Material' },
  { id: 'test', label: 'Test' },
  { id: 'chat', label: 'Chat' },
  { id: 'homework', label: 'Homework' },
  { id: 'help', label: 'Help' },
];

interface StudentShellProps {
  activeTab: StudentTab;
  activeFeature: StudentFeature;
  onSelectTab: (tab: StudentTab) => void;
  onSelectFeature: (feature: StudentFeature) => void;
  notifications: StudentNotificationItem[];
  unreadCount: number;
  seenIds: Record<string, boolean>;
  latestAlert: StudentNotificationItem | null;
  onDismissLatestAlert: () => void;
  onMarkRead: (id: string) => void;
  onMarkFeatureRead: (feature: Exclude<StudentFeature, null>) => void;
  onMarkAllRead: () => void;
  browserPermission: NotificationPermission;
  supportsBrowserNotifications: boolean;
  onRequestBrowserPermission: () => void;
  children: React.ReactNode;
}

export const StudentShell: React.FC<StudentShellProps> = ({
  activeTab,
  activeFeature,
  onSelectTab,
  onSelectFeature,
  notifications,
  unreadCount,
  seenIds,
  latestAlert,
  onDismissLatestAlert,
  onMarkRead,
  onMarkFeatureRead,
  onMarkAllRead,
  browserPermission,
  supportsBrowserNotifications,
  onRequestBrowserPermission,
  children,
}) => {
  const { studentProfile, logout } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    if (activeFeature) {
      onMarkFeatureRead(activeFeature);
    }
  }, [activeFeature, onMarkFeatureRead]);

  const currentFeatureIdx = activeFeature
    ? FEATURE_SEQUENCE.findIndex((f) => f.id === activeFeature)
    : -1;
  const prevFeature =
    currentFeatureIdx > 0
      ? FEATURE_SEQUENCE[currentFeatureIdx - 1]
      : currentFeatureIdx === 0
        ? FEATURE_SEQUENCE[FEATURE_SEQUENCE.length - 1]
        : null;
  const nextFeature =
    currentFeatureIdx >= 0
      ? FEATURE_SEQUENCE[(currentFeatureIdx + 1) % FEATURE_SEQUENCE.length]
      : null;

  return (
    <div className="min-h-screen bg-canvas text-heading pb-20 md:pb-8">
      {/* Compact Top Header */}
      <header className="sticky top-0 z-30 border-b border-border-theme bg-header-bg backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => {
              onSelectFeature(null);
              onSelectTab('home');
            }}
            className="text-left shrink-0"
          >
            <BrandMark size="sm" />
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => {
                onSelectFeature(null);
                onSelectTab('home');
              }}
              className={`whitespace-nowrap transition-colors ${
                activeTab === 'home' && !activeFeature
                  ? 'text-heading font-semibold underline decoration-sky-500 decoration-2 underline-offset-8'
                  : 'text-muted hover:text-heading'
              }`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => {
                onSelectFeature(null);
                onSelectTab('courses');
              }}
              className={`whitespace-nowrap transition-colors ${
                activeTab === 'courses' && !activeFeature
                  ? 'text-heading font-semibold underline decoration-sky-500 decoration-2 underline-offset-8'
                  : 'text-muted hover:text-heading'
              }`}
            >
              My Courses
            </button>
            <button
              type="button"
              onClick={() => {
                onSelectFeature(null);
                onSelectTab('profile');
              }}
              className={`whitespace-nowrap transition-colors ${
                activeTab === 'profile' && !activeFeature
                  ? 'text-heading font-semibold underline decoration-sky-500 decoration-2 underline-offset-8'
                  : 'text-muted hover:text-heading'
              }`}
            >
              Profile
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {/* Local Notifications Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-theme bg-surface text-heading hover:bg-surface-muted transition-colors"
                aria-label="Open notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-border-theme bg-surface shadow-xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                    <div>
                      <h3 className="font-display text-sm font-bold text-heading">
                        Notifications ({unreadCount} unread)
                      </h3>
                      <p className="text-[11px] text-muted">
                        New uploads, assignments & institution chat
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={onMarkAllRead}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-accent-sky-text hover:bg-accent-sky-soft"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          <span>Read all</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="rounded-lg p-1 text-faint hover:bg-surface-muted"
                        aria-label="Close notifications"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {supportsBrowserNotifications && browserPermission !== 'granted' && (
                    <div className="flex items-center justify-between gap-2 border-b border-border-subtle bg-accent-sky-soft px-4 py-2.5">
                      <span className="text-[11px] font-medium text-heading">
                        Get pop-up alerts on this device
                      </span>
                      <button
                        type="button"
                        onClick={onRequestBrowserPermission}
                        className="inline-flex items-center gap-1 rounded-lg bg-btn-primary px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-btn-primary-hover"
                      >
                        <BellRing className="h-3 w-3 text-[#D4AF37]" />
                        <span>Enable</span>
                      </button>
                    </div>
                  )}

                  <div className="max-h-80 overflow-y-auto divide-y divide-border-subtle">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-muted">
                        No alerts yet. New assignments and administrator messages will appear here.
                      </div>
                    ) : (
                      notifications.map((n) => {
                        const isUnread = !seenIds[n.id];
                        return (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              onMarkRead(n.id);
                              onSelectFeature(n.targetFeature);
                              setNotifOpen(false);
                            }}
                            className={`w-full text-left px-4 py-3 transition-colors hover:bg-surface-muted ${
                              isUnread ? 'bg-accent-sky-soft' : 'bg-surface'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className={`text-xs font-bold ${
                                  isUnread ? 'text-heading' : 'text-body'
                                }`}
                              >
                                {n.title}
                              </span>
                              {isUnread && (
                                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted line-clamp-2">{n.body}</p>
                            <span className="mt-1 block text-[10px] text-faint">
                              {n.timestampLabel}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <PWAInstallButton variant="header" />
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border-theme bg-surface px-3 py-1.5 text-xs font-semibold text-body hover:bg-surface-muted transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5 text-muted" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Suspended Account Warning */}
      {studentProfile?.status === 'suspended' ? (
        <main className="mx-auto max-w-xl px-4 py-12">
          <div className="rounded-2xl border border-rose-200 dark:border-rose-800/70 bg-surface p-7 text-center shadow-xs">
            <h1 className="font-display text-xl font-bold text-rose-700 dark:text-rose-400">
              Student Account Suspended
            </h1>
            <p className="mt-2 text-sm text-muted">
              Your account is currently suspended by the academy administration. Please contact the school administration office for assistance.
            </p>
            <button
              type="button"
              onClick={logout}
              className="mt-5 rounded-xl bg-btn-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-btn-primary-hover"
            >
              Sign Out
            </button>
          </div>
        </main>
      ) : (
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          {/* Quick Navigation Arrows when inside a student feature */}
          {activeFeature && prevFeature && nextFeature && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border-theme bg-surface px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  onSelectFeature(null);
                  onSelectTab('home');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-heading hover:bg-surface-muted"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Dashboard</span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onSelectFeature(prevFeature.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border-theme px-2.5 py-1.5 text-xs font-semibold text-body hover:bg-surface-muted"
                  aria-label={`Previous: ${prevFeature.label}`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{prevFeature.label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectFeature(nextFeature.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border-theme px-2.5 py-1.5 text-xs font-semibold text-body hover:bg-surface-muted"
                  aria-label={`Next: ${nextFeature.label}`}
                >
                  <span className="hidden sm:inline">{nextFeature.label}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {children}
        </main>
      )}

      {/* Mobile Fixed Bottom Navigation: ONLY Home, My Courses, Profile */}
      <nav
        aria-label="Student navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-theme bg-header-bg backdrop-blur-md md:hidden pb-safe"
      >
        <div className="grid h-14 grid-cols-3 items-center">
          <button
            type="button"
            onClick={() => {
              onSelectFeature(null);
              onSelectTab('home');
            }}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
              activeTab === 'home' ? 'text-heading' : 'text-muted'
            }`}
          >
            <Home
              className={`h-5 w-5 ${activeTab === 'home' ? 'text-accent-sky-text' : 'text-faint'}`}
            />
            <span>Home</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectFeature(null);
              onSelectTab('courses');
            }}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
              activeTab === 'courses' ? 'text-heading' : 'text-muted'
            }`}
          >
            <BookOpen
              className={`h-5 w-5 ${activeTab === 'courses' ? 'text-accent-sky-text' : 'text-faint'}`}
            />
            <span>My Courses</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectFeature(null);
              onSelectTab('profile');
            }}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
              activeTab === 'profile' ? 'text-heading' : 'text-muted'
            }`}
          >
            <User
              className={`h-5 w-5 ${activeTab === 'profile' ? 'text-accent-sky-text' : 'text-faint'}`}
            />
            <span>Profile</span>
          </button>
        </div>
      </nav>

      {/* Live In-App Toast Notification on New Upload or Chat */}
      {latestAlert && (
        <div className="fixed bottom-16 md:bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-sky-300 dark:border-sky-700 bg-surface p-4 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                onMarkRead(latestAlert.id);
                onSelectFeature(latestAlert.targetFeature);
                onDismissLatestAlert();
              }}
              className="flex-1 text-left"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-accent-sky-text">
                <BellRing className="h-3.5 w-3.5" />
                <span>{latestAlert.title}</span>
              </div>
              <p className="mt-1 text-xs text-body line-clamp-2">{latestAlert.body}</p>
            </button>
            <button
              type="button"
              onClick={onDismissLatestAlert}
              className="rounded-lg p-1 text-faint hover:bg-surface-muted"
              aria-label="Dismiss alert"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
