import React, { useState } from 'react';
import { Check, Chrome, Copy, Download, ExternalLink, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { getLiveAppUrl } from '../lib/validation';

interface PWAInstallButtonProps {
  variant?: 'header' | 'card' | 'landing';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuide(true);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getLiveAppUrl());
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  const buttonClass =
    variant === 'landing'
      ? 'inline-flex w-full items-center justify-center gap-2.5 rounded-2xl border border-sky-300/60 dark:border-sky-700/60 bg-accent-sky-soft px-5 py-3.5 text-sm font-bold text-heading shadow-xs hover:border-accent-sky transition-all'
      : variant === 'card'
        ? 'inline-flex items-center gap-2 rounded-xl bg-btn-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-btn-primary-hover transition-colors whitespace-nowrap shrink-0'
        : isInstallable
          ? 'inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-600 transition-colors whitespace-nowrap shrink-0'
          : 'inline-flex items-center gap-1.5 rounded-xl border border-border-theme bg-surface px-3 py-2 text-xs font-semibold text-heading hover:bg-surface-muted transition-colors whitespace-nowrap shrink-0';

  const buttonLabel =
    variant === 'landing'
      ? isInstallable
        ? 'Download App on Chrome'
        : isIOS
          ? 'Download App (iOS / Chrome)'
          : 'Download App on Chrome'
      : isInstallable
        ? 'Download on Chrome'
        : isIOS
          ? 'Install on iOS'
          : 'Chrome App';

  return (
    <>
      <button type="button" onClick={handleClick} className={buttonClass}>
        {variant === 'landing' || isInstallable ? (
          <Chrome className="h-4 w-4 text-accent-sky-text shrink-0" />
        ) : (
          <Smartphone className="h-3.5 w-3.5 text-accent-sky-text shrink-0" />
        )}
        <span>{buttonLabel}</span>
        {variant === 'landing' && (
          <Download className="h-4 w-4 text-heading shrink-0" />
        )}
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl border border-border-theme">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-bold text-heading">
                  Download BRIAN ACADEMY UG on Chrome
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Install as an Android, tablet, or desktop Chrome application.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="rounded-lg p-1.5 text-faint hover:bg-surface-muted hover:text-heading"
                aria-label="Close installation guide"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-2.5 text-sm text-body">
                <li>1. Open BRIAN ACADEMY UG in Safari or Chrome on your iPhone/iPad.</li>
                <li>2. Tap the <strong>Share</strong> icon in the browser bar.</li>
                <li>3. Tap <strong>Add to Home Screen</strong> to install the app.</li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2.5 text-sm text-body">
                <li>
                  1. Open this link in <strong>Google Chrome</strong> on your Android phone or computer.
                </li>
                <li>
                  2. On Android Chrome, tap the menu (<strong>⋮</strong>) at the top-right and choose{' '}
                  <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
                </li>
                <li>
                  3. On Desktop Chrome, click the <strong>Install icon</strong> on the right side of the
                  address bar.
                </li>
              </ol>
            )}

            <div className="mt-5 space-y-2.5">
              <a
                href={getLiveAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-700 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open Live App in Chrome</span>
              </a>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border-input bg-surface-muted px-4 py-2.5 text-xs font-semibold text-heading hover:border-accent-sky transition-colors"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <span>App Link Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 text-accent-sky-text" />
                      <span>Copy Link for Chrome</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="flex-1 rounded-xl bg-btn-primary px-4 py-2.5 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
