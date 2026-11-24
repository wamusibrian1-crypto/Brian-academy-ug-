import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Check,
  ClipboardCheck,
  Copy,
  CreditCard,
  ExternalLink,
  GraduationCap,
  Settings,
  Users,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { AdminSection } from './AdminShell';
import {
  FeePaymentRequest,
  FeeRecord,
  formatUGX,
  StudentProfile,
  SupportTicket,
} from '../../types/academy';
import { getLiveAppUrl } from '../../lib/validation';

interface AdminDashboardProps {
  onSelectSection: (section: AdminSection) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onSelectSection }) => {
  const { role, adminProfile, teacherProfile, academicSettings } = useAuth();
  const isAdmin = role === 'admin';
  const [studentCount, setStudentCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [teacherCount, setTeacherCount] = useState(0);
  const [totalFeesUGX, setTotalFeesUGX] = useState(0);
  const [pendingPaymentCount, setPendingPaymentCount] = useState(0);
  const [openTickets, setOpenTickets] = useState(0);
  const [copiedLiveUrl, setCopiedLiveUrl] = useState(false);

  useEffect(() => {
    const unsubStu = onSnapshot(collection(db, 'students'), (snap) => {
      const list = snap.docs.map((d) => d.data() as StudentProfile);
      setStudentCount(list.length);
      setPendingCount(list.filter((s) => s.status === 'pending').length);
    });

    let unsubTch = () => {};
    let unsubFees = () => {};
    let unsubPayReq = () => {};
    let unsubTickets = () => {};

    if (isAdmin) {
      unsubTch = onSnapshot(collection(db, 'teachers'), (snap) => {
        setTeacherCount(snap.size);
      });
      unsubFees = onSnapshot(collection(db, 'feeRecords'), (snap) => {
        const sum = snap.docs.reduce(
          (acc, d) => acc + ((d.data() as FeeRecord).amountPaidUGX || 0),
          0
        );
        setTotalFeesUGX(sum);
      });
      unsubPayReq = onSnapshot(collection(db, 'feePaymentRequests'), (snap) => {
        setPendingPaymentCount(
          snap.docs.filter((d) => (d.data() as FeePaymentRequest).status === 'pending').length
        );
      });
      unsubTickets = onSnapshot(collection(db, 'supportTickets'), (snap) => {
        setOpenTickets(
          snap.docs.filter((d) => (d.data() as SupportTicket).status === 'open').length
        );
      });
    }

    return () => {
      unsubStu();
      unsubTch();
      unsubFees();
      unsubPayReq();
      unsubTickets();
    };
  }, [isAdmin]);

  const cards: {
    id: AdminSection;
    title: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    iconBg: string;
    iconColor: string;
    badge?: string;
    adminOnly?: boolean;
  }[] = [
    {
      id: 'students',
      title: 'Manage Students',
      subtitle: 'Approve, S1–S6 & status',
      icon: GraduationCap,
      iconBg: 'bg-sky-100/90 dark:bg-sky-900/50',
      iconColor: 'text-sky-600 dark:text-sky-300',
      badge: pendingCount > 0 ? `${pendingCount} pending` : undefined,
      adminOnly: true,
    },
    {
      id: 'teachers',
      title: 'Manage Teachers',
      subtitle: 'Faculty & subjects',
      icon: Users,
      iconBg: 'bg-indigo-100/90 dark:bg-indigo-900/50',
      iconColor: 'text-[#0B1F3A] dark:text-indigo-300',
      adminOnly: true,
    },
    {
      id: 'classes',
      title: 'Classes & Subjects',
      subtitle: 'S1–S6 work & Live Class',
      icon: BookOpen,
      iconBg: 'bg-emerald-100/80 dark:bg-emerald-900/50',
      iconColor: 'text-emerald-700 dark:text-emerald-300',
    },
    {
      id: 'examinations',
      title: 'Examinations',
      subtitle: 'Tests, homework & remarks',
      icon: ClipboardCheck,
      iconBg: 'bg-sky-100/90 dark:bg-sky-900/50',
      iconColor: 'text-sky-700 dark:text-sky-300',
    },
    {
      id: 'fees',
      title: 'Fees Management',
      subtitle: 'UGX tuition & Airtel proofs',
      icon: CreditCard,
      iconBg: 'bg-amber-100/80 dark:bg-amber-900/50',
      iconColor: 'text-[#B8911E] dark:text-amber-300',
      badge: pendingPaymentCount > 0 ? `${pendingPaymentCount} to verify` : undefined,
      adminOnly: true,
    },
    {
      id: 'reports',
      title: 'Reports & Results',
      subtitle: 'Report Card PDF & logs',
      icon: BarChart3,
      iconBg: 'bg-amber-100/80 dark:bg-amber-900/50',
      iconColor: 'text-[#B8911E] dark:text-amber-300',
    },
    {
      id: 'settings',
      title: 'Platform Settings',
      subtitle: 'UNEB scales & adverts',
      icon: Settings,
      iconBg: 'bg-slate-100 dark:bg-slate-800',
      iconColor: 'text-[#0B1F3A] dark:text-slate-200',
      adminOnly: true,
    },
  ];

  const visibleCards = cards.filter((c) => isAdmin || !c.adminOnly);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0B1F3A] via-[#102D54] to-[#0E3A6E] p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[#D4AF37]">
              {academicSettings.termName} {academicSettings.academicYear} ·{' '}
              {academicSettings.gradingSystem.replace(/_/g, ' ')}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">
              {isAdmin ? 'Administrator Command Center' : 'Teacher Academic Workspace'}
            </h1>
            <p className="mt-1 text-sm text-sky-100">
              Signed in as {adminProfile?.fullName || teacherProfile?.fullName}
            </p>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(getLiveAppUrl());
                    setCopiedLiveUrl(true);
                    window.setTimeout(() => setCopiedLiveUrl(false), 2500);
                  } catch {
                    // ignore clipboard restrictions
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20"
              >
                {copiedLiveUrl ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#D4AF37]" />
                    <span>Live Link Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-[#D4AF37]" />
                    <span>Copy Live Link</span>
                  </>
                )}
              </button>
              <a
                href={getLiveAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#D4AF37] px-3.5 py-2 text-xs font-bold text-[#0B1F3A] hover:bg-[#e5c14a]"
              >
                <span>Open Live App</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-border-theme bg-surface p-4">
          <div className="text-xs font-medium text-muted">Registered Students</div>
          <div className="mt-1 font-display text-2xl font-bold text-heading tabular-nums">
            {studentCount}
          </div>
          <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-300 tabular-nums">
            {pendingCount} pending approval
          </div>
        </div>

        {isAdmin ? (
          <>
            <div className="rounded-2xl border border-border-theme bg-surface p-4">
              <div className="text-xs font-medium text-muted">Active Teachers</div>
              <div className="mt-1 font-display text-2xl font-bold text-heading tabular-nums">
                {teacherCount}
              </div>
              <div className="mt-0.5 text-xs text-muted">S1–S6 STEM Faculty</div>
            </div>

            <div className="rounded-2xl border border-border-theme bg-surface p-4">
              <div className="text-xs font-medium text-muted">Fees Collected</div>
              <div className="mt-1 font-display text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {formatUGX(totalFeesUGX)}
              </div>
              <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-300 tabular-nums">
                {pendingPaymentCount} payment proofs pending
              </div>
            </div>

            <div className="rounded-2xl border border-border-theme bg-surface p-4">
              <div className="text-xs font-medium text-muted">Open Help Tickets</div>
              <div className="mt-1 font-display text-2xl font-bold text-accent-gold-text tabular-nums">
                {openTickets}
              </div>
              <div className="mt-0.5 text-xs text-muted">Support · {academicSettings.supportPhone}</div>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-border-theme bg-surface p-4 col-span-1 lg:col-span-3">
            <div className="text-xs font-medium text-muted">Assigned Teaching Scope</div>
            <div className="mt-1 font-display text-base font-bold text-heading">
              Classes: {teacherProfile?.classes.join(', ') || 'None'} · Subjects:{' '}
              {teacherProfile?.subjects.join(', ') || 'None'}
            </div>
          </div>
        )}
      </div>

      {/* 3-Horizontal Icon Grid for Admin / Teaching Modules */}
      <section className="rounded-3xl border border-border-theme bg-surface p-4 sm:p-6 shadow-xs">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-heading">
            {isAdmin ? 'Administration Modules' : 'Teaching Modules'}
          </h2>
          <span className="text-xs font-medium text-faint">
            {isAdmin ? 'Airtel Money: ' + academicSettings.supportPhone : 'S1–S6 Faculty'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {visibleCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onSelectSection(card.id)}
                className="group flex flex-col items-center justify-center rounded-2xl border border-border-subtle bg-surface-subtle px-2 py-4 sm:py-5 text-center transition-all hover:border-sky-300 dark:hover:border-sky-500/60 hover:bg-surface hover:shadow-sm active:scale-[0.98]"
              >
                <div
                  className={`flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl ${card.iconBg} ${card.iconColor} transition-transform group-hover:scale-105`}
                >
                  <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
                </div>
                <span className="mt-2.5 font-display text-xs sm:text-sm font-bold text-heading leading-tight">
                  {card.title}
                </span>
                <span className="mt-1 hidden text-[11px] text-muted sm:block">
                  {card.subtitle}
                </span>
                {card.badge && (
                  <span className="mt-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                    {card.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
