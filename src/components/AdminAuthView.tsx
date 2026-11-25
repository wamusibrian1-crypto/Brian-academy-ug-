import React, { useState } from 'react';
import { ArrowLeft, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { BrandMark, OfficialLogo } from './BrandMark';
import { useAuth } from '../context/AuthContext';

export const AdminAuthView: React.FC = () => {
  const {
    firebaseUser,
    loadingProfile,
    authError,
    clearAuthError,
    setPortalIntent,
    loginWithEmail,
    loginWithGoogle,
    logout,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    setSubmitting(true);
    try {
      await loginWithEmail(email, password, 'admin');
    } catch {
      // handled in AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    clearAuthError();
    setSubmitting(true);
    try {
      await loginWithGoogle('admin');
    } catch {
      // handled in AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B1F3A] via-[#0E3378] to-[#124299] px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-md">
        <button
          type="button"
          onClick={() => setPortalIntent('landing')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-200 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to BRIAN ACADEMY UG Home</span>
        </button>

        <div className="mt-4 rounded-2xl border border-border-theme bg-surface p-6 shadow-xl sm:p-8">
          <div className="flex items-center justify-between">
            <BrandMark size="sm" />
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-gold-text">
              <ShieldCheck className="h-4 w-4" />
              Admin Portal
            </span>
          </div>

          {/* Official Academy Crest Emblem */}
          <div className="mt-5 flex flex-col items-center text-center rounded-2xl border border-border-subtle bg-surface-subtle px-4 py-4">
            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl bg-white p-1.5 shadow-xs ring-2 ring-[#EAB308]/60">
              <OfficialLogo className="h-full w-full" />
            </div>
            <h1 className="mt-3 font-display text-2xl font-bold text-heading">
              Administrator & Staff Sign In
            </h1>
            <p className="mt-1 text-xs text-muted">
              Access is restricted to owner-authorized administrators and assigned teachers. Public self-registration is disabled for security.
            </p>
          </div>

          {authError && (
            <div className="mt-4 rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/50 px-3.5 py-3 text-xs font-medium text-rose-700 dark:text-rose-300">
              {authError}
              {firebaseUser && (
                <button
                  type="button"
                  onClick={logout}
                  className="mt-2 block font-semibold underline hover:text-rose-900 dark:hover:text-rose-200"
                >
                  Sign out of {firebaseUser.email}
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-body">
                Authorized Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@brianacademyug.org"
                className="mt-1.5 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2.5 text-sm text-heading focus:border-accent-sky focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="mt-1.5 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2.5 text-sm text-heading focus:border-accent-sky focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || loadingProfile}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-3 text-sm font-semibold text-white hover:bg-btn-primary-hover disabled:opacity-60 transition-colors"
            >
              {(submitting || loadingProfile) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-4 w-4 text-[#D4AF37]" />
              )}
              <span>Sign In to Administrator Portal</span>
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border-theme" />
            <span className="text-xs font-medium text-faint">or</span>
            <div className="h-px flex-1 bg-border-theme" />
          </div>

          <button
            type="button"
            disabled={submitting || loadingProfile}
            onClick={handleGoogle}
            className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-border-input bg-surface-subtle px-4 py-2.5 text-sm font-semibold text-heading hover:bg-surface-muted disabled:opacity-60 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>Sign In with Authorized Google Account</span>
          </button>

          <p className="mt-5 text-center text-xs text-muted">
            Student accounts cannot authenticate into this portal.
          </p>
        </div>
      </div>
    </div>
  );
};
