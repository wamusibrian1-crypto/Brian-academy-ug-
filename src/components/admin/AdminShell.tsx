import React, { useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
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

export type AdminSection =
  | 'overview'
  | 'students'
  | 'teachers'
  | 'classes'
  | 'examinations'
  | 'fees'
  | 'reports'
  | 'settings';

interface AdminShellProps {
  activeSection: AdminSection;
  onSelectSection: (section: AdminSection) => void;
  children: React.ReactNode;
}

export const AdminShell: React.FC<AdminShellProps> = ({
  activeSection,
  onSelectSection,
  children,
}) => {
  const { role, adminProfile, teacherProfile, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    onSelectSection(id);
    setMobileMenuOpen(false);
  };

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
                onClick={() => onSelectSection('overview')}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-heading hover:bg-surface-muted transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Dashboard</span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onSelectSection(prevModule.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border-theme px-2.5 py-1.5 text-xs font-semibold text-body hover:bg-surface-muted transition-colors"
                  aria-label={`Previous module: ${prevModule.label}`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{prevModule.label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectSection(nextModule.id)}
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
    </div>
  );
};
