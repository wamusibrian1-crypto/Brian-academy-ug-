import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Search, ShieldAlert, UserCheck, UserX } from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { CLASS_LEVELS, ClassLevel, StudentProfile } from '../../types/academy';
import { logPlatformActivity } from '../../lib/activity';

export const AdminStudentsPage: React.FC = () => {
  const { adminProfile } = useAuth();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState<'ALL' | ClassLevel>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | StudentProfile['status']>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'students'),
      (snap) => {
        setStudents(snap.docs.map((d) => d.data() as StudentProfile));
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'students')
    );
    return () => unsub();
  }, []);

  const updateStudentStatus = async (
    stu: StudentProfile,
    newStatus: StudentProfile['status']
  ) => {
    if (!adminProfile) return;
    setUpdatingId(stu.uid);
    const path = `students/${stu.uid}`;
    try {
      await updateDoc(doc(db, 'students', stu.uid), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      await logPlatformActivity({
        actorId: adminProfile.uid,
        actorName: adminProfile.fullName,
        actorRole: 'admin',
        action: `Student Status -> ${newStatus}`,
        details: `${stu.fullName} (${stu.classLevel})`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setUpdatingId(null);
    }
  };

  const updateStudentClass = async (stu: StudentProfile, newClass: ClassLevel) => {
    if (!adminProfile) return;
    setUpdatingId(stu.uid);
    const path = `students/${stu.uid}`;
    try {
      await updateDoc(doc(db, 'students', stu.uid), {
        classLevel: newClass,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = students.filter((s) => {
    if (classFilter !== 'ALL' && s.classLevel !== classFilter) return false;
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-heading">Manage Students</h1>
        <p className="mt-1 text-sm text-body">
          Approve student registrations, assign classes (S1–S6), and suspend or reactivate accounts.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by student name or email..."
            className="w-full rounded-xl border border-border-input bg-input-bg text-heading py-2.5 pl-9 pr-3.5 text-sm focus:border-accent-sky focus:outline-none"
          />
        </div>

        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value as 'ALL' | ClassLevel)}
          className="rounded-xl border border-border-input bg-input-bg px-3.5 py-2.5 text-xs font-semibold text-heading focus:border-accent-sky focus:outline-none"
        >
          <option value="ALL">All Classes</option>
          {CLASS_LEVELS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | StudentProfile['status'])}
          className="rounded-xl border border-border-input bg-input-bg px-3.5 py-2.5 text-xs font-semibold text-heading focus:border-accent-sky focus:outline-none"
        >
          <option value="ALL">All Statuses</option>
          <option value="pending">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Students Table */}
      <div className="rounded-2xl border border-border-theme bg-surface overflow-hidden shadow-xs">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-accent-sky" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">
            No student accounts match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border-subtle bg-surface-subtle text-xs font-semibold text-body">
                <tr>
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-5 py-3.5">Class</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filtered.map((stu) => (
                  <tr key={stu.uid} className="hover:bg-surface-subtle transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-heading">{stu.fullName}</div>
                      <div className="text-xs text-muted">{stu.email}</div>
                    </td>
                    <td className="px-5 py-4">
                      <select
                        value={stu.classLevel}
                        disabled={updatingId === stu.uid}
                        onChange={(e) => updateStudentClass(stu, e.target.value as ClassLevel)}
                        className="rounded-lg border border-border-input bg-input-bg px-2.5 py-1 text-xs font-semibold text-heading"
                      >
                        {CLASS_LEVELS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                          stu.status === 'approved'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : stu.status === 'suspended'
                              ? 'text-rose-700 dark:text-rose-400'
                              : 'text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {stu.status === 'approved' && <CheckCircle2 className="h-3.5 w-3.5" />}
                        {stu.status === 'suspended' && <ShieldAlert className="h-3.5 w-3.5" />}
                        {stu.status === 'approved'
                          ? 'Approved'
                          : stu.status === 'suspended'
                            ? 'Suspended'
                            : 'Pending'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        {stu.status !== 'approved' && (
                          <button
                            type="button"
                            disabled={updatingId === stu.uid}
                            onClick={() => updateStudentStatus(stu, 'approved')}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>Approve</span>
                          </button>
                        )}
                        {stu.status !== 'suspended' ? (
                          <button
                            type="button"
                            disabled={updatingId === stu.uid}
                            onClick={() => updateStudentStatus(stu, 'suspended')}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/50 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-50"
                          >
                            <UserX className="h-3.5 w-3.5" />
                            <span>Suspend</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={updatingId === stu.uid}
                            onClick={() => updateStudentStatus(stu, 'approved')}
                            className="inline-flex items-center gap-1 rounded-lg border border-border-theme bg-surface px-3 py-1.5 text-xs font-semibold text-heading hover:bg-surface-muted"
                          >
                            <span>Reactivate</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
