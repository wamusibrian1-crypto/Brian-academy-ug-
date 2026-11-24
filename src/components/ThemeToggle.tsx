import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface ThemeToggleProps {
  compact?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ compact = false }) => {
  const { isDark, toggleTheme } = useTheme();

  if (compact) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        onClick={toggleTheme}
        className="inline-flex w-full items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/10 transition-colors"
      >
        <span className="inline-flex items-center gap-2">
          {isDark ? (
            <Moon className="h-3.5 w-3.5 text-[#E5C14A]" />
          ) : (
            <Sun className="h-3.5 w-3.5 text-[#D4AF37]" />
          )}
          <span>{isDark ? 'Dark Theme' : 'Light Theme'}</span>
        </span>
        <span className="text-[11px] text-sky-300">{isDark ? 'ON' : 'OFF'}</span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-border-theme bg-surface p-5 sm:p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-sky-soft text-accent-sky-text shrink-0">
          {isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </div>
        <div>
          <h2 className="font-display text-base font-bold text-heading">
            Appearance & Dark Mode
          </h2>
          <p className="text-xs text-muted">
            {isDark
              ? 'Midnight Navy dark theme is active across all portals.'
              : 'Classic crisp light theme is active. Switch to Dark Mode for low-light comfort.'}
          </p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        onClick={toggleTheme}
        className="inline-flex items-center gap-3 rounded-xl border border-border-input bg-surface-muted px-4 py-2.5 text-xs font-semibold text-heading hover:border-accent-sky transition-colors"
      >
        <span>{isDark ? 'Dark Mode: ON' : 'Dark Mode: OFF'}</span>
        <span
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            isDark ? 'bg-sky-500' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
              isDark ? 'translate-x-4.5' : 'translate-x-1'
            }`}
          />
        </span>
      </button>
    </div>
  );
};
