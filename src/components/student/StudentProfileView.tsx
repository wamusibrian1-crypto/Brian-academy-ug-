import React, { useEffect, useState } from 'react';
import { Check, Download, FileCheck2, Loader2, LogOut, Save, User } from 'lucide-react';
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
import { generateReportCardPdf } from '../../lib/reportCardPdf';
import { ThemeToggle } from '../ThemeToggle';

export const StudentProfileView: React.FC = () => {
  const { studentProfile, academicSettings, logout } = useAuth();
  const [fullName, setFullName] = useState(studentProfile?.fullName || '');
  const [classLevel, setClassLevel] = useState<ClassLevel>(studentProfile?.classLevel || 'S1');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);

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

      {/* Published Official Report Cards (PDF Download) */}
      <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5">
          <FileCheck2 className="h-5 w-5 text-heading" />
          <div>
            <h2 className="font-display text-base font-bold text-heading">
              Published Academic Report Cards (PDF)
            </h2>
            <p className="text-xs text-muted">
              Download official term report cards prepared by your teachers and administration.
            </p>
          </div>
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
                  <div>
                    <div className="font-display text-sm font-bold text-heading">
                      {rc.term} {rc.academicYear} · {rc.classLevel}
                    </div>
                    <div className="text-xs text-muted tabular-nums">
                      Overall Average: <strong className="text-heading">{rc.overallAverage}%</strong> · Conduct: {rc.conduct}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => generateReportCardPdf(rc, academicSettings)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-btn-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover"
                  >
                    <Download className="h-3.5 w-3.5 text-[#D4AF37]" />
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
