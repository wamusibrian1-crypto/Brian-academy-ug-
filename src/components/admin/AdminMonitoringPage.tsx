import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  FileText,
  FolderOpen,
  GraduationCap,
  Loader2,
  Users,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  ActivityLog,
  Assessment,
  AssessmentSubmission,
  CLASS_LEVELS,
  computeUgandanGrade,
  StudentProfile,
  StudyMaterial,
  SUBJECTS,
  TeacherProfile,
} from '../../types/academy';
import { formatTimestamp } from '../../lib/validation';
import {
  formatDeadlineDisplay,
  getStatusBadgeClasses,
  getSubmissionDisplayStatus,
  wasSubmittedLate,
} from '../../lib/deadlineUtils';

export const AdminMonitoringPage: React.FC = () => {
  const { role, academicSettings } = useAuth();
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [submissions, setSubmissions] = useState<AssessmentSubmission[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewTab, setViewTab] = useState<
    'overview' | 'materials' | 'assignments' | 'submissions' | 'teachers'
  >('overview');

  useEffect(() => {
    if (role !== 'admin') return;
    const unsubs = [
      onSnapshot(
        collection(db, 'materials'),
        (snap) => {
          setMaterials(snap.docs.map((d) => d.data() as StudyMaterial));
          setLoading(false);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'materials')
      ),
      onSnapshot(
        collection(db, 'assessments'),
        (snap) => setAssessments(snap.docs.map((d) => d.data() as Assessment)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'assessments')
      ),
      onSnapshot(
        collection(db, 'teachers'),
        (snap) => setTeachers(snap.docs.map((d) => d.data() as TeacherProfile)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'teachers')
      ),
      onSnapshot(
        collection(db, 'students'),
        (snap) => setStudents(snap.docs.map((d) => d.data() as StudentProfile)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'students')
      ),
      onSnapshot(
        collection(db, 'submissions'),
        (snap) => setSubmissions(snap.docs.map((d) => d.data() as AssessmentSubmission)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'submissions')
      ),
      onSnapshot(
        collection(db, 'activityLogs'),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as ActivityLog);
          list.sort((a, b) => {
            const ta = (a.createdAt as { seconds?: number })?.seconds ?? 0;
            const tb = (b.createdAt as { seconds?: number })?.seconds ?? 0;
            return tb - ta;
          });
          setLogs(list.slice(0, 60));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'activityLogs')
      ),
    ];

    return () => {
      for (const u of unsubs) u();
    };
  }, [role]);

  const stats = useMemo(() => {
    const pendingMarking = submissions.filter(
      (s) => s.status === 'submitted' || s.status === 'under_review'
    ).length;
    const completedAssignments = submissions.filter(
      (s) => s.status === 'published' || s.status === 'graded'
    ).length;
    const lateSubmissions = submissions.filter((s) => {
      const asmt = assessments.find((a) => a.id === s.assessmentId);
      return asmt ? wasSubmittedLate(asmt, s) : Boolean(s.isLate);
    }).length;
    const returnedCount = submissions.filter((s) => s.status === 'returned').length;

    return {
      totalMaterials: materials.length,
      publishedMaterials: materials.filter((m) => m.published).length,
      totalAssignments: assessments.length,
      totalTeachers: teachers.length,
      activeTeachers: teachers.filter((t) => t.status === 'active').length,
      totalSubmissions: submissions.length,
      pendingMarking,
      lateSubmissions,
      completedAssignments,
      returnedCount,
      totalViews: materials.reduce((acc, m) => acc + (m.views || 0), 0),
    };
  }, [materials, assessments, teachers, submissions]);

  const subjectPerformance = useMemo(() => {
    return SUBJECTS.map((subj) => {
      const subjMaterials = materials.filter((m) => m.subject === subj.code);
      const subjAsmts = assessments.filter((a) => a.subject === subj.code);
      const subjSubs = submissions.filter((s) => s.subject === subj.code);
      const markedSubs = subjSubs.filter(
        (s) => s.status === 'published' || s.status === 'graded'
      );
      const avgPct =
        markedSubs.length > 0
          ? Math.round(
              markedSubs.reduce((acc, s) => {
                const max = s.maxMarks > 0 ? s.maxMarks : 100;
                return acc + (s.totalScore / max) * 100;
              }, 0) / markedSubs.length
            )
          : 0;
      const grade =
        markedSubs.length > 0
          ? computeUgandanGrade(avgPct, 100, academicSettings.gradeBands).grade
          : null;

      return {
        subj,
        materialCount: subjMaterials.length,
        assignmentCount: subjAsmts.length,
        submissionCount: subjSubs.length,
        markedCount: markedSubs.length,
        avgPct,
        grade,
      };
    });
  }, [materials, assessments, submissions, academicSettings.gradeBands]);

  const classPerformance = useMemo(() => {
    return CLASS_LEVELS.map((cls) => {
      const clsStudents = students.filter(
        (s) => s.classLevel === cls.code && s.status !== 'suspended'
      );
      const clsAsmts = assessments.filter((a) => a.classLevel === cls.code);
      const clsSubs = submissions.filter((s) => s.classLevel === cls.code);
      const markedSubs = clsSubs.filter(
        (s) => s.status === 'published' || s.status === 'graded'
      );
      const avgPct =
        markedSubs.length > 0
          ? Math.round(
              markedSubs.reduce((acc, s) => {
                const max = s.maxMarks > 0 ? s.maxMarks : 100;
                return acc + (s.totalScore / max) * 100;
              }, 0) / markedSubs.length
            )
          : 0;

      return {
        cls,
        studentCount: clsStudents.length,
        assignmentCount: clsAsmts.length,
        submissionCount: clsSubs.length,
        markedCount: markedSubs.length,
        avgPct,
      };
    });
  }, [students, assessments, submissions]);

  const teacherMetrics = useMemo(() => {
    return teachers.map((t) => {
      const uploaded = materials.filter((m) => m.uploadedBy === t.uid).length;
      const createdAsmts = assessments.filter((a) => a.createdBy === t.uid).length;
      const graded = submissions.filter((s) => s.gradedBy === t.uid).length;
      const recentActions = logs.filter((l) => l.actorId === t.uid).slice(0, 3);
      return {
        teacher: t,
        uploaded,
        createdAsmts,
        graded,
        recentActions,
      };
    });
  }, [teachers, materials, assessments, submissions, logs]);

  if (role !== 'admin') return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-heading">
          Administrator Academic Monitoring Center
        </h1>
        <p className="mt-1 text-sm text-muted">
          Institution-wide oversight of all uploaded materials, teacher activity, assignments, pending marking, late submissions, subject performance, and class performance.
        </p>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <div className="rounded-2xl border border-border-theme bg-surface p-4">
          <div className="text-[11px] font-medium text-muted">Uploaded Materials</div>
          <div className="mt-1 font-display text-xl font-bold text-heading tabular-nums">
            {stats.totalMaterials}
          </div>
          <div className="text-[11px] text-accent-sky-text tabular-nums">
            {stats.totalViews} views
          </div>
        </div>
        <div className="rounded-2xl border border-border-theme bg-surface p-4">
          <div className="text-[11px] font-medium text-muted">Assignments</div>
          <div className="mt-1 font-display text-xl font-bold text-heading tabular-nums">
            {stats.totalAssignments}
          </div>
          <div className="text-[11px] text-muted">Active & drafts</div>
        </div>
        <div className="rounded-2xl border border-border-theme bg-surface p-4">
          <div className="text-[11px] font-medium text-muted">Teachers</div>
          <div className="mt-1 font-display text-xl font-bold text-heading tabular-nums">
            {stats.activeTeachers} / {stats.totalTeachers}
          </div>
          <div className="text-[11px] text-muted">Active staff</div>
        </div>
        <div className="rounded-2xl border border-border-theme bg-surface p-4">
          <div className="text-[11px] font-medium text-muted">Submissions</div>
          <div className="mt-1 font-display text-xl font-bold text-accent-sky-text tabular-nums">
            {stats.totalSubmissions}
          </div>
          <div className="text-[11px] text-muted">Total received</div>
        </div>
        <div className="rounded-2xl border border-border-theme bg-surface p-4">
          <div className="text-[11px] font-medium text-muted">Pending Marking</div>
          <div className="mt-1 font-display text-xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {stats.pendingMarking}
          </div>
          <div className="text-[11px] text-muted">Awaiting grade</div>
        </div>
        <div className="rounded-2xl border border-border-theme bg-surface p-4">
          <div className="text-[11px] font-medium text-muted">Late Submissions</div>
          <div className="mt-1 font-display text-xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">
            {stats.lateSubmissions}
          </div>
          <div className="text-[11px] text-muted">Past deadline</div>
        </div>
        <div className="rounded-2xl border border-border-theme bg-surface p-4">
          <div className="text-[11px] font-medium text-muted">Completed</div>
          <div className="mt-1 font-display text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {stats.completedAssignments}
          </div>
          <div className="text-[11px] text-muted">Marked & released</div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="inline-flex flex-wrap gap-1 rounded-xl bg-surface-muted p-1">
        {(
          [
            { id: 'overview', label: 'Subject & Class Performance' },
            { id: 'teachers', label: `Teacher Activity (${teachers.length})` },
            { id: 'materials', label: `All Materials (${materials.length})` },
            { id: 'assignments', label: `All Assignments (${assessments.length})` },
            { id: 'submissions', label: `All Submissions (${submissions.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setViewTab(t.id)}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
              viewTab === t.id ? 'bg-surface text-heading shadow-xs' : 'text-muted hover:text-heading'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-accent-sky" />
        </div>
      ) : viewTab === 'overview' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Subject Performance */}
          <section className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 border-b border-border-subtle pb-3">
              <Award className="h-5 w-5 text-accent-gold" />
              <div>
                <h2 className="font-display text-base font-bold text-heading">
                  Subject Performance
                </h2>
                <p className="text-xs text-muted">
                  Average marks, uploaded libraries & submission counts across Mathematics, Physics, Chemistry & Biology
                </p>
              </div>
            </div>

            <div className="space-y-3.5">
              {subjectPerformance.map((item) => (
                <div
                  key={item.subj.code}
                  className="rounded-xl border border-border-subtle bg-surface-subtle p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-heading">{item.subj.name}</span>
                    <span className="font-mono font-bold text-accent-sky-text tabular-nums">
                      {item.markedCount > 0 ? `${item.avgPct}% (${item.grade})` : 'No marks yet'}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#0284C7] to-[#EAB308]"
                      style={{ width: `${item.avgPct}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted tabular-nums">
                    <span>{item.materialCount} materials</span>
                    <span>{item.assignmentCount} assignments</span>
                    <span>
                      {item.submissionCount} submissions ({item.markedCount} marked)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Class Performance */}
          <section className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 border-b border-border-subtle pb-3">
              <GraduationCap className="h-5 w-5 text-accent-sky" />
              <div>
                <h2 className="font-display text-base font-bold text-heading">
                  Class Performance (S1 – S6)
                </h2>
                <p className="text-xs text-muted">
                  Class enrolment, assignment completion & marked averages per form
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {classPerformance.map((item) => (
                <div
                  key={item.cls.code}
                  className="rounded-xl border border-border-subtle bg-surface-subtle p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-heading">{item.cls.label}</span>
                    <span className="font-mono font-bold text-heading tabular-nums">
                      {item.markedCount > 0 ? `${item.avgPct}% avg` : '—'}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-[#0284C7]"
                      style={{ width: `${item.avgPct}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted tabular-nums">
                    <span>{item.studentCount} students</span>
                    <span>{item.assignmentCount} assignments</span>
                    <span>
                      {item.submissionCount} submitted · {item.markedCount} marked
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : viewTab === 'teachers' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <h2 className="font-display text-base font-bold text-heading">
              Teachers Activity Overview
            </h2>
            {teacherMetrics.length === 0 ? (
              <div className="rounded-2xl border border-border-theme bg-surface p-6 text-xs text-muted">
                No teachers registered yet.
              </div>
            ) : (
              teacherMetrics.map(({ teacher, uploaded, createdAsmts, graded, recentActions }) => (
                <div
                  key={teacher.uid}
                  className="rounded-2xl border border-border-theme bg-surface p-5 shadow-xs space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-accent-sky" />
                        <h3 className="font-display text-base font-bold text-heading">
                          {teacher.fullName}
                        </h3>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                            teacher.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          {teacher.status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        Staff #{teacher.staffNumber} · Subjects: {teacher.subjects.join(', ') || 'All'} ·
                        Classes: {teacher.classes.join(', ') || 'All'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border border-border-subtle bg-surface-subtle p-2.5">
                      <div className="text-[10px] text-muted">Materials Uploaded</div>
                      <div className="font-display text-lg font-bold text-heading tabular-nums">
                        {uploaded}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border-subtle bg-surface-subtle p-2.5">
                      <div className="text-[10px] text-muted">Assignments Created</div>
                      <div className="font-display text-lg font-bold text-heading tabular-nums">
                        {createdAsmts}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border-subtle bg-surface-subtle p-2.5">
                      <div className="text-[10px] text-muted">Work Marked</div>
                      <div className="font-display text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {graded}
                      </div>
                    </div>
                  </div>

                  {recentActions.length > 0 && (
                    <div className="border-t border-border-subtle pt-2.5 space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                        Recent Teacher Activity
                      </div>
                      {recentActions.map((act) => (
                        <div key={act.id} className="text-xs text-body flex justify-between gap-2">
                          <span className="truncate">
                            <strong>{act.action}:</strong> {act.details}
                          </span>
                          <span className="text-[10px] text-faint shrink-0">
                            {formatTimestamp(act.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Live Platform Activity Feed */}
          <div className="rounded-2xl border border-border-theme bg-surface p-5 shadow-xs lg:col-span-5">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
              <Activity className="h-4 w-4 text-accent-gold" />
              <h2 className="font-display text-base font-bold text-heading">
                Recent Institutional Activity Log
              </h2>
            </div>
            <div className="mt-3 max-h-[540px] overflow-y-auto divide-y divide-border-subtle">
              {logs.map((log) => (
                <div key={log.id} className="py-2.5 space-y-0.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-heading">
                      {log.actorName}{' '}
                      <span className="font-normal text-muted">({log.actorRole})</span>
                    </span>
                    <span className="text-[10px] text-faint">{formatTimestamp(log.createdAt)}</span>
                  </div>
                  <div className="text-xs text-accent-sky-text font-semibold">{log.action}</div>
                  {log.details && <div className="text-[11px] text-muted">{log.details}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : viewTab === 'materials' ? (
        <div className="rounded-2xl border border-border-theme bg-surface p-5 shadow-xs overflow-x-auto">
          <div className="flex items-center gap-2 pb-3 border-b border-border-subtle">
            <FolderOpen className="h-4 w-4 text-accent-sky" />
            <h2 className="font-display text-base font-bold text-heading">
              All Uploaded Learning Materials ({materials.length})
            </h2>
          </div>
          <table className="mt-3 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border-subtle text-[11px] uppercase text-muted">
                <th className="py-2 pr-3">Title</th>
                <th className="py-2 pr-3">Subject · Class</th>
                <th className="py-2 pr-3">Format</th>
                <th className="py-2 pr-3">Uploaded By</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 text-right">Views</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {materials.map((m) => (
                <tr key={m.id}>
                  <td className="py-2.5 pr-3 font-semibold text-heading">{m.title}</td>
                  <td className="py-2.5 pr-3 text-body">
                    {m.subject} · {m.classLevel}
                  </td>
                  <td className="py-2.5 pr-3 uppercase text-muted">
                    {m.fileFormat || m.materialType}
                  </td>
                  <td className="py-2.5 pr-3 text-body">{m.uploaderName}</td>
                  <td className="py-2.5 pr-3">
                    {m.published ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                        Published
                      </span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-300 font-semibold">
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right font-mono font-bold text-heading tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3 w-3 text-accent-sky" />
                      {m.views || 0}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : viewTab === 'assignments' ? (
        <div className="rounded-2xl border border-border-theme bg-surface p-5 shadow-xs overflow-x-auto">
          <div className="flex items-center gap-2 pb-3 border-b border-border-subtle">
            <ClipboardCheck className="h-4 w-4 text-accent-sky" />
            <h2 className="font-display text-base font-bold text-heading">
              All Assignments & Tests ({assessments.length})
            </h2>
          </div>
          <table className="mt-3 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border-subtle text-[11px] uppercase text-muted">
                <th className="py-2 pr-3">Title</th>
                <th className="py-2 pr-3">Subject · Class</th>
                <th className="py-2 pr-3">Created By</th>
                <th className="py-2 pr-3">Deadline</th>
                <th className="py-2 pr-3 text-right">Submitted</th>
                <th className="py-2 text-right">Marked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {assessments.map((a) => {
                const asmtSubs = submissions.filter((s) => s.assessmentId === a.id);
                const marked = asmtSubs.filter(
                  (s) => s.status === 'published' || s.status === 'graded'
                ).length;
                return (
                  <tr key={a.id}>
                    <td className="py-2.5 pr-3 font-semibold text-heading">{a.title}</td>
                    <td className="py-2.5 pr-3 text-body">
                      {a.subject} · {a.classLevel}
                    </td>
                    <td className="py-2.5 pr-3 text-body">{a.creatorName}</td>
                    <td className="py-2.5 pr-3 text-muted">{formatDeadlineDisplay(a)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono font-bold tabular-nums">
                      {asmtSubs.length}
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {marked}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-border-theme bg-surface p-5 shadow-xs overflow-x-auto">
          <div className="flex items-center gap-2 pb-3 border-b border-border-subtle">
            <FileText className="h-4 w-4 text-accent-sky" />
            <h2 className="font-display text-base font-bold text-heading">
              All Student Submissions ({submissions.length})
            </h2>
          </div>
          <table className="mt-3 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border-subtle text-[11px] uppercase text-muted">
                <th className="py-2 pr-3">Student</th>
                <th className="py-2 pr-3">Class · Subject</th>
                <th className="py-2 pr-3">Assignment</th>
                <th className="py-2 pr-3">Submitted At</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 text-right">Marks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {submissions.map((s) => {
                const asmt = assessments.find((a) => a.id === s.assessmentId);
                const status = asmt
                  ? getSubmissionDisplayStatus(asmt, s)
                  : s.status === 'published'
                    ? 'Marked'
                    : s.status === 'returned'
                      ? 'Returned for Correction'
                      : 'Submitted';
                return (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-3 font-semibold text-heading">{s.studentName}</td>
                    <td className="py-2.5 pr-3 text-body">
                      {s.classLevel} · {s.subject}
                    </td>
                    <td className="py-2.5 pr-3 text-heading">{s.assessmentTitle}</td>
                    <td className="py-2.5 pr-3 text-muted">{formatTimestamp(s.submittedAt)}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`inline-flex rounded-lg border px-2 py-0.5 text-[10px] font-bold ${getStatusBadgeClasses(
                          status
                        )}`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-heading tabular-nums">
                      {status === 'Marked'
                        ? `${s.totalScore}/${s.maxMarks} (${s.grade})`
                        : `— / ${s.maxMarks}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
