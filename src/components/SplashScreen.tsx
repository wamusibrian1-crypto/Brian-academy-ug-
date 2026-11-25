import React from 'react';
import { OfficialLogo } from './BrandMark';

interface SplashScreenProps {
  fadingOut?: boolean;
}

/**
 * Branded Android PWA & Web application launch splash screen featuring the
 * official BRIAN ACADEMY UG crest emblem, Royal Blue/Sky Blue/Gold palette,
 * and institutional motto.
 */
export const SplashScreen: React.FC<SplashScreenProps> = ({ fadingOut = false }) => {
  return (
    <div
      role="status"
      aria-label="Loading BRIAN ACADEMY UG"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-b from-white via-[#F4F8FF] to-[#E6F0FD] dark:from-[#061124] dark:via-[#0B1F3A] dark:to-[#0E3378] px-6 transition-opacity duration-500 ${
        fadingOut ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* Top Royal Blue & Gold Institutional Accent Bar */}
      <div className="fixed inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#124299] via-[#0EA5E9] to-[#EAB308]" />

      <div className="flex flex-col items-center text-center max-w-sm">
        <div className="rounded-3xl bg-white p-4 shadow-xl ring-2 ring-[#EAB308]/60">
          <OfficialLogo className="h-36 w-36 sm:h-44 sm:w-44" />
        </div>

        <h1 className="mt-6 brand-wordmark text-2xl sm:text-3xl font-extrabold text-[#0B1F3A] dark:text-white tracking-wide">
          BRIAN ACADEMY <span className="text-[#D4AF37]">UG</span>
        </h1>

        <p className="mt-1.5 text-xs font-extrabold tracking-[0.22em] text-[#124299] dark:text-[#38BDF8] uppercase">
          LEARN. DISCOVER. EXCEL.
        </p>

        <p className="mt-2 text-xs font-medium text-[#526785] dark:text-sky-100/80">
          Physics · Chemistry · Biology · Mathematics (S1–S6)
        </p>

        {/* Smooth Royal Blue & Gold Progress Bar */}
        <div className="mt-6 h-1.5 w-44 overflow-hidden rounded-full bg-[#124299]/15 dark:bg-white/15">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-[#124299] via-[#0EA5E9] to-[#EAB308]" />
        </div>
      </div>

      <p className="fixed bottom-6 text-[11px] font-semibold text-[#526785] dark:text-sky-200/75">
        Official Online Secondary Academy · S1–S6 STEM
      </p>
    </div>
  );
};
