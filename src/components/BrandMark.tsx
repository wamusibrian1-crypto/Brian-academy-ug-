import React from 'react';

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  light?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ size = 'md', light = false }) => {
  const iconDims = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-xl' : 'text-lg';

  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <svg
        viewBox="0 0 64 64"
        fill="none"
        className={`${iconDims} shrink-0 rounded-[22%] ring-1 ring-[#D4AF37]/30`}
        aria-hidden="true"
      >
        <rect width="64" height="64" rx="14" fill="#0B1F3A" />
        <path
          d="M32 10L50 18V33C50 43.5 42.2 51.4 32 54C21.8 51.4 14 43.5 14 33V18L32 10Z"
          fill="#102D54"
          stroke="#D4AF37"
          strokeWidth="2.5"
        />
        <path
          d="M21 28C24.5 25.8 28.5 25.8 32 28.2C35.5 25.8 39.5 25.8 43 28V41.5C39.5 39.6 35.5 39.6 32 41.8C28.5 39.6 24.5 39.6 21 41.5V28Z"
          fill="#FFFFFF"
        />
        <path d="M32 28.2V41.8" stroke="#0EA5E9" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="32" cy="21.5" r="3" fill="#0EA5E9" />
      </svg>
      <span
        className={`brand-wordmark font-extrabold ${textSize} ${
          light ? 'text-white' : 'text-heading'
        }`}
      >
        BRIAN ACADEMY{' '}
        <span className={light ? 'text-[#E5C14A]' : 'text-accent-gold-text'}>
          UG
        </span>
      </span>
    </div>
  );
};
