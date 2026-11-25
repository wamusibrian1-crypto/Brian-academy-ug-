import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  FileText,
  FileUp,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  Assessment,
  AssessmentKind,
  AssessmentSubmission,
  StudentAnswer,
} from '../../types/academy';
import { formatTimestamp, sanitizeSafeUrl } from '../../lib/validation';
import {
  canStudentSubmitNow,
  formatDeadlineDisplay,
  getStatusBadgeClasses,
  getSubmissionDisplayStatus,
  isAssessmentOverdue,
} from '../../lib/deadlineUtils';
import { ResolvedFileLink, ResolvedImage } from '../ResolvedFileView';
import { SubmitAnswersSection } from './SubmitAnswersSection';
import { MyAssignmentsResultsView } from './MyAssignmentsResultsView';

interface StudentAssessmentsPageProps {
  kind: AssessmentKind;
  onBack: () => void;
}

export const StudentAssessmentsPage: React.FC<StudentAssessmentsPageProps> = ({
  kind,
  onBack,
}) => {
  const { studentProfile } = useAuth();
  const [allClassAssessments, setAllClassAssessments] = useState<Assessment[]>([]);
  const [allStudentSubmissions, setAllStudentSubmissions] = useState<AssessmentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'assigned' | 'results'>('assigned');
  const [activeAssessment, setActiveAssessment] = useState<Assessment | null>(null);
  const [answersMap, setAnswersMap] = useState<Record<string, StudentAnswer>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (!studentProfile) return;

    const qAssess = query(
      collection(db, 'assessments'),
      where('classLevel', '==', studentProfile.classLevel),
      where('published', '==', true)
    );
    const unsubA = onSnapshot(
      qAssess,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Assessment);
        list.sort((a, b) => {
          const ta = (a.createdAt as { seconds?: number })?.seconds ?? 0;
          const tb = (b.createdAt as { seconds?: number })?.seconds ?? 0;
          return tb - ta;
        });
        setAllClassAssessments(list);
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'assessments')
    );

    const qSub = query(
      collection(db, 'submissions'),
      where('studentId', '==', studentProfile.uid)
    );
    const unsubS = onSnapshot(
      qSub,
      (snap) => {
        setAllStudentSubmissions(snap.docs.map((d) => d.data() as AssessmentSubmission));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'submissions')
    );

    return () => {
      unsubA();
      unsubS();
    };
  }, [studentProfile]);

  // Countdown timer for active timed test
  useEffect(() => {
    if (!activeAssessment || kind !== 'test') return;
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeAssessment, kind, secondsLeft]);

  if (!studentProfile) return null;

  const assessments = allClassAssessments.filter((a) => a.kind === kind);
  const submissions = allStudentSubmissions.filter((s) => s.kind === kind);

  const openAssessment = (assessment: Assessment) => {
    const existing = submissions.find((s) => s.assessmentId === assessment.id);
    const initial: Record<string, StudentAnswer> = {};
    for (const q of assessment.questions) {
      const prevAns = existing?.answers?.find((a) => a.questionId === q.id);
      initial[q.id] = prevAns || {
        questionId: q.id,
        selectedOptionIndex: null,
        textAnswer: '',
      };
    }
    setAnswersMap(initial);
    setSecondsLeft(assessment.durationMinutes * 60);
    setActiveAssessment(assessment);
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const titleLabel = kind === 'test' ? 'Tests & Examinations' : 'Assignments & Homework';

  if (activeAssessment) {
    const teacherAttachUrl = sanitizeSafeUrl(activeAssessment.attachmentUrl || '', 900000);
    const existingSub =
      submissions.find((s) => s.assessmentId === activeAssessment.id) || null;

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border-theme bg-surface p-5 shadow-xs">
          <div>
            <p className="text-xs font-semibold text-accent-sky-text">
              {activeAssessment.classLevel} · {activeAssessment.subject} ·{' '}
              {activeAssessment.totalMarks} Marks
              {activeAssessment.topic ? ` · ${activeAssessment.topic}` : ''}
            </p>
            <h1 className="mt-1 font-display text-xl font-bold text-heading">
              {activeAssessment.title}
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              Deadline: {formatDeadlineDisplay(activeAssessment)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {kind === 'test' && (
              <div className="inline-flex items-center gap-1.5 rounded-xl bg-accent-gold-soft px-3.5 py-2 font-mono text-sm font-bold text-accent-gold-text tabular-nums">
                <Clock className="h-4 w-4" />
                <span>{formatTimer(secondsLeft)}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setActiveAssessment(null)}
              className="rounded-xl border border-border-theme bg-surface px-3.5 py-2 text-xs font-semibold text-body hover:bg-surface-muted"
            >
              Back to List
            </button>
          </div>
        </div>

        {teacherAttachUrl && (
          <div className="rounded-2xl border border-border-theme bg-surface p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-heading">
                {activeAssessment.attachmentType === 'photo' ? (
                  <ImageIcon className="h-4 w-4 text-accent-sky" />
                ) : (
                  <FileText className="h-4 w-4 text-accent-sky" />
                )}
                <span>
                  Assignment Worksheet:{' '}
                  {activeAssessment.attachmentName || 'Download Question Sheet'}
                </span>
              </div>
              <ResolvedFileLink
                url={teacherAttachUrl}
                fileName={activeAssessment.attachmentName}
                className="inline-flex items-center gap-1.5 rounded-xl bg-btn-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors"
              >
                <span>Open Worksheet</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </ResolvedFileLink>
            </div>
            {activeAssessment.attachmentType === 'photo' && (
              <ResolvedImage
                url={teacherAttachUrl}
                alt={activeAssessment.attachmentName || 'Teacher worksheet'}
                className="max-h-80 w-full rounded-xl border border-border-theme object-contain bg-surface-subtle"
              />
            )}
          </div>
        )}

        {/* Interactive Questions (if included) */}
        {activeAssessment.questions.length > 0 && (
          <div className="space-y-4">
            {activeAssessment.questions.map((q, idx) => {
              const currentAns = answersMap[q.id];
              return (
                <div
                  key={q.id}
                  className="rounded-2xl border border-border-theme bg-surface p-5 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-base font-bold text-heading">
                      Question {idx + 1}
                    </h2>
                    <span className="font-mono text-xs font-semibold text-muted tabular-nums">
                      {q.marks} Marks
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-heading whitespace-pre-wrap">{q.prompt}</p>

                  {q.type === 'mcq' ? (
                    <div className="mt-4 space-y-2">
                      {q.options.map((opt, optIdx) => {
                        const selected = currentAns?.selectedOptionIndex === optIdx;
                        return (
                          <button
                            key={optIdx}
                            type="button"
                            onClick={() =>
                              setAnswersMap((prev) => ({
                                ...prev,
                                [q.id]: {
                                  questionId: q.id,
                                  selectedOptionIndex: optIdx,
                                  textAnswer: '',
                                },
                              }))
                            }
                            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                              selected
                                ? 'border-accent-sky bg-accent-sky-soft font-semibold text-heading'
                                : 'border-border-theme bg-surface text-body hover:bg-surface-muted'
                            }`}
                          >
                            <span className="font-mono text-xs font-bold text-muted">
                              {String.fromCharCode(65 + optIdx)}.
                            </span>
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      rows={4}
                      value={currentAns?.textAnswer || ''}
                      onChange={(e) =>
                        setAnswersMap((prev) => ({
                          ...prev,
                          [q.id]: {
                            questionId: q.id,
                            selectedOptionIndex: null,
                            textAnswer: e.target.value,
                          },
                        }))
                      }
                      placeholder="Write your clear working here (or upload PDF/DOC/photo files below)..."
                      className="mt-4 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2.5 text-sm focus:border-accent-sky focus:outline-none"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Unified SUBMIT YOUR ANSWERS section (multi-file PDF/DOC/DOCX/JPG/PNG, typed answer, deadline & replace support) */}
        <SubmitAnswersSection
          assessment={activeAssessment}
          existingSubmission={existingSub}
          questionAnswers={answersMap}
          compactHeader
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border-theme bg-surface text-body hover:bg-surface-muted transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="font-display text-2xl font-bold text-heading">
              {titleLabel} · {studentProfile.classLevel}
            </h1>
            <p className="text-xs text-muted">
              Submit answers in PDF, DOC, DOCX, JPG, JPEG, PNG or typed text, track deadlines, and check marks & teacher feedback.
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-xl bg-surface-muted p-1 gap-1">
          <button
            type="button"
            onClick={() => setTab('assigned')}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
              tab === 'assigned' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
            }`}
          >
            Assigned {kind === 'test' ? 'Tests' : 'Work'} ({assessments.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('results')}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
              tab === 'results' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
            }`}
          >
            MY ASSIGNMENTS AND RESULTS
          </button>
        </div>
      </div>

      {tab === 'results' ? (
        <MyAssignmentsResultsView
          assessments={allClassAssessments}
          submissions={allStudentSubmissions}
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-accent-sky" />
        </div>
      ) : assessments.length === 0 ? (
        <div className="rounded-2xl border border-border-theme bg-surface p-8 text-center">
          {kind === 'test' ? (
            <ClipboardCheck className="mx-auto h-8 w-8 text-faint" />
          ) : (
            <FileText className="mx-auto h-8 w-8 text-faint" />
          )}
          <h2 className="mt-3 font-display text-base font-bold text-heading">
            No Published {kind === 'test' ? 'Tests' : 'Assignments'} Yet
          </h2>
          <p className="mt-1 text-sm text-muted">
            Published {studentProfile.classLevel}{' '}
            {kind === 'test' ? 'tests' : 'homework assignments'} will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {assessments.map((item) => {
            const sub = submissions.find((s) => s.assessmentId === item.id) || null;
            const status = getSubmissionDisplayStatus(item, sub);
            const overdue = !sub && isAssessmentOverdue(item);
            const submitState = canStudentSubmitNow(item, sub);
            const itemAttachUrl = sanitizeSafeUrl(item.attachmentUrl || '', 900000);

            return (
              <div
                key={item.id}
                className="flex flex-col justify-between rounded-2xl border border-border-theme bg-surface p-5 shadow-xs space-y-4"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-accent-sky-text">
                      {item.classLevel} · {item.subject}
                      {item.topic ? ` · ${item.topic}` : ''}
                    </span>
                    <span
                      className={`inline-flex rounded-lg border px-2.5 py-0.5 text-[11px] font-bold ${getStatusBadgeClasses(
                        status
                      )}`}
                    >
                      {status}
                    </span>
                  </div>

                  <h2 className="mt-2 font-display text-lg font-bold text-heading">
                    {item.title}
                  </h2>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className="font-mono font-semibold text-heading tabular-nums">
                      {item.totalMarks} Marks
                    </span>
                    <span>· Deadline: {formatDeadlineDisplay(item)}</span>
                    {overdue && (
                      <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Overdue
                      </span>
                    )}
                  </div>

                  {item.materialTitle && (
                    <div className="mt-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      Attached to material: {item.materialTitle}
                    </div>
                  )}

                  {itemAttachUrl && (
                    <ResolvedFileLink
                      url={itemAttachUrl}
                      fileName={item.attachmentName}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-sky-text hover:underline"
                    >
                      {item.attachmentType === 'photo' ? (
                        <ImageIcon className="h-3.5 w-3.5" />
                      ) : (
                        <FileText className="h-3.5 w-3.5" />
                      )}
                      <span>{item.attachmentName || 'View Worksheet'}</span>
                      <ExternalLink className="h-3 w-3" />
                    </ResolvedFileLink>
                  )}

                  {sub && (
                    <div className="mt-4 rounded-xl border border-border-theme bg-surface-subtle p-3.5 space-y-2">
                      {status === 'Marked' ? (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Result Released
                          </span>
                          <span className="inline-flex items-center gap-1 font-display text-base font-bold text-heading tabular-nums">
                            <Award className="h-4 w-4 text-accent-gold" />
                            {sub.totalScore} / {sub.maxMarks} ({sub.grade})
                          </span>
                        </div>
                      ) : (
                        <div className="text-xs font-medium text-body">
                          Submitted {formatTimestamp(sub.submittedAt)} · Status: <strong>{status}</strong>
                        </div>
                      )}

                      {sub.teacherRemarks && (
                        <p className="text-xs text-body">
                          <strong>Teacher Comments:</strong> {sub.teacherRemarks}
                        </p>
                      )}
                      {sub.corrections && (
                        <p className="text-xs text-rose-700 dark:text-rose-300">
                          <strong>Corrections:</strong> {sub.corrections}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => openAssessment(item)}
                  className="inline-flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-btn-primary-hover transition-colors"
                >
                  <FileUp className="h-3.5 w-3.5 text-[#FACC15]" />
                  <span>
                    {!sub
                      ? kind === 'test'
                        ? 'Open Test & Submit Answers'
                        : 'SUBMIT YOUR ANSWERS'
                      : submitState.allowed
                        ? status === 'Returned for Correction'
                          ? 'Upload Corrections'
                          : 'View / Replace Submission'
                        : 'View Submission & Feedback'}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
