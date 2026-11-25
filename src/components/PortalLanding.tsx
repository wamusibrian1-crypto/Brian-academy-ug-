import React, { useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  GraduationCap,
  ImageIcon,
  Mail,
  Phone,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BrandMark, OfficialLogo } from './BrandMark';
import { PWAInstallButton } from './PWAInstallButton';
import { ThemeToggle } from './ThemeToggle';
import { PortalIntent, useAuth } from '../context/AuthContext';
import { AdvertPhoto } from '../types/academy';
import { sanitizeSafeImageUrl } from '../lib/validation';
import { PublicNotificationBell } from './PublicNotificationPopout';
import { PublicNotificationItem } from '../hooks/usePublicNotifications';
import defaultHeroImg from '../assets/images/hero_campus_uganda_1795523775535.jpg';

interface PublicAlertsProps {
  notifications: PublicNotificationItem[];
  unreadCount: number;
  seenIds: Record<string, boolean>;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  browserPermission: NotificationPermission;
  supportsBrowserNotifications: boolean;
  onRequestBrowserPermission: () => void;
}

interface PortalLandingProps {
  onSelectPortal: (portal: PortalIntent) => void;
  publicAlerts?: PublicAlertsProps;
}

const DEFAULT_ADVERTS: AdvertPhoto[] = [
  {
    id: 'default_advert_1',
    title: 'BRIAN ACADEMY UG — S1 to S6 STEM Excellence',
    caption:
      'Live online classes, study materials, and UNEB exam preparation in Physics, Chemistry, Biology & Mathematics.',
    imageUrl: defaultHeroImg,
    active: true,
    createdBy: 'system',
  },
];

function sanitizeSafeHttpsUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\/[^\s"'<>]+$/i.test(trimmed)) return trimmed;
  return '';
}

export const PortalLanding: React.FC<PortalLandingProps> = ({
  onSelectPortal,
  publicAlerts,
}) => {
  const { academicSettings, homepageConfig } = useAuth();
  const [adverts, setAdverts] = useState<AdvertPhoto[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const q = query(collection(db, 'advertPhotos'), where('active', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as AdvertPhoto)
          .filter((a) => Boolean(sanitizeSafeImageUrl(a.imageUrl)));
        setAdverts(list);
        setActiveIndex(0);
      },
      () => {
        setAdverts([]);
      }
    );
    return () => unsub();
  }, []);

  const displayAdverts = adverts.length > 0 ? adverts : DEFAULT_ADVERTS;
  const safeIndex = activeIndex % displayAdverts.length;
  const currentAdvert = displayAdverts[safeIndex];
  const currentImageUrl =
    currentAdvert.id === 'default_advert_1'
      ? defaultHeroImg
      : sanitizeSafeImageUrl(currentAdvert.imageUrl);

  useEffect(() => {
    if (displayAdverts.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % displayAdverts.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [displayAdverts.length]);

  const contactEmail = homepageConfig.contactEmail || academicSettings.supportEmail || 'wamusibrian5@gmail.com';
  const contactPhone = homepageConfig.contactPhone || academicSettings.supportPhone || '256753336009';
  const safeTelDigits = contactPhone.replace(/[^0-9+]/g, '');
  const safeApkUrl = sanitizeSafeHttpsUrl(homepageConfig.androidApkUrl);

  const admissionLines = (homepageConfig.admissionsRequirements || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const heroTitleUpper = (homepageConfig.heroTitle || 'BRIAN ACADEMY UG').trim();
  const endsWithUg = /\bUG$/i.test(heroTitleUpper);
  const heroMainPart = endsWithUg
    ? heroTitleUpper.replace(/\s+UG$/i, '')
    : heroTitleUpper;

  return (
    <div className="min-h-screen bg-canvas text-heading flex flex-col">
      {/* Official Branded Top Bar */}
      <header className="sticky top-0 z-30 border-b border-border-theme bg-header-bg backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <BrandMark size="md" showMotto />
          <nav className="flex items-center gap-1.5 sm:gap-2.5">
            {homepageConfig.admissionsEnabled && (
              <a
                href="#admissions"
                className="hidden md:inline-flex items-center rounded-xl px-3 py-2 text-xs font-semibold text-body hover:bg-surface-muted hover:text-heading transition-colors whitespace-nowrap shrink-0"
              >
                Admissions
              </a>
            )}
            {homepageConfig.appDownloadEnabled && (
              <a
                href="#app-download"
                className="hidden md:inline-flex items-center rounded-xl px-3 py-2 text-xs font-semibold text-body hover:bg-surface-muted hover:text-heading transition-colors whitespace-nowrap shrink-0"
              >
                App Download
              </a>
            )}
            <a
              href="#about-us"
              className="hidden sm:inline-flex items-center rounded-xl px-3 py-2 text-xs font-semibold text-body hover:bg-surface-muted hover:text-heading transition-colors whitespace-nowrap shrink-0"
            >
              About Us
            </a>
            {publicAlerts && (
              <PublicNotificationBell
                notifications={publicAlerts.notifications}
                unreadCount={publicAlerts.unreadCount}
                seenIds={publicAlerts.seenIds}
                onMarkRead={publicAlerts.onMarkRead}
                onMarkAllRead={publicAlerts.onMarkAllRead}
                onSelectPortal={onSelectPortal}
                browserPermission={publicAlerts.browserPermission}
                supportsBrowserNotifications={publicAlerts.supportsBrowserNotifications}
                onRequestBrowserPermission={publicAlerts.onRequestBrowserPermission}
              />
            )}
            <ThemeToggle compact />
            <PWAInstallButton variant="header" />
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-4 py-8 sm:px-6 lg:py-10">
        {/* Hero: Official Cambridge-Style Crest + Portal Logins + Advert Carousel */}
        <section className="grid w-full grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
          {/* Left Column: Official Crest Emblem + Separate Portal Logins */}
          <div
            className={`flex flex-col justify-center space-y-5 ${
              homepageConfig.advertsEnabled ? 'lg:col-span-5' : 'lg:col-span-6'
            }`}
          >
            <div className="flex items-center gap-4 rounded-2xl border border-border-theme bg-surface p-4 shadow-xs">
              <div className="flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center rounded-2xl bg-white p-1 shadow-xs ring-2 ring-[#EAB308]/55">
                <OfficialLogo className="h-full w-full" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-sky-text">
                  {homepageConfig.heroEyebrow}
                </span>
                <h1 className="mt-0.5 brand-wordmark text-2xl font-extrabold text-heading sm:text-[1.75rem] leading-tight">
                  {heroMainPart}{' '}
                  {endsWithUg && <span className="text-accent-gold-text">UG</span>}
                </h1>
                <p className="mt-1 text-xs font-extrabold tracking-wider text-[#124299] dark:text-[#38BDF8]">
                  {homepageConfig.motto}
                </p>
                <div className="mt-2 h-1 w-16 rounded-full bg-gradient-to-r from-[#124299] via-[#0EA5E9] to-[#EAB308]" />
              </div>
            </div>

            {homepageConfig.heroSubtitle && (
              <p className="text-sm text-body leading-relaxed px-1">
                {homepageConfig.heroSubtitle}
              </p>
            )}

            <div className="space-y-3.5">
              {/* Student Login Card */}
              <button
                type="button"
                onClick={() => onSelectPortal('student')}
                className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-border-theme bg-surface p-4 sm:p-5 text-left shadow-xs hover:border-accent-sky hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-sky-soft text-accent-sky-text shrink-0">
                    <GraduationCap className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-display text-lg font-bold text-heading group-hover:text-accent-sky-text transition-colors">
                      Student Login
                    </div>
                    <div className="text-xs text-muted">
                      Sign in or register as an S1–S6 student
                    </div>
                  </div>
                </div>
                <span className="rounded-xl bg-btn-primary px-4 py-2 text-xs font-semibold text-white group-hover:bg-btn-primary-hover shrink-0 whitespace-nowrap">
                  Enter
                </span>
              </button>

              {/* Administrator Login Card */}
              <button
                type="button"
                onClick={() => onSelectPortal('admin')}
                className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-border-theme bg-surface p-4 sm:p-5 text-left shadow-xs hover:border-accent-gold hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-gold-soft text-accent-gold-text shrink-0">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-display text-lg font-bold text-heading group-hover:text-accent-gold-text transition-colors">
                      Administrator Login
                    </div>
                    <div className="text-xs text-muted">
                      Authorized administrators & teaching staff
                    </div>
                  </div>
                </div>
                <span className="rounded-xl bg-[#EAB308] px-4 py-2 text-xs font-bold text-[#0B1F3A] group-hover:bg-[#FACC15] shrink-0 whitespace-nowrap">
                  Enter
                </span>
              </button>

              {/* Chrome App Download Button */}
              <div className="pt-0.5">
                <PWAInstallButton variant="landing" />
              </div>
            </div>
          </div>

          {/* Right Column: Administrator Advert Photos Carousel (or Academic Showcase when hidden) */}
          <div className={homepageConfig.advertsEnabled ? 'lg:col-span-7' : 'lg:col-span-6'}>
            {homepageConfig.advertsEnabled ? (
              <div className="relative flex h-full min-h-[320px] sm:min-h-[430px] flex-col overflow-hidden rounded-3xl border border-border-theme bg-surface shadow-xs">
                <div className="relative flex-1 bg-surface-muted overflow-hidden">
                  {currentImageUrl ? (
                    <img
                      src={currentImageUrl}
                      alt={currentAdvert.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-faint">
                      <ImageIcon className="h-10 w-10" />
                      <span className="mt-2 text-xs font-medium">Advert Photo Slot</span>
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0B1F3A]/95 via-[#124299]/60 to-transparent p-6 text-white">
                    <h2 className="font-display text-lg font-bold text-white">
                      {currentAdvert.title}
                    </h2>
                    {currentAdvert.caption && (
                      <p className="mt-1 text-xs text-sky-100">{currentAdvert.caption}</p>
                    )}
                  </div>

                  {displayAdverts.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveIndex(
                            (prev) => (prev - 1 + displayAdverts.length) % displayAdverts.length
                          )
                        }
                        className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-heading shadow-sm hover:bg-surface"
                        aria-label="Previous advert photo"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveIndex((prev) => (prev + 1) % displayAdverts.length)
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-heading shadow-sm hover:bg-surface"
                        aria-label="Next advert photo"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </>
                  )}
                </div>

                {displayAdverts.length > 1 && (
                  <div className="flex items-center justify-center gap-2 border-t border-border-subtle bg-surface px-4 py-3">
                    {displayAdverts.map((adv, idx) => (
                      <button
                        key={adv.id}
                        type="button"
                        onClick={() => setActiveIndex(idx)}
                        className={`h-2 rounded-full transition-all ${
                          idx === safeIndex ? 'w-6 bg-btn-primary' : 'w-2 bg-border-input'
                        }`}
                        aria-label={`View advert ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-3xl border border-border-theme bg-surface p-8 text-center shadow-xs space-y-4">
                <div className="rounded-3xl bg-white p-4 shadow-sm ring-2 ring-[#EAB308]/50">
                  <OfficialLogo className="h-40 w-40 sm:h-48 sm:w-48" />
                </div>
                <div className="space-y-1.5 max-w-md">
                  <div className="text-xs font-extrabold tracking-[0.2em] text-[#124299] dark:text-[#38BDF8] uppercase">
                    {homepageConfig.motto}
                  </div>
                  <h2 className="font-display text-xl font-bold text-heading">
                    Physics · Chemistry · Biology · Mathematics
                  </h2>
                  <p className="text-xs text-muted">
                    Senior One to Senior Six UNEB-aligned secondary digital campus.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Official App Download Section */}
        {homepageConfig.appDownloadEnabled && (
          <section
            id="app-download"
            className="rounded-3xl border border-border-theme bg-gradient-to-br from-[#0B1F3A] via-[#124299] to-[#0E3378] p-6 sm:p-8 text-white shadow-sm"
          >
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
              <div className="space-y-4 lg:col-span-7">
                <div className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold tracking-wider text-[#FACC15] uppercase">
                  <Smartphone className="h-4 w-4" />
                  <span>Android, iOS & Desktop App</span>
                </div>

                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight">
                  {homepageConfig.appDownloadTitle}
                </h2>

                <p className="text-sm text-sky-100 leading-relaxed max-w-2xl">
                  {homepageConfig.appDownloadDescription}
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <PWAInstallButton variant="card" />
                  {safeApkUrl && (
                    <a
                      href={safeApkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#EAB308] px-5 py-2.5 text-sm font-bold text-[#0B1F3A] shadow-sm hover:bg-[#FACC15] transition-colors whitespace-nowrap shrink-0"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download Android APK</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-xs space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 shrink-0 rounded-2xl bg-white p-1 shadow-xs">
                      <OfficialLogo className="h-full w-full" />
                    </div>
                    <div>
                      <div className="font-display text-sm font-bold text-white">
                        {homepageConfig.heroTitle} Mobile
                      </div>
                      <div className="text-xs text-sky-200">
                        {homepageConfig.motto}
                      </div>
                    </div>
                  </div>
                  <ul className="space-y-2 text-xs text-sky-100">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[#FACC15] shrink-0 mt-0.5" />
                      <span>Read Physics, Chemistry, Biology & Mathematics PDFs on any screen</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[#FACC15] shrink-0 mt-0.5" />
                      <span>Submit homework photos & answer documents straight from your phone</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[#FACC15] shrink-0 mt-0.5" />
                      <span>Receive instant alerts for live classes, assignments & chat messages</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Official Admissions Section */}
        {homepageConfig.admissionsEnabled && (
          <section
            id="admissions"
            className="rounded-3xl border border-border-theme bg-surface p-6 sm:p-8 shadow-xs space-y-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle pb-5">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-xl bg-accent-gold-soft px-3 py-1.5 text-xs font-bold text-accent-gold-text uppercase tracking-wider">
                  <GraduationCap className="h-4 w-4" />
                  <span>Admissions Office · S1 – S6</span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-heading leading-tight">
                  {homepageConfig.admissionsTitle}
                </h2>
                <p className="text-sm text-body leading-relaxed">
                  {homepageConfig.admissionsSummary}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onSelectPortal('student')}
                className="inline-flex items-center gap-2 rounded-xl bg-btn-primary px-5 py-3 text-sm font-semibold text-white shadow-xs hover:bg-btn-primary-hover transition-colors whitespace-nowrap shrink-0"
              >
                <GraduationCap className="h-4 w-4 text-accent-gold" />
                <span>Apply for Admission</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="space-y-3 lg:col-span-7">
                <h3 className="font-display text-base font-bold text-heading">
                  How to Enroll & Requirements
                </h3>
                <div className="space-y-2.5">
                  {admissionLines.map((line, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 rounded-2xl border border-border-theme bg-surface-subtle p-3.5 text-sm text-body"
                    >
                      <CheckCircle2 className="h-4 w-4 text-accent-sky-text shrink-0 mt-0.5" />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 lg:col-span-5">
                <h3 className="font-display text-base font-bold text-heading">
                  Official Admissions Contact
                </h3>
                <div className="rounded-2xl border border-border-theme bg-surface-subtle p-4 space-y-3.5">
                  <a
                    href={`mailto:${contactEmail}`}
                    className="flex items-center gap-3 rounded-xl border border-border-theme bg-surface p-3 hover:border-accent-sky transition-colors"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-sky-soft text-accent-sky-text shrink-0">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                        Admissions Email
                      </div>
                      <div className="text-sm font-bold text-heading truncate">
                        {contactEmail}
                      </div>
                    </div>
                  </a>

                  <a
                    href={`tel:${safeTelDigits}`}
                    className="flex items-center gap-3 rounded-xl border border-border-theme bg-surface p-3 hover:border-accent-gold transition-colors"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-gold-soft text-accent-gold-text shrink-0">
                      <Phone className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                        Phone / WhatsApp / Airtel Money
                      </div>
                      <div className="font-mono text-sm font-bold text-heading">
                        {contactPhone}
                      </div>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Official About Us Section */}
        <section
          id="about-us"
          className="rounded-3xl border border-border-theme bg-surface p-6 sm:p-8 shadow-xs"
        >
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
            <div className="flex justify-center lg:col-span-4">
              <div className="flex flex-col items-center rounded-3xl border border-[#124299]/15 dark:border-[#EAB308]/30 bg-white p-5 shadow-sm">
                <OfficialLogo className="h-44 w-44 sm:h-52 sm:w-52" />
                <div className="mt-3 text-center">
                  <div className="text-xs font-extrabold tracking-widest text-[#124299] uppercase">
                    {homepageConfig.motto}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[#0B1F3A]">
                    SENIOR ONE – SENIOR SIX · STEM ACADEMY
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 lg:col-span-8">
              <div className="inline-flex items-center gap-2 rounded-xl bg-accent-sky-soft px-3 py-1.5 text-xs font-bold text-accent-sky-text">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{homepageConfig.aboutBadge}</span>
              </div>

              <h2 className="font-display text-2xl sm:text-3xl font-bold text-heading leading-tight">
                {homepageConfig.aboutTitle}
              </h2>

              <p className="text-sm text-body leading-relaxed">
                {homepageConfig.aboutDescription}
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-1">
                <div className="rounded-2xl border border-border-theme bg-surface-subtle p-4">
                  <BookOpen className="h-5 w-5 text-[#124299] dark:text-[#38BDF8]" />
                  <h3 className="mt-2 font-display text-sm font-bold text-heading">
                    Four Core STEM Subjects
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    Physics, Chemistry, Biology & Mathematics for S1–S6 learners.
                  </p>
                </div>

                <div className="rounded-2xl border border-border-theme bg-surface-subtle p-4">
                  <Award className="h-5 w-5 text-accent-gold-text" />
                  <h3 className="mt-2 font-display text-sm font-bold text-heading">
                    Official Academic Reports
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    Verified term report cards, teacher remarks & official certificates.
                  </p>
                </div>

                <div className="rounded-2xl border border-border-theme bg-surface-subtle p-4">
                  <Phone className="h-5 w-5 text-accent-sky-text" />
                  <h3 className="mt-2 font-display text-sm font-bold text-heading">
                    Direct Support & Admissions
                  </h3>
                  <p className="mt-1 text-xs text-muted break-words">
                    <strong className="text-heading">{contactPhone}</strong> · {contactEmail}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Institutional Footer */}
      <footer className="border-t border-border-theme bg-surface py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6 text-xs text-muted">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-white p-0.5 ring-1 ring-border-theme shrink-0">
              <OfficialLogo className="h-full w-full" />
            </div>
            <span className="font-semibold text-heading">
              {homepageConfig.heroTitle} · {homepageConfig.motto}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href={`mailto:${contactEmail}`} className="hover:text-heading underline-offset-2 hover:underline">
              {contactEmail}
            </a>
            <span>·</span>
            <a href={`tel:${safeTelDigits}`} className="font-mono hover:text-heading underline-offset-2 hover:underline">
              {contactPhone}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
