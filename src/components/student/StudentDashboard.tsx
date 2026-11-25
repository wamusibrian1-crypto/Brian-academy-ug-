import React from 'react';
import {
  BookOpen,
  ClipboardCheck,
  CreditCard,
  FileText,
  HelpCircle,
  MessageSquare,
  Video,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { StudentFeature } from './StudentShell';
import { CLASS_LEVELS } from '../../types/academy';
import { OfficialLogo } from '../BrandMark';

interface StudentDashboardProps {
  onOpenFeature: (feature: Exclude<StudentFeature, null>) => void;
  unreadCounts?: Partial<Record<Exclude<StudentFeature, null>, number>>;
}

const DASHBOARD_CARDS: {
  id: Exclude<StudentFeature, null>;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
}[] = [
  {
    id: 'live-class',
    title: 'Live Class',
    icon: Video,
    iconBg: 'bg-sky-100/90 dark:bg-sky-900/50',
    iconColor: 'text-sky-600 dark:text-sky-300',
  },
  {
    id: 'fees',
    title: 'Fees',
    icon: CreditCard,
    iconBg: 'bg-amber-100/80 dark:bg-amber-900/40',
    iconColor: 'text-[#B8911E] dark:text-[#E5C14A]',
  },
  {
    id: 'study-material',
    title: 'Study Material',
    icon: BookOpen,
    iconBg: 'bg-indigo-100/90 dark:bg-indigo-900/50',
    iconColor: 'text-[#124299] dark:text-indigo-300',
  },
  {
    id: 'test',
    title: 'Test',
    icon: ClipboardCheck,
    iconBg: 'bg-sky-100/90 dark:bg-sky-900/50',
    iconColor: 'text-sky-700 dark:text-sky-300',
  },
  {
    id: 'chat',
    title: 'Chat',
    icon: MessageSquare,
    iconBg: 'bg-emerald-100/80 dark:bg-emerald-900/45',
    iconColor: 'text-emerald-700 dark:text-emerald-300',
  },
  {
    id: 'homework',
    title: 'Homework',
    icon: FileText,
    iconBg: 'bg-amber-100/80 dark:bg-amber-900/40',
    iconColor: 'text-[#B8911E] dark:text-[#E5C14A]',
  },
  {
    id: 'help',
    title: 'Help',
    icon: HelpCircle,
    iconBg: 'bg-slate-100 dark:bg-slate-800/80',
    iconColor: 'text-[#0B1F3A] dark:text-slate-200',
  },
];

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  onOpenFeature,
  unreadCounts,
}) => {
  const { studentProfile, academicSettings } = useAuth();
  if (!studentProfile) return null;

  const classLabel =
    CLASS_LEVELS.find((c) => c.code === studentProfile.classLevel)?.label ||
    studentProfile.classLevel;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Educate-style Clean Student Welcome Banner */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1F3A] via-[#124299] to-[#0284C7] p-5 sm:p-6 text-white shadow-sm">
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="hidden xs:flex sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white p-1 shadow-xs ring-2 ring-[#EAB308]/60">
              <OfficialLogo className="h-full w-full" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-sky-200 truncate">
                {academicSettings.termName} {academicSettings.academicYear} · {classLabel}
              </p>
              <h1 className="mt-0.5 font-display text-xl font-bold tracking-tight sm:text-2xl truncate">
                Hi, {studentProfile.fullName}
              </h1>
              <p className="mt-0.5 text-[11px] font-semibold tracking-wider text-[#FACC15] uppercase truncate">
                LEARN. DISCOVER. EXCEL.
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-2xl bg-white/10 px-3.5 py-2.5 text-center backdrop-blur-xs border border-white/15">
            <div className="font-display text-lg font-extrabold text-[#FACC15]">
              {studentProfile.classLevel}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-100">
              {studentProfile.status === 'approved' ? 'Active' : 'Pending'}
            </div>
          </div>
        </div>
      </section>

      {studentProfile.status === 'pending' && (
        <div className="rounded-2xl border border-border-theme bg-surface px-4 py-3 text-xs font-medium text-muted">
          Your account is awaiting administrator approval. You can preview your class modules below.
        </div>
      )}

      {/* ONLY the 7 Required Feature Cards in a Clean 3-Horizontal Icon Grid (Educate Style) */}
      <section aria-label="Student Dashboard Features" className="rounded-3xl border border-border-theme bg-surface p-4 sm:p-6 shadow-xs">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-heading">
            Academy Portal
          </h2>
          <span className="text-xs font-medium text-faint">
            {studentProfile.classLevel}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {DASHBOARD_CARDS.map((card) => {
            const Icon = card.icon;
            const badgeCount = unreadCounts?.[card.id] || 0;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onOpenFeature(card.id)}
                className="group relative flex flex-col items-center justify-center rounded-2xl border border-border-subtle bg-surface-subtle px-2 py-4 sm:py-5 text-center transition-all hover:border-accent-sky hover:bg-surface-muted hover:shadow-sm active:scale-[0.98]"
              >
                {badgeCount > 0 && (
                  <span className="absolute right-2.5 top-2.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white tabular-nums">
                    {badgeCount}
                  </span>
                )}
                <div
                  className={`flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl ${card.iconBg} ${card.iconColor} transition-transform group-hover:scale-105`}
                >
                  <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
                </div>
                <span className="mt-2.5 font-display text-xs sm:text-sm font-bold text-heading leading-tight">
                  {card.title}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
