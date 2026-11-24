import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  ImageIcon,
  ShieldCheck,
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BrandMark } from './BrandMark';
import { PWAInstallButton } from './PWAInstallButton';
import { PortalIntent } from '../context/AuthContext';
import { AdvertPhoto } from '../types/academy';
import { sanitizeSafeImageUrl } from '../lib/validation';

interface PortalLandingProps {
  onSelectPortal: (portal: PortalIntent) => void;
}

const DEFAULT_ADVERTS: AdvertPhoto[] = [
  {
    id: 'default_advert_1',
    title: 'BRIAN ACADEMY UG',
    caption: 'Administrators can publish campus and admissions advert photos here.',
    imageUrl: '/src/assets/images/hero_campus_uganda_1795523775535.jpg',
    active: true,
    createdBy: 'system',
  },
];

export const PortalLanding: React.FC<PortalLandingProps> = ({ onSelectPortal }) => {
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
        // Fallback silently to default advert slot if offline or uninitialized
        setAdverts([]);
      }
    );
    return () => unsub();
  }, []);

  const displayAdverts = adverts.length > 0 ? adverts : DEFAULT_ADVERTS;
  const safeIndex = activeIndex % displayAdverts.length;
  const currentAdvert = displayAdverts[safeIndex];
  const currentImageUrl = sanitizeSafeImageUrl(currentAdvert.imageUrl);

  useEffect(() => {
    if (displayAdverts.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % displayAdverts.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [displayAdverts.length]);

  return (
    <div className="min-h-screen bg-canvas text-heading flex flex-col">
      {/* Minimal Header: App Name & Install Action */}
      <header className="border-b border-border-theme bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <BrandMark size="lg" />
          <PWAInstallButton variant="header" />
        </div>
      </header>

      {/* Main Content: ONLY App Name, Logins, and Administrator Advert Photos */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-8 sm:px-6 lg:py-12">
        <div className="grid w-full grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
          {/* Left Column: App Name + Two Separate Logins */}
          <div className="flex flex-col justify-center space-y-6 lg:col-span-5">
            <div className="space-y-2.5">
              <h1 className="brand-wordmark text-3xl font-extrabold text-heading sm:text-4xl lg:text-[2.6rem] leading-tight">
                BRIAN ACADEMY{' '}
                <span className="bg-gradient-to-r from-[#B8911E] via-[#D4AF37] to-[#0284C7] dark:from-[#F3D267] dark:via-[#E5C14A] dark:to-[#38BDF8] bg-clip-text text-transparent">
                  UG
                </span>
              </h1>
              <div className="h-1 w-20 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#0EA5E9]" />
            </div>

            <div className="space-y-4">
              {/* Student Login Card */}
              <button
                type="button"
                onClick={() => onSelectPortal('student')}
                className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-border-theme bg-surface p-5 text-left shadow-xs hover:border-accent-sky hover:shadow-md transition-all"
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
                      Sign in or register as a student
                    </div>
                  </div>
                </div>
                <span className="rounded-xl bg-btn-primary px-4 py-2 text-xs font-semibold text-white group-hover:bg-btn-primary-hover shrink-0">
                  Enter
                </span>
              </button>

              {/* Administrator Login Card */}
              <button
                type="button"
                onClick={() => onSelectPortal('admin')}
                className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-border-theme bg-surface p-5 text-left shadow-xs hover:border-accent-gold hover:shadow-md transition-all"
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
                      Authorized administrators and staff
                    </div>
                  </div>
                </div>
                <span className="rounded-xl border border-border-input bg-surface-muted px-4 py-2 text-xs font-semibold text-heading group-hover:border-accent-gold shrink-0">
                  Enter
                </span>
              </button>

              {/* Chrome App Download Button */}
              <div className="pt-1">
                <PWAInstallButton variant="landing" />
              </div>
            </div>
          </div>

          {/* Right Column: Administrator Advert Photos Provision */}
          <div className="lg:col-span-7">
            <div className="relative flex h-full min-h-[320px] sm:min-h-[400px] flex-col overflow-hidden rounded-3xl border border-border-theme bg-surface shadow-xs">
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

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#061326]/95 via-[#0B1F3A]/55 to-transparent p-6 text-white">
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
          </div>
        </div>
      </main>
    </div>
  );
};
