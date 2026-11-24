import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, handleFirestoreError, OperationType, storage } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  AnswerKeyEntry,
  Assessment,
  AssessmentAnswerKey,
  AssessmentKind,
  AssessmentQuestion,
  AssessmentSubmission,
  CLASS_LEVELS,
  ClassLevel,
  computeUgandanGrade,
  QuestionScore,
  SUBJECTS,
  SubjectCode,
} from '../../types/academy';
import { generateDocId, sanitizeSafeUrl, sanitizeString } from '../../lib/validation';
import { logPlatformActivity } from '../../lib/activity';

interface QuestionDraft {
  id: string;
  type: 'mcq' | 'structured';
  prompt: string;
  marks: number;
  options: string[];
  correctOptionIndex: number;
  markingGuide: string;
}

export const AdminExaminationsPage: React.FC = () => {
  const { role, adminProfile, teacherProfile, academicSettings } = useAuth();
  const isAdmin = role === 'admin';
  const staffUid = adminProfile?.uid || teacherProfile?.uid || '';
  const staffName = adminProfile?.fullName || teacherProfile?.fullName || 'Staff';

  const [tab, setTab] = useState<'create' | 'submissions'>('create');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [submissions, setSubmissions] = useState<AssessmentSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  // Builder state
  const [kind, setKind] = useState<AssessmentKind>('test');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [classLevel, setClassLevel] = useState<ClassLevel>('S1');
  const [subject, setSubject] = useState<SubjectCode>('MTC');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [dueDate, setDueDate] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentType, setAttachmentType] = useState<'' | 'pdf' | 'photo'>('');
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    {
      id: 'q1',
      type: 'mcq',
      prompt: '',
      marks: 5,
      options: ['', '', '', ''],
      correctOptionIndex: 0,
      markingGuide: '',
    },
  ]);
  const [saving, setSaving] = useState(false);

  // Grading modal/panel state
  const [gradingSub, setGradingSub] = useState<AssessmentSubmission | null>(null);
  const [gradingAssess, setGradingAssess] = useState<Assessment | null>(null);
  const [gradingKey, setGradingKey] = useState<Record<string, AnswerKeyEntry>>({});
  const [scoresMap, setScoresMap] = useState<Record<string, number>>({});
  const [commentsMap, setCommentsMap] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState('');
  const [publishingGrade, setPublishingGrade] = useState(false);

  useEffect(() => {
    const unsubA = onSnapshot(
      collection(db, 'assessments'),
      (snap) => {
        setAssessments(snap.docs.map((d) => d.data() as Assessment));
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'assessments')
    );
    const unsubS = onSnapshot(
      collection(db, 'submissions'),
      (snap) => setSubmissions(snap.docs.map((d) => d.data() as AssessmentSubmission)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'submissions')
    );
    return () => {
      unsubA();
      unsubS();
    };
  }, []);

  const addQuestion = (type: 'mcq' | 'structured') => {
    setQuestions((prev) => [
      ...prev,
      {
        id: `q${prev.length + 1}_${Date.now().toString(36)}`,
        type,
        prompt: '',
        marks: type === 'mcq' ? 5 : 10,
        options: type === 'mcq' ? ['', '', '', ''] : [],
        correctOptionIndex: 0,
        markingGuide: '',
      },
    ]);
  };

  const handleTeacherWorkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStorageNotice(null);

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const detectedType: 'pdf' | 'photo' = isPdf ? 'pdf' : 'photo';
    setAttachmentType(detectedType);
    setAttachmentName(file.name);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageRef = ref(storage, `assessments/${classLevel}/${Date.now()}_${safeName}`);
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      'state_changed',
      (snap) => {
        setUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      (err) => {
        setUploadPct(null);
        setStorageNotice(
          `Firebase Storage upload requires Storage rules in Firebase Console (${err.code}). You can paste an https:// PDF or Photo URL below.`
        );
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setAttachmentUrl(url);
        setUploadPct(null);
      }
    );
  };

  const handlePublishAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const id = generateDocId('asmt');
    const cleanQuestions: AssessmentQuestion[] = questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: sanitizeString(q.prompt, 1000),
      marks: Math.max(1, Number(q.marks) || 1),
      options: q.type === 'mcq' ? q.options.map((o) => sanitizeString(o, 240)) : [],
    }));
    const totalMarks = cleanQuestions.reduce((acc, q) => acc + q.marks, 0);

    const answerEntries: Record<string, AnswerKeyEntry> = {};
    for (const q of questions) {
      answerEntries[q.id] =
        q.type === 'mcq'
          ? { correctOptionIndex: q.correctOptionIndex }
          : { markingGuide: sanitizeString(q.markingGuide, 500) };
    }

    const cleanAttachUrl = sanitizeSafeUrl(attachmentUrl, 1000);
    const resolvedAttachType: '' | 'pdf' | 'photo' = cleanAttachUrl
      ? attachmentType ||
        (cleanAttachUrl.toLowerCase().includes('.pdf') ? 'pdf' : 'photo')
      : '';

    try {
      await setDoc(doc(db, 'assessments', id), {
        id,
        kind,
        title: sanitizeString(title, 160),
        instructions: sanitizeString(instructions, 2000),
        classLevel,
        subject,
        durationMinutes: Math.max(5, Number(durationMinutes) || 30),
        totalMarks,
        dueDate: sanitizeString(dueDate, 40),
        questions: cleanQuestions,
        attachmentUrl: cleanAttachUrl,
        attachmentName: cleanAttachUrl ? sanitizeString(attachmentName || 'Worksheet', 200) : '',
        attachmentType: resolvedAttachType,
        published: true,
        resultsPublished: false,
        createdBy: staffUid,
        creatorName: staffName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'assessments', id, 'private', 'answerKey'), {
        answers: answerEntries,
        updatedBy: staffUid,
        updatedAt: serverTimestamp(),
      });

      await logPlatformActivity({
        actorId: staffUid,
        actorName: staffName,
        actorRole: isAdmin ? 'admin' : 'teacher',
        action: `Published ${kind === 'test' ? 'Test' : 'Homework'}`,
        details: `${classLevel} ${subject}: ${title} (${totalMarks} Marks)`,
      });

      setTitle('');
      setInstructions('');
      setDueDate('');
      setAttachmentUrl('');
      setAttachmentName('');
      setAttachmentType('');
      setStorageNotice(null);
      setQuestions([
        {
          id: 'q1',
          type: 'mcq',
          prompt: '',
          marks: 5,
          options: ['', '', '', ''],
          correctOptionIndex: 0,
          markingGuide: '',
        },
      ]);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `assessments/${id}`);
    } finally {
      setSaving(false);
    }
  };

  const openGradingPanel = async (sub: AssessmentSubmission) => {
    const asmt = assessments.find((a) => a.id === sub.assessmentId) || null;
    setGradingAssess(asmt);
    setGradingSub(sub);
    setRemarks(sub.teacherRemarks || '');

    let keyAnswers: Record<string, AnswerKeyEntry> = {};
    try {
      const keySnap = await getDoc(doc(db, 'assessments', sub.assessmentId, 'private', 'answerKey'));
      if (keySnap.exists()) {
        keyAnswers = (keySnap.data() as AssessmentAnswerKey).answers || {};
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `assessments/${sub.assessmentId}/private/answerKey`);
    }
    setGradingKey(keyAnswers);

    const initialScores: Record<string, number> = {};
    const initialComments: Record<string, string> = {};
    for (const qs of sub.questionScores || []) {
      initialScores[qs.questionId] = qs.score;
      initialComments[qs.questionId] = qs.comment || '';
    }
    if (asmt) {
      for (const q of asmt.questions) {
        if (initialScores[q.id] === undefined) {
          if (q.type === 'mcq') {
            const stuAns = sub.answers.find((a) => a.questionId === q.id);
            const correctIdx = keyAnswers[q.id]?.correctOptionIndex;
            initialScores[q.id] =
              stuAns?.selectedOptionIndex === correctIdx ? q.marks : 0;
          } else {
            initialScores[q.id] = 0;
          }
        }
        if (initialComments[q.id] === undefined) {
          initialComments[q.id] = '';
        }
      }
    }
    setScoresMap(initialScores);
    setCommentsMap(initialComments);
  };

  const handleSaveAndPublishGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingSub || !gradingAssess) return;
    setPublishingGrade(true);
    const questionScores: QuestionScore[] = gradingAssess.questions.map((q) => ({
      questionId: q.id,
      score: Math.min(q.marks, Math.max(0, Number(scoresMap[q.id]) || 0)),
      comment: sanitizeString(commentsMap[q.id] || '', 400),
    }));
    const totalScore = questionScores.reduce((sum, s) => sum + s.score, 0);
    const computed = computeUgandanGrade(
      totalScore,
      gradingSub.maxMarks,
      academicSettings.gradeBands
    );

    try {
      await updateDoc(doc(db, 'submissions', gradingSub.id), {
        questionScores,
        totalScore,
        grade: computed.grade,
        teacherRemarks: sanitizeString(remarks, 1000),
        attachmentUrl: gradingSub.attachmentUrl || '',
        attachmentName: gradingSub.attachmentName || '',
        attachmentType: gradingSub.attachmentType || '',
        status: 'published',
        updatedAt: serverTimestamp(),
      });
      await logPlatformActivity({
        actorId: staffUid,
        actorName: staffName,
        actorRole: isAdmin ? 'admin' : 'teacher',
        action: 'Graded & Made Remarks',
        details: `${gradingSub.studentName}: ${gradingSub.assessmentTitle} (${totalScore}/${gradingSub.maxMarks} · ${computed.grade})`,
      });
      setGradingSub(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `submissions/${gradingSub.id}`);
    } finally {
      setPublishingGrade(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-heading">
          Examinations & Homework
        </h1>
        <p className="mt-1 text-sm text-muted">
          Upload teacher work (PDF/photo worksheets & questions), review student PDF/photo submissions, make per-question & overall remarks, and publish Ugandan results.
        </p>
      </div>

      <div className="inline-flex rounded-xl bg-surface-muted p-1">
        <button
          type="button"
          onClick={() => setTab('create')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            tab === 'create' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
          }`}
        >
          Create & Upload Work
        </button>
        <button
          type="button"
          onClick={() => setTab('submissions')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            tab === 'submissions' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
          }`}
        >
          Review, Grade & Make Remarks ({submissions.length})
        </button>
      </div>

      {tab === 'create' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={handlePublishAssessment}
            className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4 lg:col-span-7"
          >
            <h2 className="font-display text-lg font-bold text-heading">
              Upload Work / Build Test or Homework
            </h2>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-body">Type</label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as AssessmentKind)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-2.5 py-2 text-xs font-semibold text-heading"
                >
                  <option value="test">Timed Test</option>
                  <option value="homework">Homework</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Class</label>
                <select
                  value={classLevel}
                  onChange={(e) => setClassLevel(e.target.value as ClassLevel)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-2.5 py-2 text-xs font-semibold text-heading"
                >
                  {CLASS_LEVELS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Subject</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value as SubjectCode)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-2.5 py-2 text-xs font-semibold text-heading"
                >
                  {SUBJECTS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Duration (min)</label>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-2.5 py-2 text-xs font-semibold text-heading"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-body">Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Mid-Term Mathematics Assessment"
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs text-heading"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">Instructions</label>
              <textarea
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Attempt all questions. You may upload a PDF or photo of your handwritten working."
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            {/* Teacher Work Upload Provision (PDF / Photo Worksheet) */}
            <div className="rounded-xl border border-border-theme bg-surface-subtle p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-heading">
                    Teacher Work Upload (Optional PDF / Photo Worksheet)
                  </h3>
                  <p className="text-[11px] text-muted">
                    Attach a question paper PDF or diagram photo for students to download and solve.
                  </p>
                </div>
                {attachmentUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentUrl('');
                      setAttachmentName('');
                      setAttachmentType('');
                    }}
                    className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                  >
                    Remove Attachment
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-input bg-surface px-3 py-2.5 text-xs font-semibold text-heading hover:bg-surface-muted sm:col-span-2">
                  <FileUp className="h-4 w-4 text-accent-sky shrink-0" />
                  <span className="truncate">
                    {attachmentName || 'Upload PDF or Photo Worksheet'}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handleTeacherWorkUpload}
                    className="hidden"
                  />
                </label>

                <select
                  value={attachmentType}
                  onChange={(e) =>
                    setAttachmentType(e.target.value as '' | 'pdf' | 'photo')
                  }
                  className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
                >
                  <option value="">Auto Type</option>
                  <option value="pdf">PDF Document</option>
                  <option value="photo">Photo / Diagram</option>
                </select>
              </div>

              {uploadPct !== null && (
                <div className="text-xs font-semibold text-accent-sky-text tabular-nums">
                  Uploading worksheet: {uploadPct}%
                </div>
              )}
              {storageNotice && (
                <p className="rounded-lg bg-amber-50 dark:bg-amber-950/50 p-2.5 text-xs text-amber-900 dark:text-amber-300">
                  {storageNotice}
                </p>
              )}

              <input
                type="url"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="Or paste https:// link to PDF / photo worksheet..."
                className="w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs text-heading"
              />
            </div>

            {/* Question Builder */}
            <div className="space-y-3 border-t border-border-subtle pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-heading">
                  Questions ({questions.length}) · Total Marks:{' '}
                  {questions.reduce((a, q) => a + (Number(q.marks) || 0), 0)}
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => addQuestion('mcq')}
                    className="inline-flex items-center gap-1 rounded-lg border border-border-theme bg-surface px-2.5 py-1 text-xs font-semibold text-heading hover:bg-surface-muted"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add MCQ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addQuestion('structured')}
                    className="inline-flex items-center gap-1 rounded-lg border border-border-theme bg-surface px-2.5 py-1 text-xs font-semibold text-heading hover:bg-surface-muted"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Structured</span>
                  </button>
                </div>
              </div>

              {questions.map((q, idx) => (
                <div key={q.id} className="rounded-xl border border-border-theme bg-surface-subtle p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-heading">
                      Q{idx + 1} · {q.type === 'mcq' ? 'Multiple Choice' : 'Structured'}
                    </span>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted">Marks:</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={q.marks}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setQuestions((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, marks: val } : item))
                          );
                        }}
                        className="w-16 rounded-lg border border-border-input bg-input-bg px-2 py-1 text-xs font-mono text-heading"
                      />
                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setQuestions((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-faint hover:text-rose-600 dark:hover:text-rose-400"
                          aria-label="Remove question"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <textarea
                    rows={2}
                    required
                    value={q.prompt}
                    onChange={(e) => {
                      const val = e.target.value;
                      setQuestions((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, prompt: val } : item))
                      );
                    }}
                    placeholder="Enter question prompt (or reference attached worksheet)..."
                    className="w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-sm text-heading"
                  />

                  {q.type === 'mcq' ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {q.options.map((opt, optIdx) => (
                        <div key={optIdx} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct_${q.id}`}
                            checked={q.correctOptionIndex === optIdx}
                            onChange={() =>
                              setQuestions((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, correctOptionIndex: optIdx } : item
                                )
                              )
                            }
                            aria-label={`Mark option ${optIdx + 1} as correct`}
                          />
                          <input
                            type="text"
                            required
                            value={opt}
                            onChange={(e) => {
                              const val = e.target.value;
                              setQuestions((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        options: item.options.map((o, oi) =>
                                          oi === optIdx ? val : o
                                        ),
                                      }
                                    : item
                                )
                              );
                            }}
                            placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                            className="flex-1 rounded-lg border border-border-input bg-input-bg px-2.5 py-1.5 text-xs text-heading"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={q.markingGuide}
                      onChange={(e) => {
                        const val = e.target.value;
                        setQuestions((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, markingGuide: val } : item
                          )
                        );
                      }}
                      placeholder="Marking guide / expected key points (hidden from students)"
                      className="w-full rounded-lg border border-border-input bg-input-bg px-3 py-1.5 text-xs text-heading"
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-3 text-sm font-semibold text-white hover:bg-btn-primary-hover"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              <span>Publish {kind === 'test' ? 'Test' : 'Homework'}</span>
            </button>
          </form>

          {/* Existing Assessments */}
          <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs lg:col-span-5">
            <h2 className="font-display text-base font-bold text-heading">
              Published Assessments ({assessments.length})
            </h2>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-accent-sky" />
              </div>
            ) : assessments.length === 0 ? (
              <p className="mt-3 text-xs text-muted">No tests or homework published yet.</p>
            ) : (
              <div className="mt-4 divide-y divide-border-subtle">
                {assessments.map((a) => (
                  <div key={a.id} className="py-3.5 flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-accent-sky-text">
                        {a.classLevel} · {a.subject} · {a.kind.toUpperCase()}
                      </div>
                      <div className="font-display text-sm font-bold text-heading">
                        {a.title}
                      </div>
                      <div className="text-xs text-muted tabular-nums">
                        {a.questions.length} Qs · {a.totalMarks} Marks · {a.durationMinutes} mins
                      </div>
                      {a.attachmentUrl && (
                        <a
                          href={sanitizeSafeUrl(a.attachmentUrl, 1000)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-accent-sky-text hover:underline"
                        >
                          {a.attachmentType === 'photo' ? (
                            <ImageIcon className="h-3 w-3" />
                          ) : (
                            <FileText className="h-3 w-3" />
                          )}
                          <span>{a.attachmentName || 'Teacher Worksheet'}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {(isAdmin || a.createdBy === staffUid) && (
                      <button
                        type="button"
                        onClick={() => deleteDoc(doc(db, 'assessments', a.id))}
                        className="rounded-lg p-1.5 text-faint hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 dark:hover:text-rose-400"
                        aria-label="Delete assessment"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'submissions' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs lg:col-span-5">
            <h2 className="font-display text-base font-bold text-heading">
              Student Submissions
            </h2>
            {submissions.length === 0 ? (
              <p className="mt-3 text-xs text-muted">No student submissions received yet.</p>
            ) : (
              <div className="mt-4 divide-y divide-border-subtle">
                {submissions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openGradingPanel(s)}
                    className={`w-full py-3.5 px-2 text-left rounded-xl hover:bg-surface-muted flex items-center justify-between gap-2 ${
                      gradingSub?.id === s.id ? 'bg-accent-sky-soft' : ''
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold text-heading">{s.studentName}</div>
                      <div className="text-xs text-muted">
                        {s.classLevel} {s.subject} · {s.assessmentTitle}
                      </div>
                      {s.attachmentUrl && (
                        <div className="mt-0.5 text-[11px] font-semibold text-accent-sky-text">
                          Attached {s.attachmentType === 'photo' ? 'Photo' : 'PDF'}: {s.attachmentName || 'File'}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold tabular-nums text-heading">
                        {s.status === 'published'
                          ? `${s.totalScore}/${s.maxMarks} (${s.grade})`
                          : 'Needs Grading'}
                      </div>
                      <div
                        className={`text-[11px] font-semibold ${
                          s.status === 'published'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {s.status === 'published' ? 'Published' : 'Submitted'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs lg:col-span-7">
            {!gradingSub || !gradingAssess ? (
              <div className="py-12 text-center text-sm text-muted">
                Select a student submission on the left to review answers, view uploaded PDF/photo work, enter question & overall teacher remarks, and publish results.
              </div>
            ) : (
              <form onSubmit={handleSaveAndPublishGrade} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-heading">
                      {gradingSub.studentName}
                    </h2>
                    <p className="text-xs text-muted">
                      {gradingAssess.title} · {gradingAssess.classLevel} {gradingAssess.subject}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next: Record<string, number> = { ...scoresMap };
                      for (const q of gradingAssess.questions) {
                        if (q.type === 'mcq') {
                          const ans = gradingSub.answers.find((a) => a.questionId === q.id);
                          next[q.id] =
                            ans?.selectedOptionIndex === gradingKey[q.id]?.correctOptionIndex
                              ? q.marks
                              : 0;
                        }
                      }
                      setScoresMap(next);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-accent-sky-soft px-3 py-1.5 text-xs font-semibold text-accent-sky-text hover:opacity-90"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Auto-Score MCQs</span>
                  </button>
                </div>

                {/* Student Uploaded PDF / Photo Display */}
                {gradingSub.attachmentUrl && (
                  <div className="rounded-xl border border-sky-200 dark:border-sky-800/70 bg-accent-sky-soft p-4 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2 text-xs font-bold text-heading">
                        {gradingSub.attachmentType === 'photo' ? (
                          <ImageIcon className="h-4 w-4 text-accent-sky" />
                        ) : (
                          <FileText className="h-4 w-4 text-accent-sky" />
                        )}
                        <span>
                          Student Uploaded {gradingSub.attachmentType === 'photo' ? 'Photo' : 'PDF'}:{' '}
                          {gradingSub.attachmentName || 'Submission Attachment'}
                        </span>
                      </div>
                      <a
                        href={sanitizeSafeUrl(gradingSub.attachmentUrl, 1000)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-btn-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-btn-primary-hover"
                      >
                        <span>Open {gradingSub.attachmentType === 'photo' ? 'Photo' : 'PDF'}</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                    {gradingSub.attachmentType === 'photo' && (
                      <img
                        src={sanitizeSafeUrl(gradingSub.attachmentUrl, 1000)}
                        alt={gradingSub.attachmentName || 'Student uploaded work'}
                        className="max-h-72 rounded-xl border border-border-theme object-contain bg-surface"
                      />
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  {gradingAssess.questions.map((q, idx) => {
                    const ans = gradingSub.answers.find((a) => a.questionId === q.id);
                    const key = gradingKey[q.id];
                    return (
                      <div key={q.id} className="rounded-xl border border-border-theme bg-surface-subtle p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-heading">
                            Q{idx + 1} ({q.type.toUpperCase()})
                          </span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={q.marks}
                              value={scoresMap[q.id] ?? 0}
                              onChange={(e) =>
                                setScoresMap((prev) => ({
                                  ...prev,
                                  [q.id]: Number(e.target.value),
                                }))
                              }
                              className="w-16 rounded-lg border border-border-input bg-input-bg px-2 py-1 text-xs font-mono text-heading"
                            />
                            <span className="text-xs text-muted tabular-nums">
                              / {q.marks}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-heading">{q.prompt}</p>
                        {q.type === 'mcq' ? (
                          <div className="text-xs text-body">
                            Student Selected:{' '}
                            <strong>
                              {ans?.selectedOptionIndex !== null && ans?.selectedOptionIndex !== undefined
                                ? `${String.fromCharCode(65 + ans.selectedOptionIndex)}. ${q.options[ans.selectedOptionIndex]}`
                                : 'No selection'}
                            </strong>{' '}
                            · Correct Key:{' '}
                            <strong className="text-emerald-700 dark:text-emerald-400">
                              {key?.correctOptionIndex !== undefined
                                ? String.fromCharCode(65 + key.correctOptionIndex)
                                : '-'}
                            </strong>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="rounded-lg bg-surface p-2.5 text-xs text-heading border border-border-theme">
                              <strong>Student Answer:</strong> {ans?.textAnswer || 'See uploaded PDF/photo or no written text'}
                            </div>
                            {key?.markingGuide && (
                              <div className="text-xs text-muted">
                                <strong>Marking Guide:</strong> {key.markingGuide}
                              </div>
                            )}
                          </div>
                        )}
                        <div>
                          <input
                            type="text"
                            value={commentsMap[q.id] || ''}
                            onChange={(e) =>
                              setCommentsMap((prev) => ({
                                ...prev,
                                [q.id]: e.target.value,
                              }))
                            }
                            placeholder={`Teacher remark for Q${idx + 1} (optional)...`}
                            className="w-full rounded-lg border border-border-input bg-input-bg px-3 py-1.5 text-xs text-heading"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-body">
                    Overall Teacher Remarks
                  </label>
                  <textarea
                    rows={3}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Constructive feedback and performance remarks for the student..."
                    className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
                  />
                </div>

                <button
                  type="submit"
                  disabled={publishingGrade}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-3 text-sm font-semibold text-white hover:bg-btn-primary-hover"
                >
                  {publishingGrade ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-accent-gold" />
                  )}
                  <span>Save Marks, Remarks & Publish Result</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
