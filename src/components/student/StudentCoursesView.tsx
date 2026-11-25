import React, { useEffect, useState } from 'react';
import { BarChart3, BookOpen, CheckCircle2, Loader2, MessageSquare } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  Assessment,
  AssessmentSubmission,
  computeUgandanGrade,
  Course,
  SUBJECTS,
} from '../../types/academy';
import { StudentFeature } from './StudentShell';

interface StudentCoursesViewProps {
  onOpenFeature: (feature: Exclude<StudentFeature, null>) => void;
}

export const StudentCoursesView: React.FC<StudentCoursesViewProps> = ({ onOpenFeature }) => {
  const { studentProfile, academicSettings } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [submissions, setSubmissions] = useState<AssessmentSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentProfile) return;
    const qCourses = query(
      collection(db, 'courses'),
      where('classLevel', '==', studentProfile.classLevel),
      where('active', '==', true)
    );
    const unsubCourses = onSnapshot(
      qCourses,
      (snap) => {
        setCourses(snap.docs.map((d) => d.data() as Course));
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'courses')
    );

    const qAssess = query(
      collection(db, 'assessments'),
      where('classLevel', '==', studentProfile.classLevel),
      where('published', '==', true)
    );
    const unsubAssess = onSnapshot(
      qAssess,
      (snap) => setAssessments(snap.docs.map((d) => d.data() as Assessment)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'assessments')
    );

    const qSubs = query(
      collection(db, 'submissions'),
      where('studentId', '==', studentProfile.uid)
    );
    const unsubSubs = onSnapshot(
      qSubs,
      (snap) => setSubmissions(snap.docs.map((d) => d.data() as AssessmentSubmission)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'submissions')
    );

    return () => {
      unsubCourses();
      unsubAssess();
      unsubSubs();
    };
  }, [studentProfile]);

  if (!studentProfile) return null;

  const subjectProgress = SUBJECTS.map((subj) => {
    const totalTasks = assessments.filter((a) => a.subject === subj.code).length;
    const doneTasks = submissions.filter((s) => s.subject === subj.code).length;
    const gradedSubs = submissions.filter(
      (s) => s.subject === subj.code && s.status === 'published'
    );
    const avgPct =
      gradedSubs.length > 0
        ? Math.round(
            gradedSubs.reduce((acc, s) => {
              const max = s.maxMarks > 0 ? s.maxMarks : 100;
              return acc + (s.totalScore / max) * 100;
            }, 0) / gradedSubs.length
          )
        : 0;
    const gradeInfo =
      gradedSubs.length > 0
        ? computeUgandanGrade(avgPct, 100, academicSettings.gradeBands)
        : null;
    const completionPct =
      totalTasks > 0 ? Math.min(100, Math.round((doneTasks / totalTasks) * 100)) : 0;

    return {
      subj,
      totalTasks,
      doneTasks,
      gradedCount: gradedSubs.length,
      avgPct,
      completionPct,
      grade: gradeInfo?.grade || null,
    };
  });

  const gradedSubjects = subjectProgress.filter((s) => s.gradedCount > 0);
  const overallAvg =
    gradedSubjects.length > 0
      ? Math.round(
          gradedSubjects.reduce((acc, s) => acc + s.avgPct, 0) / gradedSubjects.length
        )
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-heading">
          My Courses & Progress · {studentProfile.classLevel}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Your Ugandan secondary subjects, academic progress chart, and syllabus modules for{' '}
          {studentProfile.classLevel}.
        </p>
      </div>

      {/* Academic Progress Chart */}
      <section className="rounded-2xl border border-border-theme bg-surface p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-sky-soft text-accent-sky-text">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-heading">
                Subject Progress Chart
              </h2>
              <p className="text-xs text-muted">
                Performance and completed tests/homework across MTC, Physics, Chemistry & Biology
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onOpenFeature('homework')}
              className="rounded-xl border border-border-theme bg-surface-subtle px-3 py-1.5 text-xs font-semibold text-accent-sky-text hover:bg-accent-sky-soft transition-colors"
            >
              My Assignments & Results
            </button>
            <div className="text-right">
              <div className="text-[11px] font-medium text-muted">Overall Average</div>
              <div className="font-display text-xl font-bold text-heading tabular-nums">
                {gradedSubjects.length > 0 ? `${overallAvg}%` : '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {subjectProgress.map((item) => (
            <div
              key={item.subj.code}
              className="rounded-xl border border-border-subtle bg-surface-subtle p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-heading">{item.subj.name}</span>
                <span className="font-mono font-bold text-accent-sky-text tabular-nums">
                  {item.gradedCount > 0 ? `${item.avgPct}% (${item.grade})` : 'Not graded'}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0B1F3A] to-sky-500 dark:from-sky-600 dark:to-amber-400 transition-all duration-500"
                  style={{
                    width: `${item.gradedCount > 0 ? item.avgPct : item.completionPct}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted tabular-nums">
                <span>
                  Completed: {item.doneTasks}/{item.totalTasks} tasks
                </span>
                <button
                  type="button"
                  onClick={() => onOpenFeature('chat')}
                  className="font-semibold text-accent-sky-text hover:underline"
                >
                  Progress Chat
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-14">
          <Loader2 className="h-6 w-6 animate-spin text-accent-sky" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {SUBJECTS.map((subj) => {
            const matched = courses.find((c) => c.subject === subj.code);
            const topics = matched?.topics || [
              'Core Foundation Concepts',
              'Worked Examples & Problem Solving',
              'Practical Applications & Revision',
            ];
            return (
              <div
                key={subj.code}
                className="flex flex-col justify-between rounded-2xl border border-border-theme bg-surface p-5 shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-accent-sky-text">
                      {studentProfile.classLevel} · {subj.code}
                    </span>
                    <span className="text-xs text-muted">
                      {matched?.teacherName ? `Teacher: ${matched.teacherName}` : 'Core Subject'}
                    </span>
                  </div>
                  <h2 className="mt-2 font-display text-lg font-bold text-heading">
                    {matched?.title || `${studentProfile.classLevel} — ${subj.name}`}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {matched?.description || subj.shortDesc}
                  </p>

                  <div className="mt-4 space-y-1.5 border-t border-border-subtle pt-3">
                    {topics.slice(0, 4).map((t, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-body">
                        <CheckCircle2 className="h-3.5 w-3.5 text-accent-sky shrink-0" />
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenFeature('study-material')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-btn-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Open Materials</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenFeature('live-class')}
                    className="rounded-xl border border-border-theme bg-surface-subtle px-3.5 py-2 text-xs font-semibold text-heading hover:bg-surface-muted"
                  >
                    Live Classes
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenFeature('chat')}
                    className="inline-flex items-center gap-1 rounded-xl border border-border-theme bg-surface-subtle px-3 py-2 text-xs font-semibold text-accent-sky-text hover:bg-accent-sky-soft"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Chat</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
