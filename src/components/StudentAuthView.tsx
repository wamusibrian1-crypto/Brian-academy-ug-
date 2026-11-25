import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Loader2,
  Mail,
} from 'lucide-react';
import { BrandMark, OfficialLogo } from './BrandMark';
import { CLASS_LEVELS, ClassLevel } from '../types/academy';
import { useAuth } from '../context/AuthContext';

export const StudentAuthView: React.FC = () => {
  const {
    firebaseUser,
    loadingProfile,
    needsStudentOnboarding,
    authError,
    clearAuthError,
    setPortalIntent,
    registerStudentWithEmail,
    loginWithEmail,
    loginWithGoogle,
    completeStudentOnboarding,
    sendStudentPasswordReset,
    logout,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [classLevel, setClassLevel] = useState<ClassLevel>('S1');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);

  const switchMode = (next: 'login' | 'register' | 'reset') => {
    setMode(next);
    clearAuthError();
    setLocalError(null);
    setInfoNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    setLocalError(null);
    setInfoNotice(null);

    if (mode === 'register') {
      if (password.length < 6) {
        setLocalError('Please create a password with at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match. Please re-enter the same password.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'register') {
        await registerStudentWithEmail({
          fullName,
          email,
          password,
          classLevel,
        });
      } else if (mode === 'reset') {
        await sendStudentPasswordReset(email);
        setInfoNotice(
          `Password reset / setup instructions have been sent to ${email.trim()}. Check your inbox and spam folder.`
        );
      } else {
        await loginWithEmail(email, password, 'student');
      }
    } catch {
      // handled in AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    setSubmitting(true);
    try {
      await completeStudentOnboarding({
        fullName: fullName || firebaseUser?.displayName || 'Student',
        classLevel,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    clearAuthError();
    setLocalError(null);
    setInfoNotice(null);
    setSubmitting(true);
    try {
      await loginWithGoogle('student');
    } catch {
      // handled in AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  // Student Onboarding if signed in via Google or new account without profile doc yet
  if (firebaseUser && needsStudentOnboarding) {
    return (
      <div className="min-h-screen bg-canvas px-4 py-10 flex flex-col items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-border-theme bg-surface p-7 shadow-xs">
          <div className="flex flex-col items-center text-center border-b border-border-subtle pb-5">
            <div className="h-24 w-24 rounded-2xl bg-white p-1.5 shadow-xs ring-2 ring-[#EAB308]/50">
              <OfficialLogo className="h-full w-full" />
            </div>
            <h1 className="mt-4 font-display text-xl font-bold text-heading">
              Complete Student Registration
            </h1>
            <p className="mt-1 text-xs font-semibold text-accent-sky-text tracking-wider uppercase">
              BRIAN ACADEMY UG · LEARN. DISCOVER. EXCEL.
            </p>
          </div>
          <p className="mt-4 text-sm text-muted">
            Signed in as <strong className="text-heading">{firebaseUser.email}</strong>. Enter your name and class to activate your Student Dashboard.
          </p>

          <form onSubmit={handleOnboarding} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-body">Full Name</label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={fullName || firebaseUser.displayName || ''}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Namukasa Sarah"
                className="mt-1.5 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2.5 text-sm text-heading focus:border-accent-sky focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">Class</label>
              <select
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value as ClassLevel)}
                className="mt-1.5 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2.5 text-sm text-heading focus:border-accent-sky focus:outline-none"
              >
                {CLASS_LEVELS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {authError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || loadingProfile}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-3 text-sm font-semibold text-white hover:bg-btn-primary-hover disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>Complete Registration</span>
            </button>

            <button
              type="button"
              onClick={logout}
              className="w-full py-2 text-xs font-medium text-muted hover:text-heading"
            >
              Cancel and sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  const displayedError = localError || authError;

  return (
    <div className="min-h-screen bg-canvas px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-md">
        <button
          type="button"
          onClick={() => setPortalIntent('landing')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-heading"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to BRIAN ACADEMY UG Home</span>
        </button>

        <div className="mt-4 rounded-2xl border border-border-theme bg-surface p-6 shadow-xs sm:p-8">
          <div className="flex items-center justify-between">
            <BrandMark size="sm" />
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-sky-text">
              <GraduationCap className="h-4 w-4" />
              Student Portal
            </span>
          </div>

          {/* Official Academy Crest Emblem */}
          <div className="mt-5 flex flex-col items-center text-center rounded-2xl border border-border-subtle bg-surface-subtle px-4 py-4">
            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl bg-white p-1.5 shadow-xs ring-2 ring-[#EAB308]/50">
              <OfficialLogo className="h-full w-full" />
            </div>
            <h1 className="mt-3 font-display text-2xl font-bold text-heading">
              {mode === 'login'
                ? 'Student Sign In'
                : mode === 'register'
                  ? 'Create Student Account'
                  : 'Reset Password'}
            </h1>
            <p className="mt-1 text-xs text-muted">
              {mode === 'login'
                ? 'Sign in with your email and password or Google account.'
                : mode === 'register'
                  ? 'Sign up with your email and create your own password (S1–S6).'
                  : 'Enter your email address to receive a password reset link.'}
            </p>
          </div>

          {/* Segmented Control: Login vs Create Account */}
          <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`rounded-lg py-2 text-xs font-semibold transition-colors ${
                mode === 'login' || mode === 'reset'
                  ? 'bg-surface text-heading shadow-xs'
                  : 'text-muted hover:text-heading'
              }`}
            >
              Student Login
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`rounded-lg py-2 text-xs font-semibold transition-colors ${
                mode === 'register'
                  ? 'bg-surface text-heading shadow-xs'
                  : 'text-muted hover:text-heading'
              }`}
            >
              Create Account
            </button>
          </div>

          {infoNotice && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/50 px-3.5 py-3 text-xs font-medium text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{infoNotice}</span>
            </div>
          )}

          {displayedError && (
            <div className="mt-4 rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/50 px-3.5 py-3 text-xs font-medium text-rose-700 dark:text-rose-300">
              {displayedError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-body">Full Name</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Kato Emmanuel"
                  className="mt-1.5 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2.5 text-sm text-heading focus:border-accent-sky focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-body">Email Address</label>
              <input
                type="email"
                required
                maxLength={200}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                className="mt-1.5 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2.5 text-sm text-heading focus:border-accent-sky focus:outline-none"
              />
            </div>

            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-body">
                    {mode === 'register' ? 'Create Password' : 'Password'}
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('reset')}
                      className="text-[11px] font-semibold text-accent-sky-text hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2.5 pr-10 text-sm text-heading focus:border-accent-sky focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-faint hover:text-heading"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-body">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="mt-1.5 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2.5 text-sm text-heading focus:border-accent-sky focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-body">Class</label>
                  <select
                    value={classLevel}
                    onChange={(e) => setClassLevel(e.target.value as ClassLevel)}
                    className="mt-1.5 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2.5 text-sm text-heading focus:border-accent-sky focus:outline-none"
                  >
                    {CLASS_LEVELS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={submitting || loadingProfile}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-3 text-sm font-semibold text-white hover:bg-btn-primary-hover disabled:opacity-60 transition-colors"
            >
              {(submitting || loadingProfile) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === 'reset' ? (
                <Mail className="h-4 w-4" />
              ) : mode === 'register' ? (
                <KeyRound className="h-4 w-4 text-accent-gold" />
              ) : null}
              <span>
                {mode === 'login'
                  ? 'Sign In with Email & Password'
                  : mode === 'register'
                    ? 'Create Account & Enter Portal'
                    : 'Send Password Reset Email'}
              </span>
            </button>

            {mode === 'reset' && (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full py-1.5 text-xs font-semibold text-accent-sky-text hover:underline"
              >
                Back to Student Sign In
              </button>
            )}
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
            <span>Continue with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
};
