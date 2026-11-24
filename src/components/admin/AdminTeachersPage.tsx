import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, UserCheck, UserX } from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  CLASS_LEVELS,
  ClassLevel,
  SUBJECTS,
  SubjectCode,
  TeacherInvite,
  TeacherProfile,
} from '../../types/academy';
import { sanitizeString } from '../../lib/validation';
import { logPlatformActivity } from '../../lib/activity';

export const AdminTeachersPage: React.FC = () => {
  const { adminProfile } = useAuth();
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [invites, setInvites] = useState<TeacherInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [staffNumber, setStaffNumber] = useState('');
  const [selectedClasses, setSelectedClasses] = useState<ClassLevel[]>(['S1', 'S2']);
  const [selectedSubjects, setSelectedSubjects] = useState<SubjectCode[]>(['MTC']);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsubT = onSnapshot(
      collection(db, 'teachers'),
      (snap) => {
        setTeachers(snap.docs.map((d) => d.data() as TeacherProfile));
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'teachers')
    );
    const unsubI = onSnapshot(
      collection(db, 'teacherInvites'),
      (snap) => {
        setInvites(snap.docs.map((d) => d.data() as TeacherInvite));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'teacherInvites')
    );
    return () => {
      unsubT();
      unsubI();
    };
  }, []);

  const toggleClass = (code: ClassLevel) => {
    setSelectedClasses((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const toggleSubject = (code: SubjectCode) => {
    setSelectedSubjects((prev) =>
      prev.includes(code) ? prev.filter((s) => s !== code) : [...prev, code]
    );
  };

  const handleInviteTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;
    setSubmitting(true);
    const path = `teacherInvites/${cleanEmail}`;
    try {
      await setDoc(doc(db, 'teacherInvites', cleanEmail), {
        email: cleanEmail,
        fullName: sanitizeString(fullName, 120),
        staffNumber: sanitizeString(staffNumber || 'TCH-UG', 40),
        classes: selectedClasses,
        subjects: selectedSubjects,
        active: true,
        createdBy: adminProfile.uid,
        createdAt: serverTimestamp(),
      });
      await logPlatformActivity({
        actorId: adminProfile.uid,
        actorName: adminProfile.fullName,
        actorRole: 'admin',
        action: 'Authorized Teacher',
        details: `${fullName} (${cleanEmail}) -> ${selectedClasses.join(', ')}`,
      });
      setEmail('');
      setFullName('');
      setStaffNumber('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleTeacherStatus = async (t: TeacherProfile) => {
    const nextStatus = t.status === 'active' ? 'suspended' : 'active';
    try {
      await updateDoc(doc(db, 'teachers', t.uid), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `teachers/${t.uid}`);
    }
  };

  const handleRevokeInvite = async (inviteEmail: string) => {
    try {
      await deleteDoc(doc(db, 'teacherInvites', inviteEmail));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `teacherInvites/${inviteEmail}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-heading">Manage Teachers</h1>
        <p className="mt-1 text-sm text-body">
          Authorize teachers by email and assign them to S1–S6 classes and Ugandan STEM subjects. Authorized teachers sign in via the Administrator & Staff Portal.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Authorize Teacher Form */}
        <form
          onSubmit={handleInviteTeacher}
          className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4 lg:col-span-5"
        >
          <h2 className="font-display text-lg font-bold text-heading">
            Authorize & Assign Teacher
          </h2>

          <div>
            <label className="block text-xs font-semibold text-body">Teacher Full Name</label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={120}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Okello Moses"
              className="mt-1.5 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2.5 text-sm focus:border-accent-sky focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-body">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@brianacademyug.org"
                className="mt-1.5 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2.5 text-sm focus:border-accent-sky focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-body">Staff Number</label>
              <input
                type="text"
                required
                value={staffNumber}
                onChange={(e) => setStaffNumber(e.target.value)}
                placeholder="TCH-2026-01"
                className="mt-1.5 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2.5 font-mono text-sm focus:border-accent-sky focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-body mb-2">
              Assign Classes
            </label>
            <div className="flex flex-wrap gap-2">
              {CLASS_LEVELS.map((c) => {
                const active = selectedClasses.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleClass(c.code)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? 'border-btn-primary bg-btn-primary text-white'
                        : 'border-border-theme bg-surface text-body hover:bg-surface-muted'
                    }`}
                  >
                    {c.code}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-body mb-2">
              Assign Subjects
            </label>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map((s) => {
                const active = selectedSubjects.includes(s.code);
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => toggleSubject(s.code)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-border-theme bg-surface text-body hover:bg-surface-muted'
                    }`}
                  >
                    {s.code}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-btn-primary-hover disabled:opacity-60 transition-colors"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span>Authorize Teacher</span>
          </button>
        </form>

        {/* Active Teachers & Pending Invites */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs">
            <h2 className="font-display text-base font-bold text-heading">Active & Registered Teachers</h2>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-accent-sky" />
              </div>
            ) : teachers.length === 0 ? (
              <p className="mt-3 text-xs text-muted">
                No teachers have activated their accounts yet.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-border-subtle">
                {teachers.map((t) => (
                  <div key={t.uid} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-heading">
                        {t.fullName} · <span className="font-mono text-xs">{t.staffNumber}</span>
                      </div>
                      <div className="text-xs text-muted">{t.email}</div>
                      <div className="mt-1 text-xs text-accent-sky-text font-medium">
                        Classes: {t.classes.join(', ')} · Subjects: {t.subjects.join(', ')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleTeacherStatus(t)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                        t.status === 'active'
                          ? 'border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {t.status === 'active' ? (
                        <>
                          <UserX className="h-3.5 w-3.5" />
                          <span>Suspend</span>
                        </>
                      ) : (
                        <>
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>Activate</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs">
            <h2 className="font-display text-base font-bold text-heading">
              Authorized Teacher Invitations
            </h2>
            {invites.length === 0 ? (
              <p className="mt-3 text-xs text-muted">No pending teacher invitations.</p>
            ) : (
              <div className="mt-3 divide-y divide-border-subtle">
                {invites.map((inv) => (
                  <div key={inv.email} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-heading">
                        {inv.fullName} ({inv.email})
                      </div>
                      <div className="text-xs text-muted">
                        {inv.classes.join(', ')} · {inv.subjects.join(', ')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevokeInvite(inv.email)}
                      className="rounded-lg p-1.5 text-faint hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 dark:hover:text-rose-400"
                      aria-label="Revoke invitation"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
