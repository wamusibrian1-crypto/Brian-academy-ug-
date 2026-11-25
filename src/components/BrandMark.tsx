import React, { useState } from 'react';
import cambridgeCrestImg from '../assets/images/cambridge_academy_crest_1795600535904.jpg';

const LOGO_SOURCES = [
  cambridgeCrestImg,
  '/official-logo-solid.png',
  '/official-logo.png',
];

interface OfficialLogoProps {
  className?: string;
  alt?: string;
  solid?: boolean;
}

/**
 * Renders the exact official BRIAN ACADEMY UG Cambridge-style heraldic crest emblem without cropping or distortion.
 */
export const OfficialLogo: React.FC<OfficialLogoProps> = ({
  className = 'h-24 w-24',
  alt = 'BRIAN ACADEMY UG Official Crest — Learn. Discover. Excel.',
  solid = false,
}) => {
  const [srcIdx, setSrcIdx] = useState(solid ? 0 : 0);
  const currentSrc = LOGO_SOURCES[Math.min(srcIdx, LOGO_SOURCES.length - 1)];

  return (
    <img
      src={currentSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => {
        setSrcIdx((prev) => (prev < LOGO_SOURCES.length - 1 ? prev + 1 : prev));
      }}
      className={`object-contain select-none shrink-0 ${className}`}
    />
  );
};

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  light?: boolean;
  showMotto?: boolean;
}

/**
 * Compact responsive navigation / header brand mark featuring the official logo and wordmark.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 'md',
  light = false,
  showMotto = false,
}) => {
  const logoFrame =
    size === 'sm'
      ? 'h-9 w-9 p-0.5'
      : size === 'lg'
        ? 'h-12 w-12 p-0.5'
        : 'h-10 w-10 p-0.5';
  const textSize = size === 'sm' ? 'text-sm sm:text-base' : size === 'lg' ? 'text-lg sm:text-xl' : 'text-base sm:text-lg';

  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <div
        className={`${logoFrame} flex items-center justify-center rounded-xl bg-white shadow-xs ring-1 ${
          light ? 'ring-[#EAB308]/55' : 'ring-[#124299]/15 dark:ring-[#EAB308]/35'
        } shrink-0`}
      >
        <OfficialLogo className="h-full w-full" />
      </div>
      <div className="flex flex-col leading-tight">
        <span
          className={`brand-wordmark font-extrabold ${textSize} ${
            light ? 'text-white' : 'text-heading'
          }`}
        >
          BRIAN ACADEMY{' '}
          <span className={light ? 'text-[#FACC15]' : 'text-accent-gold-text'}>
            UG
          </span>
        </span>
        {showMotto && (
          <span
            className={`text-[9px] font-bold tracking-[0.16em] uppercase ${
              light ? 'text-sky-200' : 'text-accent-sky-text'
            }`}
          >
            LEARN. DISCOVER. EXCEL.
          </span>
        )}
      </div>
    </div>
  );
};
