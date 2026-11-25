import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Lock,
  LockOpen,
  Paperclip,
  Plus,
  RotateCcw,
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
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
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
  StudentProfile,
  StudyMaterial,
  SubmissionAttachment,
  SubmissionStatus,
  SUBJECTS,
  SubjectCode,
} from '../../types/academy';
import {
  detectAttachmentCategory,
  detectFileFormat,
  formatFileSize,
  formatTimestamp,
  generateDocId,
  sanitizeSafeUrl,
  sanitizeString,
} from '../../lib/validation';
import { triggerFileDownload, uploadFileWithFallback } from '../../lib/chunkedUpload';
import { logPlatformActivity } from '../../lib/activity';
import { publishPublicNotice } from '../../lib/publicNotifications';
import {
  DisplaySubmissionStatus,
  formatDeadlineDisplay,
  getStatusBadgeClasses,
  getSubmissionDisplayStatus,
  isAssessmentOverdue,
  parseDueDateMs,
} from '../../lib/deadlineUtils';
import { ResolvedFileLink, ResolvedImage } from '../ResolvedFileView';

interface QuestionDraft {
  id: string;
  type: 'mcq' | 'structured';
  prompt: string;
  marks: number;
  options: string[];
  correctOptionIndex: number;
  markingGuide: string;
}

function toDatetimeLocalValue(dueDate: string, dueTimestampMs?: number): string {
  if (dueTimestampMs && dueTimestampMs > 0) {
    const d = new Date(dueTimestampMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dueDate)) {
    return dueDate.slice(0, 16);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return `${dueDate}T23:59`;
  }
  return '';
}

export const AdminExaminationsPage: React.FC = () => {
  const { role, adminProfile, teacherProfile, academicSettings } = useAuth();
  const isAdmin = role === 'admin';
  const staffUid = adminProfile?.uid || teacherProfile?.uid || '';
  const staffName = adminProfile?.fullName || teacherProfile?.fullName || 'Staff';

  const allowedSubjects = useMemo<SubjectCode[]>(() => {
    if (isAdmin || !teacherProfile || teacherProfile.subjects.length === 0) {
      return SUBJECTS.map((s) => s.code);
    }
    return teacherProfile.subjects;
  }, [isAdmin, teacherProfile]);

  const allowedClasses = useMemo<ClassLevel[]>(() => {
    if (isAdmin || !teacherProfile || teacherProfile.classes.length === 0) {
      return CLASS_LEVELS.map((c) => c.code);
    }
    return teacherProfile.classes;
  }, [isAdmin, teacherProfile]);

  const [tab, setTab] = useState<'create' | 'submissions'>('create');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [submissions, setSubmissions] = useState<AssessmentSubmission[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / Edit Assignment Builder state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<AssessmentKind>('homework');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [classLevel, setClassLevel] = useState<ClassLevel>(allowedClasses[0] || 'S1');
  const [subject, setSubject] = useState<SubjectCode>(allowedSubjects[0] || 'MTC');
  const [topic, setTopic] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [manualMaxMarks, setManualMaxMarks] = useState(20);
  const [dueDate, setDueDate] = useState('');
  const [allowLateSubmissions, setAllowLateSubmissions] = useState(true);
  const [allowResubmit, setAllowResubmit] = useState(true);
  const [allowMultipleFiles, setAllowMultipleFiles] = useState(true);
  const [allowTypedAnswers, setAllowTypedAnswers] = useState(true);
  const [published, setPublished] = useState(true);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentType, setAttachmentType] = useState<'' | 'pdf' | 'photo' | 'doc' | 'other'>('');
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [formBanner, setFormBanner] = useState<string | null>(null);

  // Student Submissions Monitoring & Marking state
  const [subFilterAsmt, setSubFilterAsmt] = useState<string>('ALL');
  const [subFilterClass, setSubFilterClass] = useState<'ALL' | ClassLevel>('ALL');
  const [subFilterSubject, setSubFilterSubject] = useState<'ALL' | SubjectCode>('ALL');
  const [subFilterStatus, setSubFilterStatus] = useState<'ALL' | DisplaySubmissionStatus>('ALL');
  const [gradingSub, setGradingSub] = useState<AssessmentSubmission | null>(null);
  const [gradingAssess, setGradingAssess] = useState<Assessment | null>(null);
  const [gradingKey, setGradingKey] = useState<Record<string, AnswerKeyEntry>>({});
  const [scoresMap, setScoresMap] = useState<Record<string, number>>({});
  const [commentsMap, setCommentsMap] = useState<Record<string, string>>({});
  const [manualTotalScore, setManualTotalScore] = useState<number>(0);
  const [remarks, setRemarks] = useState('');
  const [corrections, setCorrections] = useState('');
  const [publishingGrade, setPublishingGrade] = useState(false);

  useEffect(() => {
    const unsubA = onSnapshot(
      collection(db, 'assessments'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Assessment);
        list.sort((a, b) => {
          const ta = (a.createdAt as { seconds?: number })?.seconds ?? 0;
          const tb = (b.createdAt as { seconds?: number })?.seconds ?? 0;
          return tb - ta;
        });
        setAssessments(list);
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'assessments')
    );

    const unsubS = onSnapshot(
      collection(db, 'submissions'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as AssessmentSubmission);
        list.sort((a, b) => {
          const ta = (a.updatedAt as { seconds?: number })?.seconds ?? 0;
          const tb = (b.updatedAt as { seconds?: number })?.seconds ?? 0;
          return tb - ta;
        });
        setSubmissions(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'submissions')
    );

    const unsubM = onSnapshot(
      collection(db, 'materials'),
      (snap) => setMaterials(snap.docs.map((d) => d.data() as StudyMaterial)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'materials')
    );

    const unsubStu = onSnapshot(
      collection(db, 'students'),
      (snap) => setStudents(snap.docs.map((d) => d.data() as StudentProfile)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'students')
    );

    return () => {
      unsubA();
      unsubS();
      unsubM();
      unsubStu();
    };
  }, []);

  const scopedAssessments = useMemo(() => {
    if (isAdmin) return assessments;
    return assessments.filter(
      (a) =>
        a.createdBy === staffUid ||
        (allowedSubjects.includes(a.subject) && allowedClasses.includes(a.classLevel))
    );
  }, [assessments, isAdmin, staffUid, allowedSubjects, allowedClasses]);

  const scopedStudents = useMemo(() => {
    const active = students.filter((s) => s.status !== 'suspended');
    if (isAdmin) return active;
    return active.filter((s) => allowedClasses.includes(s.classLevel));
  }, [students, isAdmin, allowedClasses]);

  const scopedSubmissions = useMemo(() => {
    const asmtIds = new Set(scopedAssessments.map((a) => a.id));
    if (isAdmin) return submissions;
    return submissions.filter((s) => asmtIds.has(s.assessmentId) || allowedSubjects.includes(s.subject));
  }, [submissions, scopedAssessments, isAdmin, allowedSubjects]);

  const scopedMaterials = useMemo(() => {
    return materials.filter((m) => isAdmin || allowedSubjects.includes(m.subject));
  }, [materials, isAdmin, allowedSubjects]);

  const resetBuilder = () => {
    setEditingId(null);
    setKind('homework');
    setTitle('');
    setInstructions('');
    setClassLevel(allowedClasses[0] || 'S1');
    setSubject(allowedSubjects[0] || 'MTC');
    setTopic('');
    setMaterialId('');
    setDurationMinutes(45);
    setManualMaxMarks(20);
    setDueDate('');
    setAllowLateSubmissions(true);
    setAllowResubmit(true);
    setAllowMultipleFiles(true);
    setAllowTypedAnswers(true);
    setPublished(true);
    setAttachmentUrl('');
    setAttachmentName('');
    setAttachmentType('');
    setStorageNotice(null);
    setQuestions([]);
  };

  const handleLoadForEdit = async (a: Assessment) => {
    setFormBanner(null);
    setEditingId(a.id);
    setKind(a.kind);
    setTitle(a.title);
    setInstructions(a.instructions || '');
    setClassLevel(a.classLevel);
    setSubject(a.subject);
    setTopic(a.topic || '');
    setMaterialId(a.materialId || '');
    setDurationMinutes(a.durationMinutes || 45);
    setManualMaxMarks(a.totalMarks || 20);
    setDueDate(toDatetimeLocalValue(a.dueDate, a.dueTimestampMs));
    setAllowLateSubmissions(a.allowLateSubmissions !== false);
    setAllowResubmit(a.allowResubmit !== false);
    setAllowMultipleFiles(a.allowMultipleFiles !== false);
    setAllowTypedAnswers(a.allowTypedAnswers !== false);
    setPublished(a.published);
    setAttachmentUrl(a.attachmentUrl || '');
    setAttachmentName(a.attachmentName || '');
    setAttachmentType(a.attachmentType || '');

    let keyAnswers: Record<string, AnswerKeyEntry> = {};
    try {
      const snap = await getDoc(doc(db, 'assessments', a.id, 'private', 'answerKey'));
      if (snap.exists()) {
        keyAnswers = (snap.data() as AssessmentAnswerKey).answers || {};
      }
    } catch {
      // Ignore if private answer key wasn't created
    }

    setQuestions(
      a.questions.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        marks: q.marks,
        options: q.options.length > 0 ? q.options : ['', '', '', ''],
        correctOptionIndex: keyAnswers[q.id]?.correctOptionIndex ?? 0,
        markingGuide: keyAnswers[q.id]?.markingGuide || '',
      }))
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  const handleTeacherWorkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStorageNotice(null);

    const detectedType = detectAttachmentCategory(file.name, '', file.type);
    setAttachmentType(detectedType);
    setAttachmentName(file.name);
    setUploadPct(5);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    try {
      const result = await uploadFileWithFallback({
        file,
        storagePath: `assessments/${classLevel}/${Date.now()}_${safeName}`,
        scope: 'assessment',
        ownerUid: staffUid,
        onProgress: (pct) => setUploadPct(pct),
      });
      setAttachmentUrl(result.url);
      setStorageNotice(
        `${detectFileFormat(file.name, file.type)} uploaded (${formatFileSize(
          result.sizeBytes
        )}) and ready to publish.`
      );
    } catch (err) {
      setStorageNotice(
        err instanceof Error
          ? err.message
          : 'Upload could not complete. You can paste an https:// worksheet link below.'
      );
    } finally {
      setUploadPct(null);
    }
  };

  const handleSaveAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormBanner(null);

    const cleanTitle = sanitizeString(title, 160);
    const cleanQuestions: AssessmentQuestion[] = questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: sanitizeString(q.prompt, 1000),
      marks: Math.max(1, Number(q.marks) || 1),
      options: q.type === 'mcq' ? q.options.map((o) => sanitizeString(o, 240)) : [],
    }));
    const totalMarks =
      cleanQuestions.length > 0
        ? Math.min(500, Math.max(1, cleanQuestions.reduce((acc, q) => acc + q.marks, 0)))
        : Math.min(500, Math.max(1, Number(manualMaxMarks) || 20));

    const answerEntries: Record<string, AnswerKeyEntry> = {};
    for (const q of questions) {
      answerEntries[q.id] =
        q.type === 'mcq'
          ? { correctOptionIndex: q.correctOptionIndex }
          : { markingGuide: sanitizeString(q.markingGuide, 500) };
    }

    const cleanAttachUrl = sanitizeSafeUrl(attachmentUrl, 900000);
    const resolvedAttachType: '' | 'pdf' | 'photo' | 'doc' | 'other' = cleanAttachUrl
      ? attachmentType || detectAttachmentCategory(attachmentName, cleanAttachUrl)
      : '';

    const linkedMat = materials.find((m) => m.id === materialId);
    const cleanDue = sanitizeString(dueDate, 40);
    const dueTimestampMs = parseDueDateMs(cleanDue);
    const id = editingId || generateDocId('asmt');

    try {
      if (editingId) {
        await updateDoc(doc(db, 'assessments', id), {
          kind,
          title: cleanTitle,
          instructions: sanitizeString(instructions, 2000),
          classLevel,
          subject,
          topic: sanitizeString(topic, 160),
          materialId: linkedMat ? linkedMat.id : '',
          materialTitle: linkedMat ? sanitizeString(linkedMat.title, 160) : '',
          durationMinutes: Math.max(5, Math.min(300, Number(durationMinutes) || 45)),
          totalMarks,
          dueDate: cleanDue,
          dueTimestampMs,
          allowLateSubmissions,
          allowResubmit,
          allowMultipleFiles,
          allowTypedAnswers,
          questions: cleanQuestions,
          attachmentUrl: cleanAttachUrl,
          attachmentName: cleanAttachUrl ? sanitizeString(attachmentName || 'Worksheet', 200) : '',
          attachmentType: resolvedAttachType,
          published,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'assessments', id), {
          id,
          kind,
          title: cleanTitle,
          instructions: sanitizeString(instructions, 2000),
          classLevel,
          subject,
          topic: sanitizeString(topic, 160),
          materialId: linkedMat ? linkedMat.id : '',
          materialTitle: linkedMat ? sanitizeString(linkedMat.title, 160) : '',
          durationMinutes: Math.max(5, Math.min(300, Number(durationMinutes) || 45)),
          totalMarks,
          dueDate: cleanDue,
          dueTimestampMs,
          allowLateSubmissions,
          allowResubmit,
          allowMultipleFiles,
          allowTypedAnswers,
          closed: false,
          questions: cleanQuestions,
          attachmentUrl: cleanAttachUrl,
          attachmentName: cleanAttachUrl ? sanitizeString(attachmentName || 'Worksheet', 200) : '',
          attachmentType: resolvedAttachType,
          published,
          resultsPublished: false,
          createdBy: staffUid,
          creatorName: staffName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await setDoc(doc(db, 'assessments', id, 'private', 'answerKey'), {
        answers: answerEntries,
        updatedBy: staffUid,
        updatedAt: serverTimestamp(),
      });

      await logPlatformActivity({
        actorId: staffUid,
        actorName: staffName,
        actorRole: isAdmin ? 'admin' : 'teacher',
        action: editingId
          ? `Updated ${kind === 'test' ? 'Test' : 'Assignment'}`
          : `Created ${kind === 'test' ? 'Test' : 'Assignment'}`,
        details: `${classLevel} ${subject}: ${cleanTitle} (${totalMarks} Marks)`,
      });

      if (!editingId && published) {
        await publishPublicNotice({
          kind: 'assessment',
          title: `New ${kind === 'test' ? 'Test' : 'Assignment'}: ${cleanTitle}`,
          summary: `${classLevel} ${subject} · ${totalMarks} Marks · Due ${
            cleanDue ? formatDeadlineDisplay({ dueDate: cleanDue, dueTimestampMs }) : 'Check schedule'
          }`,
          subject,
          classLevel,
          createdBy: staffUid,
        });
      }

      setFormBanner(
        editingId
          ? `Updated "${cleanTitle}" successfully.`
          : `Saved "${cleanTitle}" (${published ? 'Published to students' : 'Saved as draft'}).`
      );
      resetBuilder();
    } catch (err) {
      handleFirestoreError(
        err,
        editingId ? OperationType.UPDATE : OperationType.CREATE,
        `assessments/${id}`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleClosed = async (a: Assessment) => {
    try {
      await updateDoc(doc(db, 'assessments', a.id), {
        closed: !a.closed,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `assessments/${a.id}`);
    }
  };

  const handleTogglePublishAssessment = async (a: Assessment) => {
    try {
      await updateDoc(doc(db, 'assessments', a.id), {
        published: !a.published,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `assessments/${a.id}`);
    }
  };

  // Submission Matrix for STUDENT SUBMISSIONS tab (combines submitted + missing students!)
  const submissionStats = useMemo(() => {
    const publishedAsmts = scopedAssessments.filter((a) => a.published);
    let expectedPairs = 0;
    let submittedPairs = 0;
    let notSubmittedPairs = 0;
    let lateCount = 0;
    let awaitingMarking = 0;
    let markedCount = 0;

    for (const a of publishedAsmts) {
      const classStudents = scopedStudents.filter((s) => s.classLevel === a.classLevel);
      expectedPairs += classStudents.length;
      for (const stu of classStudents) {
        const sub = scopedSubmissions.find(
          (s) => s.assessmentId === a.id && s.studentId === stu.uid
        );
        const st = getSubmissionDisplayStatus(a, sub);
        if (st === 'Not Submitted') {
          notSubmittedPairs += 1;
        } else {
          submittedPairs += 1;
          if (st === 'Late Submission') lateCount += 1;
          if (st === 'Marked') markedCount += 1;
          if (st === 'Submitted' || st === 'Late Submission' || st === 'Under Review') {
            awaitingMarking += 1;
          }
        }
      }
    }

    return {
      totalAssignments: scopedAssessments.length,
      totalStudents: scopedStudents.length,
      expectedPairs,
      submittedCount: Math.max(submittedPairs, scopedSubmissions.length),
      notSubmittedCount: notSubmittedPairs,
      lateCount: scopedSubmissions.filter((s) => {
        const a = scopedAssessments.find((asmt) => asmt.id === s.assessmentId);
        return a ? getSubmissionDisplayStatus(a, s) === 'Late Submission' || Boolean(s.isLate) : Boolean(s.isLate);
      }).length,
      awaitingMarking: scopedSubmissions.filter(
        (s) => s.status === 'submitted' || s.status === 'under_review'
      ).length,
      markedCount: scopedSubmissions.filter(
        (s) => s.status === 'published' || s.status === 'graded'
      ).length,
    };
  }, [scopedAssessments, scopedStudents, scopedSubmissions]);

  interface SubmissionTableRow {
    key: string;
    studentName: string;
    studentNumber: string;
    classLevel: ClassLevel;
    subject: SubjectCode;
    assessment: Assessment;
    submission: AssessmentSubmission | null;
    displayStatus: DisplaySubmissionStatus;
  }

  const submissionRows = useMemo<SubmissionTableRow[]>(() => {
    const rows: SubmissionTableRow[] = [];
    const seenSubIds = new Set<string>();

    const targetAssessments = scopedAssessments.filter((a) => {
      if (subFilterAsmt !== 'ALL' && a.id !== subFilterAsmt) return false;
      if (subFilterClass !== 'ALL' && a.classLevel !== subFilterClass) return false;
      if (subFilterSubject !== 'ALL' && a.subject !== subFilterSubject) return false;
      return true;
    });

    for (const a of targetAssessments) {
      const subsForA = scopedSubmissions.filter((s) => s.assessmentId === a.id);
      for (const sub of subsForA) {
        seenSubIds.add(sub.id);
        rows.push({
          key: sub.id,
          studentName: sub.studentName,
          studentNumber: sub.studentNumber,
          classLevel: sub.classLevel,
          subject: sub.subject,
          assessment: a,
          submission: sub,
          displayStatus: getSubmissionDisplayStatus(a, sub),
        });
      }

      if (a.published) {
        const classStudents = scopedStudents.filter((stu) => stu.classLevel === a.classLevel);
        for (const stu of classStudents) {
          const alreadyHas = subsForA.some((s) => s.studentId === stu.uid);
          if (!alreadyHas) {
            rows.push({
              key: `missing_${a.id}_${stu.uid}`,
              studentName: stu.fullName,
              studentNumber: stu.studentNumber,
              classLevel: stu.classLevel,
              subject: a.subject,
              assessment: a,
              submission: null,
              displayStatus: 'Not Submitted',
            });
          }
        }
      }
    }

    return rows.filter((r) => {
      if (subFilterStatus !== 'ALL' && r.displayStatus !== subFilterStatus) return false;
      return true;
    });
  }, [
    scopedAssessments,
    scopedSubmissions,
    scopedStudents,
    subFilterAsmt,
    subFilterClass,
    subFilterSubject,
    subFilterStatus,
  ]);

  const openGradingPanel = async (sub: AssessmentSubmission, asmtOverride?: Assessment) => {
    const asmt = asmtOverride || assessments.find((a) => a.id === sub.assessmentId) || null;
    setGradingAssess(asmt);
    setGradingSub(sub);
    setRemarks(sub.teacherRemarks || '');
    setCorrections(sub.corrections || '');
    setManualTotalScore(sub.totalScore || 0);

    let keyAnswers: Record<string, AnswerKeyEntry> = {};
    try {
      const keySnap = await getDoc(doc(db, 'assessments', sub.assessmentId, 'private', 'answerKey'));
      if (keySnap.exists()) {
        keyAnswers = (keySnap.data() as AssessmentAnswerKey).answers || {};
      }
    } catch {
      // Ignore if answerKey absent
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
            initialScores[q.id] = stuAns?.selectedOptionIndex === correctIdx ? q.marks : 0;
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

  const handleSaveSubmissionDecision = async (targetStatus: SubmissionStatus) => {
    if (!gradingSub || !gradingAssess) return;
    setPublishingGrade(true);

    const hasQuestions = gradingAssess.questions.length > 0;
    const questionScores: QuestionScore[] = hasQuestions
      ? gradingAssess.questions.map((q) => ({
          questionId: q.id,
          score: Math.min(q.marks, Math.max(0, Number(scoresMap[q.id]) || 0)),
          comment: sanitizeString(commentsMap[q.id] || '', 400),
        }))
      : [];

    const totalScore = hasQuestions
      ? questionScores.reduce((sum, s) => sum + s.score, 0)
      : Math.min(gradingSub.maxMarks, Math.max(0, Number(manualTotalScore) || 0));

    const computed = computeUgandanGrade(
      totalScore,
      gradingSub.maxMarks,
      academicSettings.gradeBands
    );

    const actionLabel =
      targetStatus === 'published'
        ? 'Marked & Published Result'
        : targetStatus === 'returned'
          ? 'Returned Work for Correction'
          : 'Set Submission Under Review';

    try {
      await updateDoc(doc(db, 'submissions', gradingSub.id), {
        questionScores,
        totalScore,
        grade: targetStatus === 'published' ? computed.grade : '',
        teacherRemarks: sanitizeString(remarks, 1000),
        corrections: sanitizeString(corrections, 2000),
        gradedBy: staffUid,
        gradedByName: staffName,
        status: targetStatus,
        updatedAt: serverTimestamp(),
      });

      await logPlatformActivity({
        actorId: staffUid,
        actorName: staffName,
        actorRole: isAdmin ? 'admin' : 'teacher',
        action: actionLabel,
        details: `${gradingSub.studentName}: ${gradingSub.assessmentTitle} (${totalScore}/${gradingSub.maxMarks} · ${computed.grade})`,
      });

      setGradingSub(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `submissions/${gradingSub.id}`);
    } finally {
      setPublishingGrade(false);
    }
  };

  const liveQuestionTotal = questions.reduce((acc, q) => acc + (Number(q.marks) || 0), 0);

  const gradingAttachments: SubmissionAttachment[] = useMemo(() => {
    if (!gradingSub) return [];
    if (gradingSub.attachments && gradingSub.attachments.length > 0) {
      return gradingSub.attachments;
    }
    if (gradingSub.attachmentUrl && sanitizeSafeUrl(gradingSub.attachmentUrl, 900000)) {
      return [
        {
          url: gradingSub.attachmentUrl,
          name: gradingSub.attachmentName || 'Submission File',
          mimeType: '',
          fileFormat: detectFileFormat(gradingSub.attachmentName),
          sizeBytes: 0,
        },
      ];
    }
    return [];
  }, [gradingSub]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-heading">
            Assignments, Examinations & Student Submissions
          </h1>
          <p className="mt-1 text-sm text-muted">
            Create assignments linked to learning materials, track deadlines, inspect every student submission, mark work, provide corrections, and publish results.
          </p>
        </div>
      </div>

      {/* Top Sub-Tabs */}
      <div className="inline-flex flex-wrap rounded-xl bg-surface-muted p-1 gap-1">
        <button
          type="button"
          onClick={() => setTab('create')}
          className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
            tab === 'create' ? 'bg-surface text-heading shadow-xs' : 'text-muted hover:text-heading'
          }`}
        >
          Assignments & Tests ({scopedAssessments.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('submissions')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
            tab === 'submissions' ? 'bg-surface text-heading shadow-xs' : 'text-muted hover:text-heading'
          }`}
        >
          <span>STUDENT SUBMISSIONS ({scopedSubmissions.length})</span>
          {submissionStats.awaitingMarking > 0 && (
            <span className="rounded-full bg-[#EAB308] px-2 py-0.5 text-[10px] font-extrabold text-[#0B1F3A] tabular-nums">
              {submissionStats.awaitingMarking} to mark
            </span>
          )}
        </button>
      </div>

      {tab === 'create' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Assignment / Assessment Builder */}
          <form
            onSubmit={handleSaveAssessment}
            className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4 lg:col-span-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-heading">
                {editingId ? 'Edit Assignment / Test' : 'Create Assignment or Test'}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={resetBuilder}
                  className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {formBanner && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                {formBanner}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-body">Type</label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as AssessmentKind)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-2.5 py-2 text-xs font-semibold text-heading"
                >
                  <option value="homework">Assignment / Homework</option>
                  <option value="test">Timed Test</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Class</label>
                <select
                  value={classLevel}
                  onChange={(e) => setClassLevel(e.target.value as ClassLevel)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-2.5 py-2 text-xs font-semibold text-heading"
                >
                  {allowedClasses.map((code) => (
                    <option key={code} value={code}>
                      {code}
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
                  {SUBJECTS.filter((s) => allowedSubjects.includes(s.code)).map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">
                  {questions.length > 0 ? 'Duration (min)' : 'Maximum Marks'}
                </label>
                {questions.length > 0 ? (
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-2.5 py-2 text-xs font-semibold text-heading"
                  />
                ) : (
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={manualMaxMarks}
                    onChange={(e) => setManualMaxMarks(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-2.5 py-2 text-xs font-semibold text-heading"
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-body">Assignment Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Mechanics Exercise 2 — Projectile Motion"
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Topic</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Kinematics"
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs text-heading"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-body">
                  Submission Deadline (Date & Time)
                </label>
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">
                  Attach to Learning Material (Optional)
                </label>
                <select
                  value={materialId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setMaterialId(id);
                    const mat = scopedMaterials.find((m) => m.id === id);
                    if (mat) {
                      if (allowedSubjects.includes(mat.subject)) setSubject(mat.subject);
                      if (mat.classLevel !== 'ALL' && allowedClasses.includes(mat.classLevel)) {
                        setClassLevel(mat.classLevel);
                      }
                      if (!topic && mat.topic) setTopic(mat.topic);
                    }
                  }}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
                >
                  <option value="">Standalone (No linked material)</option>
                  {scopedMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      [{m.subject} · {m.classLevel}] {m.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">
                Assignment Instructions
              </label>
              <textarea
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Write clear instructions. Students can submit PDF, Word (DOC/DOCX), photos (JPG/PNG), or typed written answers directly below the material."
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            {/* Policy Toggles */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 rounded-xl border border-border-theme bg-surface-subtle p-3.5 text-xs">
              <label className="flex items-center gap-2 font-medium text-heading cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowLateSubmissions}
                  onChange={(e) => setAllowLateSubmissions(e.target.checked)}
                />
                <span>Allow Late Submissions</span>
              </label>
              <label className="flex items-center gap-2 font-medium text-heading cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowResubmit}
                  onChange={(e) => setAllowResubmit(e.target.checked)}
                />
                <span>Allow Replace Before Deadline</span>
              </label>
              <label className="flex items-center gap-2 font-medium text-heading cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowMultipleFiles}
                  onChange={(e) => setAllowMultipleFiles(e.target.checked)}
                />
                <span>Allow Multiple Answer Files</span>
              </label>
              <label className="flex items-center gap-2 font-medium text-heading cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowTypedAnswers}
                  onChange={(e) => setAllowTypedAnswers(e.target.checked)}
                />
                <span>Allow Direct Typed Answers</span>
              </label>
              <label className="flex items-center gap-2 font-semibold text-accent-sky-text cursor-pointer sm:col-span-2">
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                />
                <span>Publish assignment to students immediately</span>
              </label>
            </div>

            {/* Teacher Assignment Attachment */}
            <div className="rounded-xl border border-border-theme bg-surface-subtle p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-heading">
                    Assignment Worksheet / Attachment (Optional PDF, Word, or Photo)
                  </h3>
                  <p className="text-[11px] text-muted">
                    Attach a question sheet or diagram for students to download and answer.
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
                    Remove File
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-input bg-surface px-3 py-2.5 text-xs font-semibold text-heading hover:bg-surface-muted sm:col-span-2">
                  <FileUp className="h-4 w-4 text-accent-sky shrink-0" />
                  <span className="truncate">
                    {attachmentName || 'Upload Question Paper (PDF / DOC / Photo)'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,image/*,application/pdf"
                    onChange={handleTeacherWorkUpload}
                    className="hidden"
                  />
                </label>

                <select
                  value={attachmentType}
                  onChange={(e) =>
                    setAttachmentType(
                      e.target.value as '' | 'pdf' | 'photo' | 'doc' | 'other'
                    )
                  }
                  className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
                >
                  <option value="">Auto Format</option>
                  <option value="pdf">PDF Document</option>
                  <option value="doc">Word Document</option>
                  <option value="photo">Photo / Diagram</option>
                </select>
              </div>

              {uploadPct !== null && (
                <div className="text-xs font-semibold text-accent-sky-text tabular-nums">
                  Uploading attachment: {uploadPct}%
                </div>
              )}
              {storageNotice && (
                <p className="rounded-lg bg-amber-50 dark:bg-amber-950/50 p-2.5 text-xs text-amber-900 dark:text-amber-300">
                  {storageNotice}
                </p>
              )}
            </div>

            {/* Optional Online Questions Builder */}
            <div className="space-y-3 border-t border-border-subtle pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-heading">
                    Interactive Questions ({questions.length}) ·{' '}
                    {questions.length > 0
                      ? `Total Marks: ${liveQuestionTotal}`
                      : `File/Written Assignment (${manualMaxMarks} Marks)`}
                  </h3>
                  <p className="text-[11px] text-muted">
                    Leave at 0 questions for document/written assignments, or add MCQ/structured items.
                  </p>
                </div>
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
                <div
                  key={q.id}
                  className="rounded-xl border border-border-theme bg-surface-subtle p-4 space-y-3"
                >
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
                    placeholder="Enter question prompt..."
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
              disabled={saving || uploadPct !== null}
              className="inline-flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-3 text-sm font-bold text-white hover:bg-btn-primary-hover disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ClipboardCheck className="h-4 w-4 text-[#FACC15]" />
              )}
              <span>
                {editingId
                  ? 'Save Assignment Changes'
                  : published
                    ? `Publish ${kind === 'test' ? 'Test' : 'Assignment'}`
                    : `Save ${kind === 'test' ? 'Test' : 'Assignment'} Draft`}
              </span>
            </button>
          </form>

          {/* Existing Assessments Panel */}
          <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs lg:col-span-5">
            <h2 className="font-display text-base font-bold text-heading">
              Created Assignments & Tests ({scopedAssessments.length})
            </h2>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-accent-sky" />
              </div>
            ) : scopedAssessments.length === 0 ? (
              <p className="mt-3 text-xs text-muted">No assignments or tests created yet.</p>
            ) : (
              <div className="mt-4 divide-y divide-border-subtle">
                {scopedAssessments.map((a) => {
                  const canEdit =
                    isAdmin ||
                    a.createdBy === staffUid ||
                    allowedSubjects.includes(a.subject);
                  const overdue = isAssessmentOverdue(a);
                  const subCount = scopedSubmissions.filter((s) => s.assessmentId === a.id).length;

                  return (
                    <div key={a.id} className="py-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-accent-sky-text">
                            <span>
                              {a.classLevel} · {a.subject} ·{' '}
                              {a.kind === 'homework' ? 'Assignment' : 'Test'}
                            </span>
                            {a.topic && <span className="text-muted">· {a.topic}</span>}
                            {!a.published && (
                              <span className="text-amber-700 dark:text-amber-300">· Draft</span>
                            )}
                            {a.closed && (
                              <span className="text-rose-600 dark:text-rose-400">· Closed</span>
                            )}
                          </div>
                          <div className="font-display text-sm font-bold text-heading mt-0.5">
                            {a.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted tabular-nums">
                            <span>{a.totalMarks} Marks</span>
                            <span>· {subCount} submitted</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3 text-accent-gold" />
                              {formatDeadlineDisplay(a)}
                            </span>
                            {overdue && (
                              <span className="font-bold text-rose-600 dark:text-rose-400">
                                · Overdue
                              </span>
                            )}
                          </div>

                          {a.materialTitle && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                              <BookOpen className="h-3 w-3" />
                              <span>Linked to: {a.materialTitle}</span>
                            </div>
                          )}

                          {a.attachmentUrl && sanitizeSafeUrl(a.attachmentUrl, 900000) && (
                            <div>
                              <ResolvedFileLink
                                url={a.attachmentUrl}
                                fileName={a.attachmentName}
                                className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-accent-sky-text hover:underline"
                              >
                                {a.attachmentType === 'photo' ? (
                                  <ImageIcon className="h-3 w-3" />
                                ) : (
                                  <FileText className="h-3 w-3" />
                                )}
                                <span>{a.attachmentName || 'Worksheet'}</span>
                                <ExternalLink className="h-3 w-3" />
                              </ResolvedFileLink>
                            </div>
                          )}
                        </div>
                      </div>

                      {canEdit && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleLoadForEdit(a)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border-theme bg-surface-subtle px-2.5 py-1 text-[11px] font-semibold text-heading hover:bg-surface-muted"
                          >
                            <Edit3 className="h-3 w-3" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleTogglePublishAssessment(a)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border-theme bg-surface-subtle px-2.5 py-1 text-[11px] font-semibold text-heading hover:bg-surface-muted"
                          >
                            {a.published ? (
                              <>
                                <EyeOff className="h-3 w-3 text-amber-600" />
                                <span>Unpublish</span>
                              </>
                            ) : (
                              <>
                                <Eye className="h-3 w-3 text-emerald-600" />
                                <span>Publish</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleClosed(a)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border-theme bg-surface-subtle px-2.5 py-1 text-[11px] font-semibold text-heading hover:bg-surface-muted"
                          >
                            {a.closed ? (
                              <>
                                <LockOpen className="h-3 w-3 text-emerald-600" />
                                <span>Reopen</span>
                              </>
                            ) : (
                              <>
                                <Lock className="h-3 w-3 text-rose-600" />
                                <span>Close</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSubFilterAsmt(a.id);
                              setTab('submissions');
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-accent-sky-soft px-2.5 py-1 text-[11px] font-bold text-accent-sky-text hover:opacity-90"
                          >
                            <span>Submissions ({subCount})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteDoc(doc(db, 'assessments', a.id))}
                            className="ml-auto rounded-lg p-1.5 text-faint hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 dark:hover:text-rose-400"
                            aria-label="Delete assignment"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PART 6: STUDENT SUBMISSIONS MANAGEMENT */}
      {tab === 'submissions' && (
        <div className="space-y-6">
          {/* 7 Submission Overview KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <div className="rounded-2xl border border-border-theme bg-surface p-3.5">
              <div className="text-[11px] font-medium text-muted">Assignments</div>
              <div className="mt-1 font-display text-xl font-bold text-heading tabular-nums">
                {submissionStats.totalAssignments}
              </div>
            </div>
            <div className="rounded-2xl border border-border-theme bg-surface p-3.5">
              <div className="text-[11px] font-medium text-muted">Students</div>
              <div className="mt-1 font-display text-xl font-bold text-heading tabular-nums">
                {submissionStats.totalStudents}
              </div>
            </div>
            <div className="rounded-2xl border border-border-theme bg-surface p-3.5">
              <div className="text-[11px] font-medium text-muted">Submitted</div>
              <div className="mt-1 font-display text-xl font-bold text-accent-sky-text tabular-nums">
                {submissionStats.submittedCount}
              </div>
            </div>
            <div className="rounded-2xl border border-border-theme bg-surface p-3.5">
              <div className="text-[11px] font-medium text-muted">Not Submitted</div>
              <div className="mt-1 font-display text-xl font-bold text-heading tabular-nums">
                {submissionStats.notSubmittedCount}
              </div>
            </div>
            <div className="rounded-2xl border border-border-theme bg-surface p-3.5">
              <div className="text-[11px] font-medium text-muted">Late</div>
              <div className="mt-1 font-display text-xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                {submissionStats.lateCount}
              </div>
            </div>
            <div className="rounded-2xl border border-border-theme bg-surface p-3.5">
              <div className="text-[11px] font-medium text-muted">Awaiting Marking</div>
              <div className="mt-1 font-display text-xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                {submissionStats.awaitingMarking}
              </div>
            </div>
            <div className="rounded-2xl border border-border-theme bg-surface p-3.5">
              <div className="text-[11px] font-medium text-muted">Marked</div>
              <div className="mt-1 font-display text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {submissionStats.markedCount}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-border-theme bg-surface p-4">
            <select
              value={subFilterAsmt}
              onChange={(e) => setSubFilterAsmt(e.target.value)}
              className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading max-w-[260px]"
            >
              <option value="ALL">All Assignments</option>
              {scopedAssessments.map((a) => (
                <option key={a.id} value={a.id}>
                  [{a.classLevel} {a.subject}] {a.title}
                </option>
              ))}
            </select>

            <select
              value={subFilterClass}
              onChange={(e) => setSubFilterClass(e.target.value as 'ALL' | ClassLevel)}
              className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
            >
              <option value="ALL">All Classes</option>
              {allowedClasses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={subFilterSubject}
              onChange={(e) => setSubFilterSubject(e.target.value as 'ALL' | SubjectCode)}
              className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
            >
              <option value="ALL">All Subjects</option>
              {allowedSubjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={subFilterStatus}
              onChange={(e) =>
                setSubFilterStatus(e.target.value as 'ALL' | DisplaySubmissionStatus)
              }
              className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
            >
              <option value="ALL">All Statuses</option>
              <option value="Submitted">Submitted</option>
              <option value="Late Submission">Late Submission</option>
              <option value="Under Review">Under Review</option>
              <option value="Marked">Marked</option>
              <option value="Returned for Correction">Returned for Correction</option>
              <option value="Not Submitted">Not Submitted</option>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Organised Student Submissions Table */}
            <div className="rounded-2xl border border-border-theme bg-surface p-5 shadow-xs lg:col-span-6 overflow-hidden">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-border-subtle">
                <h2 className="font-display text-base font-bold text-heading">
                  STUDENT SUBMISSIONS ({submissionRows.length})
                </h2>
              </div>

              {submissionRows.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted">
                  No student records match the selected filters.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wider text-muted">
                        <th className="py-2 pr-3">Student</th>
                        <th className="py-2 pr-3">Class · Subject</th>
                        <th className="py-2 pr-3">Assignment</th>
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3 text-right">Marks</th>
                        <th className="py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {submissionRows.map((row) => {
                        const isSelected = Boolean(
                          row.submission && gradingSub?.id === row.submission.id
                        );
                        return (
                          <tr
                            key={row.key}
                            className={`transition-colors ${
                              isSelected ? 'bg-accent-sky-soft' : 'hover:bg-surface-subtle'
                            }`}
                          >
                            <td className="py-3 pr-3">
                              <div className="font-bold text-heading">{row.studentName}</div>
                              {row.studentNumber && (
                                <div className="text-[10px] text-muted">{row.studentNumber}</div>
                              )}
                            </td>
                            <td className="py-3 pr-3 whitespace-nowrap text-body">
                              {row.classLevel} · {row.subject}
                            </td>
                            <td className="py-3 pr-3 max-w-[160px] truncate font-medium text-heading">
                              {row.assessment.title}
                            </td>
                            <td className="py-3 pr-3 whitespace-nowrap text-muted">
                              {row.submission ? formatTimestamp(row.submission.submittedAt) : '—'}
                            </td>
                            <td className="py-3 pr-3 whitespace-nowrap">
                              <span
                                className={`inline-flex rounded-lg border px-2 py-0.5 text-[10px] font-bold ${getStatusBadgeClasses(
                                  row.displayStatus
                                )}`}
                              >
                                {row.displayStatus}
                              </span>
                            </td>
                            <td className="py-3 pr-3 text-right font-mono font-bold text-heading whitespace-nowrap tabular-nums">
                              {row.submission && row.displayStatus === 'Marked'
                                ? `${row.submission.totalScore}/${row.submission.maxMarks} (${row.submission.grade})`
                                : row.submission
                                  ? `— / ${row.submission.maxMarks}`
                                  : '—'}
                            </td>
                            <td className="py-3 text-right whitespace-nowrap">
                              {row.submission ? (
                                <button
                                  type="button"
                                  onClick={() => openGradingPanel(row.submission!, row.assessment)}
                                  className="rounded-lg bg-btn-primary px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-btn-primary-hover"
                                >
                                  Open & Mark
                                </button>
                              ) : (
                                <span className="text-[11px] text-faint">Pending</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Marking, Preview, Download, Corrections & Result Publication Panel */}
            <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs lg:col-span-6">
              {!gradingSub || !gradingAssess ? (
                <div className="py-16 text-center text-sm text-muted">
                  Select a submitted student entry from the table to preview or download submitted files, enter marks, write comments or corrections, return work, or publish final results.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border-subtle pb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-lg font-bold text-heading">
                          {gradingSub.studentName}
                        </h2>
                        <span
                          className={`inline-flex rounded-lg border px-2 py-0.5 text-[10px] font-bold ${getStatusBadgeClasses(
                            getSubmissionDisplayStatus(gradingAssess, gradingSub)
                          )}`}
                        >
                          {getSubmissionDisplayStatus(gradingAssess, gradingSub)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {gradingAssess.title} · {gradingAssess.classLevel} {gradingAssess.subject} ·
                        Submitted {formatTimestamp(gradingSub.submittedAt)}
                      </p>
                    </div>

                    {gradingAssess.questions.length > 0 && (
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
                    )}
                  </div>

                  {/* Submitted Answer Files (Open, Preview & Download) */}
                  {gradingAttachments.length > 0 && (
                    <div className="rounded-xl border border-sky-200 dark:border-sky-800/70 bg-accent-sky-soft p-4 space-y-3">
                      <div className="text-xs font-bold text-heading">
                        Student Submitted Documents ({gradingAttachments.length})
                      </div>
                      {gradingAttachments.map((att, idx) => {
                        const category = detectAttachmentCategory(att.name, att.url, att.mimeType);
                        return (
                          <div
                            key={`${att.name}_${idx}`}
                            className="rounded-xl border border-border-theme bg-surface p-3 space-y-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {category === 'photo' ? (
                                  <ImageIcon className="h-4 w-4 text-accent-gold shrink-0" />
                                ) : (
                                  <Paperclip className="h-4 w-4 text-accent-sky shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-bold text-heading">
                                    {att.name}
                                  </div>
                                  <div className="text-[10px] text-muted">
                                    {att.fileFormat || detectFileFormat(att.name)}
                                    {att.sizeBytes ? ` · ${formatFileSize(att.sizeBytes)}` : ''}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <ResolvedFileLink
                                  url={att.url}
                                  fileName={att.name}
                                  className="inline-flex items-center gap-1 rounded-lg bg-btn-primary px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-btn-primary-hover"
                                >
                                  <span>Preview</span>
                                  <ExternalLink className="h-3 w-3" />
                                </ResolvedFileLink>
                                <button
                                  type="button"
                                  onClick={() => void triggerFileDownload(att.url, att.name)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-border-theme bg-surface-subtle px-2.5 py-1.5 text-[11px] font-semibold text-heading hover:bg-surface-muted"
                                >
                                  <Download className="h-3 w-3" />
                                  <span>Download</span>
                                </button>
                              </div>
                            </div>
                            {category === 'photo' && (
                              <ResolvedImage
                                url={att.url}
                                alt={att.name}
                                className="max-h-64 rounded-lg border border-border-theme object-contain bg-surface-subtle"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Direct Written Answer */}
                  {gradingSub.writtenAnswer && (
                    <div className="rounded-xl border border-border-theme bg-surface-subtle p-4 space-y-1.5">
                      <div className="text-xs font-bold text-heading">
                        Student Direct Written Answer
                      </div>
                      <p className="text-xs sm:text-sm text-body whitespace-pre-wrap">
                        {gradingSub.writtenAnswer}
                      </p>
                    </div>
                  )}

                  {/* Interactive Question Marking OR Direct Assignment Marks */}
                  {gradingAssess.questions.length > 0 ? (
                    <div className="space-y-3">
                      {gradingAssess.questions.map((q, idx) => {
                        const ans = gradingSub.answers.find((a) => a.questionId === q.id);
                        const key = gradingKey[q.id];
                        return (
                          <div
                            key={q.id}
                            className="rounded-xl border border-border-theme bg-surface-subtle p-4 space-y-2"
                          >
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
                                <span className="text-xs text-muted tabular-nums">/ {q.marks}</span>
                              </div>
                            </div>
                            <p className="text-sm text-heading">{q.prompt}</p>
                            {q.type === 'mcq' ? (
                              <div className="text-xs text-body">
                                Student Selected:{' '}
                                <strong>
                                  {ans?.selectedOptionIndex !== null &&
                                  ans?.selectedOptionIndex !== undefined
                                    ? `${String.fromCharCode(65 + ans.selectedOptionIndex)}. ${
                                        q.options[ans.selectedOptionIndex]
                                      }`
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
                                  <strong>Student Answer:</strong>{' '}
                                  {ans?.textAnswer || 'See uploaded document(s)'}
                                </div>
                                {key?.markingGuide && (
                                  <div className="text-xs text-muted">
                                    <strong>Marking Guide:</strong> {key.markingGuide}
                                  </div>
                                )}
                              </div>
                            )}
                            <input
                              type="text"
                              value={commentsMap[q.id] || ''}
                              onChange={(e) =>
                                setCommentsMap((prev) => ({
                                  ...prev,
                                  [q.id]: e.target.value,
                                }))
                              }
                              placeholder={`Teacher comment for Q${idx + 1} (optional)...`}
                              className="w-full rounded-lg border border-border-input bg-input-bg px-3 py-1.5 text-xs text-heading"
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border-theme bg-surface-subtle p-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <label className="block text-xs font-bold text-heading">
                          Marks Awarded (out of {gradingSub.maxMarks})
                        </label>
                        <p className="text-[11px] text-muted">
                          Auto-grade:{' '}
                          <strong className="text-heading">
                            {
                              computeUgandanGrade(
                                manualTotalScore,
                                gradingSub.maxMarks,
                                academicSettings.gradeBands
                              ).grade
                            }
                          </strong>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={gradingSub.maxMarks}
                          value={manualTotalScore}
                          onChange={(e) => setManualTotalScore(Number(e.target.value))}
                          className="w-24 rounded-xl border border-border-input bg-input-bg px-3 py-2 text-sm font-mono font-bold text-heading"
                        />
                        <span className="text-sm font-semibold text-muted tabular-nums">
                          / {gradingSub.maxMarks}
                        </span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-body">
                      Teacher Comments & Overall Feedback
                    </label>
                    <textarea
                      rows={2}
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Write constructive feedback on strengths and areas to improve..."
                      className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-body">
                      Corrections / Working Guidance
                    </label>
                    <textarea
                      rows={3}
                      value={corrections}
                      onChange={(e) => setCorrections(e.target.value)}
                      placeholder="Provide step-by-step corrections or instructions if returning work for correction..."
                      className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 pt-1">
                    <button
                      type="button"
                      disabled={publishingGrade}
                      onClick={() => void handleSaveSubmissionDecision('under_review')}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-sky-300 dark:border-sky-700 bg-accent-sky-soft px-3 py-2.5 text-xs font-bold text-accent-sky-text hover:opacity-90"
                    >
                      <Clock className="h-4 w-4" />
                      <span>Mark Under Review</span>
                    </button>

                    <button
                      type="button"
                      disabled={publishingGrade}
                      onClick={() => void handleSaveSubmissionDecision('returned')}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 px-3 py-2.5 text-xs font-bold text-rose-700 dark:text-rose-300 hover:opacity-90"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>Return for Correction</span>
                    </button>

                    <button
                      type="button"
                      disabled={publishingGrade}
                      onClick={() => void handleSaveSubmissionDecision('published')}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-btn-primary px-3 py-2.5 text-xs font-bold text-white hover:bg-btn-primary-hover"
                    >
                      {publishingGrade ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-[#FACC15]" />
                      )}
                      <span>Publish Results</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
