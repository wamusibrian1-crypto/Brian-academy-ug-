import React, { useEffect, useState } from 'react';
import { Award, Check, Download, Eye, EyeOff, FileCheck2, KeyRound, Loader2, LogOut, Mail, Save, User } from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { CLASS_LEVELS, ClassLevel, ReportCard } from '../../types/academy';
import { sanitizeString } from '../../lib/validation';
import { generateOfficialCertificatePdf, generateReportCardPdf } from '../../lib/reportCardPdf';
import { ThemeToggle } from '../ThemeToggle';
import { OfficialLogo } from '../BrandMark';

export const StudentProfileView: React.FC = () => {
  const { studentProfile, academicSettings, setStudentPassword, sendStudentPasswordReset, logout } = useAuth();
  const [fullName, setFullName] = useState(studentProfile?.fullName || '');
  const [classLevel, setClassLevel] = useState<ClassLevel>(studentProfile?.classLevel || 'S1');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!studentProfile) return;
    const q = query(
      collection(db, 'reportCards'),
      where('studentId', '==', studentProfile.uid),
      where('published', '==', true)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setReportCards(snap.docs.map((d) => d.data() as ReportCard)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'reportCards')
    );
    return () => unsub();
  }, [studentProfile]);

  if (!studentProfile) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(false);
    const path = `students/${studentProfile.uid}`;
    try {
      await updateDoc(doc(db, 'students', studentProfile.uid), {
        fullName: sanitizeString(fullName, 120),
        classLevel,
        updatedAt: serverTimestamp(),
      });
      setSavedMsg(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0B1F3A] text-white">
            <User className="h-7 w-7 text-[#D4AF37]" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-heading">
              {studentProfile.fullName}
            </h1>
            <p className="text-xs text-muted">
              {studentProfile.email} · {studentProfile.classLevel}
            </p>
            <p className="mt-1 text-xs font-medium text-accent-sky-text">
              Account Status: {studentProfile.status === 'approved' ? 'Approved Student' : 'Pending Approval'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="mt-6 space-y-4 border-t border-border-subtle pt-5">
          <div>
            <label className="block text-xs font-semibold text-body">Full Name</label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={120}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
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

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-btn-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-btn-primary-hover disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>Save Profile</span>
            </button>
            {savedMsg && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                Profile updated
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Display & Dark Mode Settings */}
      <ThemeToggle />

      {/* Email & Password Login Security */}
      <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5">
          <KeyRound className="h-5 w-5 text-accent-sky" />
          <div>
            <h2 className="font-display text-base font-bold text-heading">
              Email Login & Password
            </h2>
            <p className="text-xs text-muted">
              Create or update a password for <strong className="text-heading">{studentProfile.email}</strong> so you can sign in anytime using your email and password.
            </p>
          </div>
        </div>

        {pwdError && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300">
            {pwdError}
          </div>
        )}
        {pwdSuccess && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/50 px-3.5 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {pwdSuccess}
          </div>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setPwdError(null);
            setPwdSuccess(null);
            if (newPassword.length < 6) {
              setPwdError('Password must be at least 6 characters long.');
              return;
            }
            if (newPassword !== confirmNewPassword) {
              setPwdError('Passwords do not match.');
              return;
            }
            setSavingPwd(true);
            try {
              await setStudentPassword(newPassword);
              setNewPassword('');
              setConfirmNewPassword('');
              setPwdSuccess('Your password has been saved! You can now sign in with your email and password.');
            } catch (err) {
              setPwdError(err instanceof Error ? err.message : 'Unable to update password.');
            } finally {
              setSavingPwd(false);
            }
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <div>
            <label className="block text-xs font-semibold text-body">New Password</label>
            <div className="relative mt-1">
              <input
                type={showPwd ? 'text' : 'password'}
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 pr-10 text-sm text-heading focus:border-accent-sky focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPwd((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-faint hover:text-heading"
                aria-label={showPwd ? 'Hide password' : 'Show password'}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-body">Confirm Password</label>
            <input
              type={showPwd ? 'text' : 'password'}
              required
              minLength={6}
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="Re-enter password"
              className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading focus:border-accent-sky focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={savingPwd}
              className="inline-flex items-center gap-2 rounded-xl bg-btn-primary px-4 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover disabled:opacity-60"
            >
              {savingPwd ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5 text-accent-gold" />}
              <span>Save Password</span>
            </button>
            <button
              type="button"
              disabled={savingPwd}
              onClick={async () => {
                setPwdError(null);
                setPwdSuccess(null);
                setSavingPwd(true);
                try {
                  await sendStudentPasswordReset(studentProfile.email);
                  setPwdSuccess(`Password setup/reset email sent to ${studentProfile.email}.`);
                } catch (err) {
                  setPwdError(err instanceof Error ? err.message : 'Unable to send reset email.');
                } finally {
                  setSavingPwd(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border-input bg-surface-subtle px-3.5 py-2 text-xs font-semibold text-body hover:bg-surface-muted disabled:opacity-60"
            >
              <Mail className="h-3.5 w-3.5 text-accent-sky" />
              <span>Email Password Setup Link</span>
            </button>
          </div>
        </form>
      </div>

      {/* Official Academic Documents: Certificates & Report Cards */}
      <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 rounded-xl bg-white p-1 shadow-xs ring-1 ring-[#EAB308]/50">
              <OfficialLogo className="h-full w-full" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-heading">
                Certificates & Official Academic Report Cards (PDF)
              </h2>
              <p className="text-xs text-muted">
                Download official BRIAN ACADEMY UG certificates and term report cards.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              void generateOfficialCertificatePdf({
                studentName: studentProfile.fullName,
                classLevel: studentProfile.classLevel,
                settings: academicSettings,
                overallAverage: reportCards[0]?.overallAverage,
                termLabel: `${academicSettings.termName} ${academicSettings.academicYear}`,
              })
            }
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#EAB308] px-3.5 py-2 text-xs font-bold text-[#0B1F3A] hover:bg-[#FACC15]"
          >
            <Award className="h-3.5 w-3.5" />
            <span>Official Certificate PDF</span>
          </button>
        </div>

        {reportCards.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-theme p-4 text-center text-xs text-muted">
            No report cards have been published for your account yet.
          </p>
        ) : (
          <div className="space-y-3">
            {reportCards.map((rc) => (
              <div
                key={rc.id}
                className="rounded-xl border border-border-theme bg-surface-subtle p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <FileCheck2 className="h-4 w-4 text-accent-sky-text shrink-0" />
                    <div>
                      <div className="font-display text-sm font-bold text-heading">
                        {rc.term} {rc.academicYear} · {rc.classLevel}
                      </div>
                      <div className="text-xs text-muted tabular-nums">
                        Overall Average: <strong className="text-heading">{rc.overallAverage}%</strong> · Conduct: {rc.conduct}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void generateReportCardPdf(rc, academicSettings)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-btn-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover"
                  >
                    <Download className="h-3.5 w-3.5 text-[#FACC15]" />
                    <span>Download PDF</span>
                  </button>
                </div>
                {rc.teacherRemark && (
                  <p className="text-xs text-body">
                    <strong className="text-heading">Teacher Remark:</strong> {rc.teacherRemark}
                  </p>
                )}
                {rc.headTeacherRemark && (
                  <p className="text-xs text-body">
                    <strong className="text-heading">Head Teacher Remark:</strong> {rc.headTeacherRemark}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border-theme bg-surface p-5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-heading">Session Control</h2>
          <p className="text-xs text-muted">Sign out securely from BRIAN ACADEMY UG.</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-2 rounded-xl border border-border-input bg-surface-subtle px-4 py-2 text-xs font-semibold text-body hover:bg-surface-muted"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};
