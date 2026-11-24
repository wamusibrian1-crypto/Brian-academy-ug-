import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  FileText,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Send,
  Trash2,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, handleFirestoreError, OperationType, storage } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  Assessment,
  AssessmentKind,
  AssessmentSubmission,
  StudentAnswer,
} from '../../types/academy';
import { generateDocId, sanitizeSafeUrl, sanitizeString } from '../../lib/validation';
import { logPlatformActivity } from '../../lib/activity';

interface StudentAssessmentsPageProps {
  kind: AssessmentKind;
  onBack: () => void;
}

export const StudentAssessmentsPage: React.FC<StudentAssessmentsPageProps> = ({
  kind,
  onBack,
}) => {
  const { studentProfile } = useAuth();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [submissions, setSubmissions] = useState<AssessmentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAssessment, setActiveAssessment] = useState<Assessment | null>(null);
  const [answersMap, setAnswersMap] = useState<Record<string, StudentAnswer>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  // Student Upload Space (PDF & Photo)
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [uploadType, setUploadType] = useState<'' | 'pdf' | 'photo'>('');
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentProfile) return;
    const qAssess = query(
      collection(db, 'assessments'),
      where('classLevel', '==', studentProfile.classLevel),
      where('published', '==', true),
      where('kind', '==', kind)
    );
    const unsubA = onSnapshot(
      qAssess,
      (snap) => {
        setAssessments(snap.docs.map((d) => d.data() as Assessment));
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'assessments')
    );

    const qSub = query(
      collection(db, 'submissions'),
      where('studentId', '==', studentProfile.uid),
      where('kind', '==', kind)
    );
    const unsubS = onSnapshot(
      qSub,
      (snap) => {
        setSubmissions(snap.docs.map((d) => d.data() as AssessmentSubmission));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'submissions')
    );

    return () => {
      unsubA();
      unsubS();
    };
  }, [studentProfile, kind]);

  // Countdown timer for active test
  useEffect(() => {
    if (!activeAssessment || kind !== 'test') return;
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeAssessment, kind, secondsLeft]);

  if (!studentProfile) return null;

  const startAssessment = (assessment: Assessment) => {
    const initial: Record<string, StudentAnswer> = {};
    for (const q of assessment.questions) {
      initial[q.id] = { questionId: q.id, selectedOptionIndex: null, textAnswer: '' };
    }
    setAnswersMap(initial);
    setSecondsLeft(assessment.durationMinutes * 60);
    setUploadUrl('');
    setUploadName('');
    setUploadType('');
    setUploadPct(null);
    setStorageNotice(null);
    setSubmitError(null);
    setActiveAssessment(assessment);
  };

  const handleStudentFileSelected = (
    e: React.ChangeEvent<HTMLInputElement>,
    expectedType: 'pdf' | 'photo'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeAssessment) return;
    setStorageNotice(null);
    setSubmitError(null);

    const isPdf =
      expectedType === 'pdf' ||
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');
    const resolvedType: 'pdf' | 'photo' = isPdf ? 'pdf' : 'photo';

    setUploadType(resolvedType);
    setUploadName(file.name);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `submissions/${studentProfile.uid}/${activeAssessment.id}_${Date.now()}_${safeName}`;
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      'state_changed',
      (snap) => {
        setUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      (err) => {
        setUploadPct(null);
        setStorageNotice(
          `Firebase Storage upload requires Storage rules in Firebase Console (${err.code}). You can still paste a secure https:// PDF or photo URL below.`
        );
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setUploadUrl(url);
        setUploadPct(null);
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAssessment) return;
    setSubmitError(null);

    const cleanAttachUrl = sanitizeSafeUrl(uploadUrl, 1000);
    const hasStructuredWithoutText = activeAssessment.questions.some(
      (q) =>
        q.type === 'structured' &&
        !sanitizeString(answersMap[q.id]?.textAnswer || '', 2000)
    );
    if (hasStructuredWithoutText && !cleanAttachUrl) {
      setSubmitError(
        'Please type your structured answer(s) OR upload a PDF / photo of your written work before submitting.'
      );
      return;
    }

    setSubmitting(true);
    const subId = generateDocId('sub');
    const path = `submissions/${subId}`;
    const answers = activeAssessment.questions.map((q) => ({
      questionId: q.id,
      selectedOptionIndex: answersMap[q.id]?.selectedOptionIndex ?? null,
      textAnswer: sanitizeString(answersMap[q.id]?.textAnswer || '', 2000),
    }));

    const resolvedAttachType: '' | 'pdf' | 'photo' = cleanAttachUrl
      ? uploadType ||
        (cleanAttachUrl.toLowerCase().includes('.pdf') ? 'pdf' : 'photo')
      : '';

    try {
      await setDoc(doc(db, 'submissions', subId), {
        id: subId,
        assessmentId: activeAssessment.id,
        assessmentTitle: activeAssessment.title,
        kind: activeAssessment.kind,
        classLevel: studentProfile.classLevel,
        subject: activeAssessment.subject,
        studentId: studentProfile.uid,
        studentName: studentProfile.fullName,
        studentNumber: studentProfile.studentNumber,
        answers,
        questionScores: [],
        totalScore: 0,
        maxMarks: activeAssessment.totalMarks,
        grade: '',
        teacherRemarks: '',
        attachmentUrl: cleanAttachUrl,
        attachmentName: cleanAttachUrl ? sanitizeString(uploadName || 'Student Work', 200) : '',
        attachmentType: resolvedAttachType,
        status: 'submitted',
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logPlatformActivity({
        actorId: studentProfile.uid,
        actorName: studentProfile.fullName,
        actorRole: 'student',
        action: kind === 'test' ? 'Submitted Test' : 'Submitted Homework',
        details: `${activeAssessment.subject} (${studentProfile.classLevel}): ${activeAssessment.title}`,
      });
      setActiveAssessment(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const titleLabel = kind === 'test' ? 'Tests & Examinations' : 'Homework Assignments';

  if (activeAssessment) {
    const teacherAttachUrl = sanitizeSafeUrl(activeAssessment.attachmentUrl || '', 1000);
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border-theme bg-surface p-5 shadow-xs">
          <div>
            <p className="text-xs font-semibold text-accent-sky-text">
              {activeAssessment.classLevel} · {activeAssessment.subject} · {activeAssessment.totalMarks} Marks
            </p>
            <h1 className="mt-1 font-display text-xl font-bold text-heading">
              {activeAssessment.title}
            </h1>
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
              className="rounded-xl border border-border-theme bg-surface px-3 py-2 text-xs font-semibold text-body hover:bg-surface-muted"
            >
              Cancel
            </button>
          </div>
        </div>

        {activeAssessment.instructions && (
          <div className="rounded-xl border border-sky-100 dark:border-sky-800/70 bg-accent-sky-soft px-4 py-3 text-sm text-heading">
            {activeAssessment.instructions}
          </div>
        )}

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
                  Teacher Attached {activeAssessment.attachmentType === 'photo' ? 'Photo' : 'PDF'}:{' '}
                  {activeAssessment.attachmentName || 'Worksheet'}
                </span>
              </div>
              <a
                href={teacherAttachUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-btn-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors"
              >
                <span>Open {activeAssessment.attachmentType === 'photo' ? 'Photo' : 'PDF'}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            {activeAssessment.attachmentType === 'photo' && (
              <img
                src={teacherAttachUrl}
                alt={activeAssessment.attachmentName || 'Teacher worksheet'}
                className="max-h-80 w-full rounded-xl border border-border-theme object-contain bg-surface-subtle"
              />
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
                    placeholder="Write your clear working here (or upload a PDF / photo of your handwritten work below)..."
                    className="mt-4 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2.5 text-sm focus:border-accent-sky focus:outline-none"
                  />
                )}
              </div>
            );
          })}

          {/* Student Upload Space (PDF and Photo) */}
          <div className="rounded-2xl border border-border-theme bg-surface p-5 shadow-xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-heading">
                  Student Upload Space (PDF & Photo)
                </h2>
                <p className="text-xs text-muted">
                  Upload your solved answer sheet as a PDF document or take/upload a clear photo of your handwritten working.
                </p>
              </div>
              {uploadUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setUploadUrl('');
                    setUploadName('');
                    setUploadType('');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Remove File</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-input bg-surface-subtle px-4 py-3 text-xs font-semibold text-heading hover:bg-surface-muted transition-colors">
                <FileUp className="h-4 w-4 text-accent-sky shrink-0" />
                <span>Upload PDF Document</span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => handleStudentFileSelected(e, 'pdf')}
                  className="hidden"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-input bg-surface-subtle px-4 py-3 text-xs font-semibold text-heading hover:bg-surface-muted transition-colors">
                <Camera className="h-4 w-4 text-accent-gold shrink-0" />
                <span>Upload / Capture Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleStudentFileSelected(e, 'photo')}
                  className="hidden"
                />
              </label>
            </div>

            {uploadPct !== null && (
              <div className="text-xs font-semibold text-accent-sky-text tabular-nums">
                Uploading file: {uploadPct}%
              </div>
            )}

            {storageNotice && (
              <p className="rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 p-2.5 text-xs text-amber-900 dark:text-amber-300">
                {storageNotice}
              </p>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-body">
                Uploaded File Link (or paste https:// link to your PDF / photo)
              </label>
              <input
                type="url"
                value={uploadUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setUploadUrl(val);
                  if (!uploadType && val) {
                    setUploadType(val.toLowerCase().includes('.pdf') ? 'pdf' : 'photo');
                  }
                }}
                placeholder="https://..."
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-xs focus:border-accent-sky focus:outline-none"
              />
            </div>

            {uploadUrl && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/40 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <span>
                    Ready to submit {uploadType === 'photo' ? 'Photo' : 'PDF'}:{' '}
                    {uploadName || 'Attached file'}
                  </span>
                  <a
                    href={sanitizeSafeUrl(uploadUrl, 1000)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline"
                  >
                    Preview <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                {uploadType === 'photo' && sanitizeSafeUrl(uploadUrl, 1000) && (
                  <img
                    src={sanitizeSafeUrl(uploadUrl, 1000)}
                    alt="Uploaded student work preview"
                    className="max-h-56 rounded-lg border border-border-theme object-contain bg-surface"
                  />
                )}
              </div>
            )}
          </div>

          {submitError && (
            <p className="rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/50 px-4 py-3 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || uploadPct !== null}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-5 py-3.5 text-sm font-semibold text-white hover:bg-btn-primary-hover disabled:opacity-60 transition-colors"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span>Submit {kind === 'test' ? 'Test Answers' : 'Homework'}</span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
            Complete assigned assessments, upload PDF or photo solutions, and view released Ugandan grades & teacher remarks.
          </p>
        </div>
      </div>

      {loading ? (
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
            No Published {kind === 'test' ? 'Tests' : 'Homework'} Yet
          </h2>
          <p className="mt-1 text-sm text-muted">
            Published {studentProfile.classLevel} {kind === 'test' ? 'tests' : 'homework assignments'} will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {assessments.map((item) => {
            const sub = submissions.find((s) => s.assessmentId === item.id);
            const itemAttachUrl = sanitizeSafeUrl(item.attachmentUrl || '', 1000);
            return (
              <div
                key={item.id}
                className="flex flex-col justify-between rounded-2xl border border-border-theme bg-surface p-5 shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-accent-sky-text">
                      {item.classLevel} · {item.subject}
                    </span>
                    <span className="font-mono text-muted tabular-nums">
                      {item.totalMarks} Marks · {item.durationMinutes} mins
                    </span>
                  </div>
                  <h2 className="mt-2 font-display text-lg font-bold text-heading">
                    {item.title}
                  </h2>
                  {item.dueDate && (
                    <p className="mt-1 text-xs text-muted">Due: {item.dueDate}</p>
                  )}
                  {itemAttachUrl && (
                    <a
                      href={itemAttachUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-sky-text hover:underline"
                    >
                      {item.attachmentType === 'photo' ? (
                        <ImageIcon className="h-3.5 w-3.5" />
                      ) : (
                        <FileText className="h-3.5 w-3.5" />
                      )}
                      <span>{item.attachmentName || 'View Teacher Worksheet'}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}

                  {sub && (
                    <div className="mt-4 rounded-xl border border-border-theme bg-surface-subtle p-3.5 space-y-2">
                      {sub.status === 'published' ? (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Result Released
                            </span>
                            <span className="font-display text-base font-bold text-heading tabular-nums">
                              {sub.totalScore} / {sub.maxMarks} ({sub.grade})
                            </span>
                          </div>
                          {sub.teacherRemarks && (
                            <p className="text-xs text-body">
                              <strong>Teacher Remarks:</strong> {sub.teacherRemarks}
                            </p>
                          )}
                          {sub.questionScores?.some((qs) => qs.comment) && (
                            <div className="border-t border-border-theme pt-2 space-y-1">
                              {sub.questionScores.map((qs, qi) =>
                                qs.comment ? (
                                  <div key={qs.questionId} className="text-[11px] text-body">
                                    <strong>Q{qi + 1} ({qs.score}m):</strong> {qs.comment}
                                  </div>
                                ) : null
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-xs font-medium text-body">
                          Submitted — awaiting teacher grading and result release.
                        </div>
                      )}

                      {sub.attachmentUrl && (
                        <a
                          href={sanitizeSafeUrl(sub.attachmentUrl, 1000)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-sky-text hover:underline"
                        >
                          <span>
                            Your Uploaded {sub.attachmentType === 'photo' ? 'Photo' : 'PDF'}:{' '}
                            {sub.attachmentName || 'File'}
                          </span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {!sub && (
                  <button
                    type="button"
                    onClick={() => startAssessment(item)}
                    className="mt-5 w-full rounded-xl bg-btn-primary px-4 py-2.5 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors"
                  >
                    Start {kind === 'test' ? 'Test' : 'Homework'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
