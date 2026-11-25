import React, { useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { BrandMark } from '../BrandMark';
import { PWAInstallButton } from '../PWAInstallButton';
import { ThemeToggle } from '../ThemeToggle';
import { useAuth } from '../../context/AuthContext';
import type { StaffNotificationItem } from '../../hooks/useStaffNotifications';

export type AdminSection =
  | 'overview'
  | 'students'
  | 'teachers'
  | 'classes'
  | 'examinations'
  | 'fees'
  | 'monitoring'
  | 'reports'
  | 'settings';

interface AdminShellProps {
  activeSection: AdminSection;
  onSelectSection: (section: AdminSection, openChatTab?: boolean) => void;
  notifications: StaffNotificationItem[];
  unreadCount: number;
  seenIds: Record<string, boolean>;
  latestAlert: StaffNotificationItem | null;
  onDismissLatestAlert: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  browserPermission: NotificationPermission;
  supportsBrowserNotifications: boolean;
  onRequestBrowserPermission: () => void;
  children: React.ReactNode;
}

export const AdminShell: React.FC<AdminShellProps> = ({
  activeSection,
  onSelectSection,
  notifications,
  unreadCount,
  seenIds,
  latestAlert,
  onDismissLatestAlert,
  onMarkRead,
  onMarkAllRead,
  browserPermission,
  supportsBrowserNotifications,
  onRequestBrowserPermission,
  children,
}) => {
  const { role, adminProfile, teacherProfile, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const isAdmin = role === 'admin';
  const displayName = adminProfile?.fullName || teacherProfile?.fullName || 'Staff Member';
  const roleLabel = isAdmin
    ? adminProfile?.role === 'owner'
      ? 'Platform Owner'
      : 'Administrator'
    : 'Assigned Teacher';

  const navItems: {
    id: AdminSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    adminOnly?: boolean;
  }[] = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'students', label: 'Manage Students', icon: GraduationCap, adminOnly: true },
    { id: 'teachers', label: 'Manage Teachers', icon: Users, adminOnly: true },
    { id: 'classes', label: 'Classes & Subjects', icon: BookOpen },
    { id: 'examinations', label: 'Examinations', icon: ClipboardCheck },
    { id: 'fees', label: 'Fees Management', icon: CreditCard, adminOnly: true },
    { id: 'monitoring', label: 'Monitoring Center', icon: Activity, adminOnly: true },
    { id: 'reports', label: 'Reports & Results', icon: BarChart3 },
    { id: 'settings', label: 'Platform Settings', icon: Settings, adminOnly: true },
  ];

  const visibleItems = navItems.filter((item) => isAdmin || !item.adminOnly);
  const moduleItems = visibleItems.filter((item) => item.id !== 'overview');
  const activeModuleIdx = moduleItems.findIndex((item) => item.id === activeSection);
  const prevModule =
    activeModuleIdx > 0
      ? moduleItems[activeModuleIdx - 1]
      : activeModuleIdx === 0
        ? moduleItems[moduleItems.length - 1]
        : null;
  const nextModule =
    activeModuleIdx >= 0
      ? moduleItems[(activeModuleIdx + 1) % moduleItems.length]
      : null;

  const handleSelect = (id: AdminSection) => {
    onSelectSection(id, false);
    setMobileMenuOpen(false);
  };

  const handleNotificationClick = (n: StaffNotificationItem) => {
    onMarkRead(n.id);
    onSelectSection(n.targetSection, n.openChatTab);
    setNotifOpen(false);
  };

  const renderNotifDropdown = () =>
    notifOpen && (
      <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-border-theme bg-surface shadow-xl z-50 overflow-hidden text-left">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <div>
            <h3 className="font-display text-sm font-bold text-heading">
              Platform Alerts ({unreadCount} unread)
            </h3>
            <p className="text-[11px] text-muted">
              Uploads, submissions, payment proofs & institution chat
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
              No platform alerts yet. New uploads and chat messages will appear here.
            </div>
          ) : (
            notifications.map((n) => {
              const isUnread = !seenIds[n.id];
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleNotificationClick(n)}
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
    );

  return (
    <div className="min-h-screen bg-canvas flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-border-theme bg-sidebar-bg text-white">
        <div className="flex h-16 items-center px-5 border-b border-white/10">
          <BrandMark size="sm" light />
        </div>

        <div className="px-5 py-4 border-b border-white/10">
          <div className="text-xs font-semibold text-[#D4AF37] inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{roleLabel}</span>
          </div>
          <div className="mt-1 text-sm font-bold truncate">{displayName}</div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-sky-500/20 text-white border border-sky-400/30'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#D4AF37]' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="text-xs font-medium text-slate-300">Theme</span>
            <ThemeToggle compact />
          </div>
          <PWAInstallButton variant="header" />
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Desktop Top Utility Bar with Notification Bell */}
        <header className="hidden lg:flex sticky top-0 z-30 h-14 items-center justify-between gap-4 border-b border-border-theme bg-header-bg px-8 backdrop-blur-md">
          <div className="text-xs font-semibold text-muted">
            BRIAN ACADEMY UG · {roleLabel}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                className="relative inline-flex h-9 items-center gap-2 rounded-xl border border-border-theme bg-surface px-3 text-xs font-semibold text-heading hover:bg-surface-muted transition-colors"
                aria-label="Open platform notifications"
              >
                <Bell className="h-4 w-4 text-accent-sky" />
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white tabular-nums">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              {renderNotifDropdown()}
            </div>
          </div>
        </header>

        {/* Mobile & Tablet Top Bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border-theme bg-header-bg px-4 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border-theme text-heading hover:bg-surface-muted transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandMark size="sm" />
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border-theme bg-surface text-heading hover:bg-surface-muted transition-colors"
                aria-label="Open notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {renderNotifDropdown()}
            </div>
            <ThemeToggle compact />
            <button
              type="button"
              onClick={logout}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border-theme text-body hover:bg-surface-muted transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="fixed inset-0 bg-slate-950/60"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-sidebar-bg text-white">
              <div className="flex h-14 items-center justify-between px-4 border-b border-white/10">
                <BrandMark size="sm" light />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-4 py-3 border-b border-white/10">
                <div className="text-xs font-semibold text-[#D4AF37]">{roleLabel}</div>
                <div className="text-sm font-bold truncate">{displayName}</div>
              </div>
              <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                        active ? 'bg-sky-500/20 text-white' : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-[#D4AF37]" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
              <div className="border-t border-white/10 p-3 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-300">Appearance</span>
                <ThemeToggle compact />
              </div>
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          {activeSection !== 'overview' && prevModule && nextModule && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border-theme bg-surface px-3 py-2">
              <button
                type="button"
                onClick={() => handleSelect('overview')}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-heading hover:bg-surface-muted transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Dashboard</span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelect(prevModule.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border-theme px-2.5 py-1.5 text-xs font-semibold text-body hover:bg-surface-muted transition-colors"
                  aria-label={`Previous module: ${prevModule.label}`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{prevModule.label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelect(nextModule.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border-theme px-2.5 py-1.5 text-xs font-semibold text-body hover:bg-surface-muted transition-colors"
                  aria-label={`Next module: ${nextModule.label}`}
                >
                  <span className="hidden sm:inline">{nextModule.label}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Live In-App Toast Notification on New Upload or Chat */}
      {latestAlert && (
        <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-sky-300 dark:border-sky-700 bg-surface p-4 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                handleNotificationClick(latestAlert);
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
