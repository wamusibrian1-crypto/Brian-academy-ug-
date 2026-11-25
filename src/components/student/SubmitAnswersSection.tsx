import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  FileUp,
  History,
  Loader2,
  Paperclip,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  Assessment,
  AssessmentSubmission,
  StudentAnswer,
  SubmissionAttachment,
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
import { uploadFileWithFallback } from '../../lib/chunkedUpload';
import { logPlatformActivity } from '../../lib/activity';
import { publishPublicNotice } from '../../lib/publicNotifications';
import {
  canStudentSubmitNow,
  formatDeadlineDisplay,
  getStatusBadgeClasses,
  getSubmissionDisplayStatus,
  isAssessmentOverdue,
  parseDueDateMs,
} from '../../lib/deadlineUtils';
import { ResolvedFileLink, ResolvedImage } from '../ResolvedFileView';

interface SubmitAnswersSectionProps {
  assessment: Assessment;
  existingSubmission?: AssessmentSubmission | null;
  questionAnswers?: Record<string, StudentAnswer>;
  onSubmitted?: (sub: AssessmentSubmission) => void;
  compactHeader?: boolean;
}

export const SubmitAnswersSection: React.FC<SubmitAnswersSectionProps> = ({
  assessment,
  existingSubmission = null,
  questionAnswers,
  onSubmitted,
  compactHeader = false,
}) => {
  const { studentProfile } = useAuth();
  const [attachments, setAttachments] = useState<SubmissionAttachment[]>([]);
  const [writtenAnswer, setWrittenAnswer] = useState('');
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justSubmittedInfo, setJustSubmittedInfo] = useState<{
    title: string;
    fileNames: string[];
    statusLabel: string;
    submittedAtLabel: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showReplaceForm, setShowReplaceForm] = useState(false);

  // Sync draft when switching assessments or opening replacement mode
  useEffect(() => {
    if (!existingSubmission) {
      setAttachments([]);
      setWrittenAnswer('');
      setShowReplaceForm(true);
    } else {
      const existingList: SubmissionAttachment[] =
        existingSubmission.attachments && existingSubmission.attachments.length > 0
          ? existingSubmission.attachments
          : existingSubmission.attachmentUrl
            ? [
                {
                  url: existingSubmission.attachmentUrl,
                  name: existingSubmission.attachmentName || 'Submitted Answer',
                  mimeType: '',
                  fileFormat: detectFileFormat(existingSubmission.attachmentName),
                  sizeBytes: 0,
                },
              ]
            : [];
      setAttachments(existingList);
      setWrittenAnswer(existingSubmission.writtenAnswer || '');
      setShowReplaceForm(existingSubmission.status === 'returned');
    }
    setUploadNotice(null);
    setSubmitError(null);
  }, [assessment.id, existingSubmission?.id, existingSubmission?.status]);

  if (!studentProfile) return null;

  const allowMultiple = assessment.allowMultipleFiles !== false;
  const allowTyped = assessment.allowTypedAnswers !== false;
  const overdue = isAssessmentOverdue(assessment);
  const submitState = canStudentSubmitNow(assessment, existingSubmission);
  const displayStatus = getSubmissionDisplayStatus(assessment, existingSubmission);

  const handleFilesPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (pickedFiles.length === 0) return;

    setSubmitError(null);
    setUploadNotice(null);

    const filesToUpload = allowMultiple ? pickedFiles.slice(0, 10 - attachments.length) : [pickedFiles[0]];
    if (filesToUpload.length === 0) {
      setSubmitError('Maximum of 10 answer files reached for this assignment.');
      return;
    }

    const uploadedItems: SubmissionAttachment[] = [];
    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      setUploadPct(5);
      try {
        const result = await uploadFileWithFallback({
          file,
          storagePath: `submissions/${studentProfile.uid}/${assessment.id}_${Date.now()}_${i}_${safeName}`,
          scope: 'submission',
          ownerUid: studentProfile.uid,
          onProgress: (pct) => setUploadPct(pct),
        });
        uploadedItems.push({
          url: result.url,
          name: sanitizeString(file.name, 160),
          mimeType: sanitizeString(file.type || 'application/octet-stream', 100),
          fileFormat: detectFileFormat(file.name, file.type),
          sizeBytes: result.sizeBytes,
        });
      } catch (err) {
        setSubmitError(
          err instanceof Error
            ? err.message
            : `Failed to upload ${file.name}. Supported formats: PDF, DOC, DOCX, JPG, JPEG, PNG.`
        );
      }
    }

    setUploadPct(null);
    if (uploadedItems.length > 0) {
      setAttachments((prev) =>
        allowMultiple ? [...prev, ...uploadedItems].slice(0, 10) : [uploadedItems[0]]
      );
      setUploadNotice(
        `${uploadedItems.length} file${uploadedItems.length > 1 ? 's' : ''} uploaded and ready to submit.`
      );
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const freshState = canStudentSubmitNow(assessment, existingSubmission);
    if (!freshState.allowed) {
      setSubmitError(freshState.reason || 'Submissions are currently closed.');
      return;
    }

    const cleanWritten = sanitizeString(writtenAnswer, 10000);
    const builtAnswers: StudentAnswer[] = assessment.questions.map((q) => ({
      questionId: q.id,
      selectedOptionIndex: questionAnswers?.[q.id]?.selectedOptionIndex ?? null,
      textAnswer: sanitizeString(questionAnswers?.[q.id]?.textAnswer || '', 2000),
    }));
    const hasQuestionResponses = builtAnswers.some(
      (a) => a.selectedOptionIndex !== null || a.textAnswer.trim().length > 0
    );

    if (attachments.length === 0 && !cleanWritten && !hasQuestionResponses) {
      setSubmitError(
        'Please upload at least one answer file (PDF, DOC, DOCX, JPG, JPEG, PNG) or type your written answer before submitting.'
      );
      return;
    }

    const primaryAttachment = attachments[0];
    const primaryUrl = primaryAttachment ? sanitizeSafeUrl(primaryAttachment.url, 900000) : '';
    const primaryName = primaryAttachment ? sanitizeString(primaryAttachment.name, 200) : '';
    const primaryType = primaryAttachment
      ? detectAttachmentCategory(
          primaryAttachment.name,
          primaryAttachment.url,
          primaryAttachment.mimeType
        )
      : '';

    const dueMs = parseDueDateMs(assessment.dueDate, assessment.dueTimestampMs);
    const isLateNow = dueMs > 0 ? Date.now() > dueMs : false;

    setSubmitting(true);
    const isReplacing = Boolean(existingSubmission);
    const subId = existingSubmission?.id || generateDocId('sub');
    const path = `submissions/${subId}`;

    try {
      if (isReplacing && existingSubmission) {
        await updateDoc(doc(db, 'submissions', subId), {
          answers: builtAnswers,
          writtenAnswer: cleanWritten,
          attachmentUrl: primaryUrl,
          attachmentName: primaryName,
          attachmentType: primaryType,
          attachments,
          isLate: isLateNow,
          status: 'submitted',
          totalScore: 0,
          grade: '',
          teacherRemarks: '',
          corrections: '',
          submittedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'submissions', subId), {
          id: subId,
          assessmentId: assessment.id,
          assessmentTitle: assessment.title,
          kind: assessment.kind,
          classLevel: studentProfile.classLevel,
          subject: assessment.subject,
          studentId: studentProfile.uid,
          studentName: studentProfile.fullName,
          studentNumber: studentProfile.studentNumber,
          answers: builtAnswers,
          writtenAnswer: cleanWritten,
          questionScores: [],
          totalScore: 0,
          maxMarks: assessment.totalMarks,
          grade: '',
          teacherRemarks: '',
          corrections: '',
          attachmentUrl: primaryUrl,
          attachmentName: primaryName,
          attachmentType: primaryType,
          attachments,
          isLate: isLateNow,
          gradedBy: '',
          gradedByName: '',
          status: 'submitted',
          submittedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const fileNames =
        attachments.length > 0
          ? attachments.map((a) => a.name)
          : cleanWritten
            ? ['Written Answer Text']
            : ['Online Assessment Answers'];

      await logPlatformActivity({
        actorId: studentProfile.uid,
        actorName: studentProfile.fullName,
        actorRole: 'student',
        action: isReplacing ? 'Replaced Answer Submission' : 'Submitted Answers',
        details: `${assessment.subject} (${studentProfile.classLevel}): ${assessment.title}`,
      });

      await publishPublicNotice({
        kind: 'submission',
        title: `${assessment.kind === 'test' ? 'Test' : 'Homework'} Answers Submitted`,
        summary: `${studentProfile.classLevel} ${assessment.subject} · Student work uploaded for ${assessment.title}.`,
        subject: assessment.subject,
        classLevel: studentProfile.classLevel,
        createdBy: studentProfile.uid,
      });

      setJustSubmittedInfo({
        title: assessment.title,
        fileNames,
        statusLabel: isLateNow ? 'Late Submission' : 'Submitted',
        submittedAtLabel: new Date().toLocaleString('en-UG', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
      });
      setShowReplaceForm(false);

      if (onSubmitted) {
        onSubmitted({
          id: subId,
          assessmentId: assessment.id,
          assessmentTitle: assessment.title,
          kind: assessment.kind,
          classLevel: studentProfile.classLevel,
          subject: assessment.subject,
          studentId: studentProfile.uid,
          studentName: studentProfile.fullName,
          studentNumber: studentProfile.studentNumber,
          answers: builtAnswers,
          writtenAnswer: cleanWritten,
          questionScores: [],
          totalScore: 0,
          maxMarks: assessment.totalMarks,
          grade: '',
          teacherRemarks: '',
          corrections: '',
          attachmentUrl: primaryUrl,
          attachmentName: primaryName,
          attachmentType: primaryType,
          attachments,
          isLate: isLateNow,
          status: 'submitted',
        });
      }
    } catch (err) {
      handleFirestoreError(
        err,
        isReplacing ? OperationType.UPDATE : OperationType.CREATE,
        path
      );
      setSubmitError(
        'Could not complete submission. Check if the deadline passed or late submissions are disabled.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const existingFilesList: SubmissionAttachment[] =
    existingSubmission?.attachments && existingSubmission.attachments.length > 0
      ? existingSubmission.attachments
      : existingSubmission?.attachmentUrl
        ? [
            {
              url: existingSubmission.attachmentUrl,
              name: existingSubmission.attachmentName || 'Submitted File',
              mimeType: '',
              fileFormat: detectFileFormat(existingSubmission.attachmentName),
              sizeBytes: 0,
            },
          ]
        : [];

  return (
    <section className="rounded-2xl border-2 border-sky-200 dark:border-sky-800/80 bg-surface p-5 sm:p-6 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-3.5">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#0284C7] dark:text-sky-400">
            SUBMIT YOUR ANSWERS
          </div>
          {!compactHeader && (
            <h3 className="mt-0.5 font-display text-lg font-bold text-heading">
              {assessment.title}
            </h3>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-accent-gold-text" />
              <span>
                Deadline: <strong className="text-heading">{formatDeadlineDisplay(assessment)}</strong>
              </span>
            </span>
            <span>· {assessment.totalMarks} Marks</span>
            {overdue && !existingSubmission && (
              <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Overdue</span>
              </span>
            )}
          </div>
        </div>

        <span
          className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-bold ${getStatusBadgeClasses(
            displayStatus
          )}`}
        >
          {displayStatus}
        </span>
      </div>

      {/* Instructions */}
      {assessment.instructions && (
        <div className="rounded-xl border border-sky-100 dark:border-sky-800/60 bg-accent-sky-soft px-4 py-3 text-xs sm:text-sm text-heading whitespace-pre-wrap">
          <strong className="block text-[11px] uppercase tracking-wide text-accent-sky-text mb-1">
            Assignment Instructions
          </strong>
          {assessment.instructions}
        </div>
      )}

      {/* Confirmation Banner */}
      {justSubmittedInfo && (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>Submitted successfully!</span>
          </div>
          <div className="grid grid-cols-1 gap-1 text-xs text-emerald-900 dark:text-emerald-200 sm:grid-cols-2 pt-1">
            <div>
              <strong>Assignment:</strong> {justSubmittedInfo.title}
            </div>
            <div>
              <strong>Submitted at:</strong> {justSubmittedInfo.submittedAtLabel}
            </div>
            <div>
              <strong>File(s):</strong> {justSubmittedInfo.fileNames.join(', ')}
            </div>
            <div>
              <strong>Current status:</strong> {justSubmittedInfo.statusLabel}
            </div>
          </div>
        </div>
      )}

      {/* Existing Submission & History */}
      {existingSubmission && (
        <div className="rounded-xl border border-border-theme bg-surface-subtle p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-heading">
              <History className="h-4 w-4 text-accent-sky" />
              <span>Submission History & Status</span>
            </div>
            <span className="text-[11px] text-muted">
              Submitted {formatTimestamp(existingSubmission.submittedAt)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div>
              <span className="text-muted">Assignment: </span>
              <span className="font-semibold text-heading">{existingSubmission.assessmentTitle}</span>
            </div>
            <div>
              <span className="text-muted">Status: </span>
              <span className="font-bold text-heading">{displayStatus}</span>
            </div>
          </div>

          {existingSubmission.writtenAnswer && (
            <div className="rounded-lg border border-border-theme bg-surface p-3 text-xs text-heading">
              <div className="text-[11px] font-bold text-muted mb-1">Your Written Answer</div>
              <p className="whitespace-pre-wrap">{existingSubmission.writtenAnswer}</p>
            </div>
          )}

          {existingFilesList.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-muted">Submitted Answer File(s)</div>
              <div className="flex flex-wrap gap-2">
                {existingFilesList.map((file, idx) => (
                  <ResolvedFileLink
                    key={`${file.name}_${idx}`}
                    url={file.url}
                    fileName={file.name}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border-theme bg-surface px-3 py-1.5 text-xs font-semibold text-accent-sky-text hover:bg-accent-sky-soft transition-colors"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>{file.name}</span>
                    <ExternalLink className="h-3 w-3" />
                  </ResolvedFileLink>
                ))}
              </div>
            </div>
          )}

          {(displayStatus === 'Marked' || displayStatus === 'Returned for Correction') && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-surface p-3.5 space-y-2">
              {displayStatus === 'Marked' && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    Marks Obtained
                  </span>
                  <span className="font-display text-base font-extrabold text-heading tabular-nums">
                    {existingSubmission.totalScore} / {existingSubmission.maxMarks} (
                    {existingSubmission.grade})
                  </span>
                </div>
              )}
              {existingSubmission.teacherRemarks && (
                <p className="text-xs text-body">
                  <strong>Teacher Comments:</strong> {existingSubmission.teacherRemarks}
                </p>
              )}
              {existingSubmission.corrections && (
                <p className="text-xs text-rose-700 dark:text-rose-300">
                  <strong>Corrections Required:</strong> {existingSubmission.corrections}
                </p>
              )}
            </div>
          )}

          {submitState.allowed && !showReplaceForm && (
            <button
              type="button"
              onClick={() => setShowReplaceForm(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 dark:border-sky-700 bg-accent-sky-soft px-3.5 py-2 text-xs font-semibold text-accent-sky-text hover:opacity-90"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>
                {existingSubmission.status === 'returned'
                  ? 'Upload Corrected Answers'
                  : 'Replace Submission Before Deadline'}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Submission Disabled Notice */}
      {!submitState.allowed && submitState.reason && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-xs font-medium text-amber-900 dark:text-amber-300">
          {submitState.reason}
        </div>
      )}

      {/* Active Upload & Answer Form */}
      {submitState.allowed && showReplaceForm && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {overdue && assessment.allowLateSubmissions !== false && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Deadline has passed. Your submission will be recorded as a Late Submission.
              </span>
            </div>
          )}

          {/* File Pickers (Android Storage + Camera) */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-heading">
                Upload Answer File{allowMultiple ? 's' : ''} (PDF, DOC, DOCX, JPG, JPEG, PNG · up to 20 MB)
              </span>
              {allowMultiple && (
                <span className="text-[11px] font-medium text-muted">
                  Multiple files allowed ({attachments.length}/10)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label className="flex min-h-[46px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sky-300 dark:border-sky-700 bg-accent-sky-soft px-4 py-2.5 text-xs font-bold text-[#0B1F3A] dark:text-white hover:opacity-90 transition-opacity">
                <FileUp className="h-4 w-4 text-[#0284C7] dark:text-sky-300 shrink-0" />
                <span>Upload Answer (Phone Storage)</span>
                <input
                  type="file"
                  multiple={allowMultiple}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png"
                  onChange={handleFilesPicked}
                  className="hidden"
                />
              </label>

              <label className="flex min-h-[46px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-input bg-surface-subtle px-4 py-2.5 text-xs font-semibold text-heading hover:bg-surface-muted transition-colors">
                <Camera className="h-4 w-4 text-accent-gold shrink-0" />
                <span>Take Photo of Written Work</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/*"
                  capture="environment"
                  onChange={handleFilesPicked}
                  className="hidden"
                />
              </label>
            </div>

            {uploadPct !== null && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold text-accent-sky-text tabular-nums">
                  <span>Uploading answer file...</span>
                  <span>{uploadPct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-[#0284C7] transition-all"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              </div>
            )}

            {uploadNotice && (
              <p className="rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                {uploadNotice}
              </p>
            )}

            {attachments.length > 0 && (
              <div className="space-y-2">
                {attachments.map((att, idx) => (
                  <div
                    key={`${att.name}_${idx}`}
                    className="rounded-xl border border-border-theme bg-surface-subtle p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-[#0284C7] shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-heading">{att.name}</div>
                          <div className="text-[11px] text-muted">
                            {att.fileFormat}
                            {att.sizeBytes ? ` · ${formatFileSize(att.sizeBytes)}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <ResolvedFileLink
                          url={att.url}
                          fileName={att.name}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-accent-sky-text hover:underline"
                        >
                          <span>Preview</span>
                          <ExternalLink className="h-3 w-3" />
                        </ResolvedFileLink>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(idx)}
                          className="rounded-lg p-1 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          aria-label={`Remove ${att.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {detectAttachmentCategory(att.name, att.url, att.mimeType) === 'photo' && (
                      <ResolvedImage
                        url={att.url}
                        alt={att.name}
                        className="max-h-44 rounded-lg border border-border-theme object-contain bg-surface"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Direct Typed Answer Option */}
          {allowTyped && (
            <div>
              <label className="block text-xs font-bold text-heading">
                Type Written Answer Directly (Optional)
              </label>
              <textarea
                rows={4}
                value={writtenAnswer}
                onChange={(e) => setWrittenAnswer(e.target.value)}
                placeholder="Write your solutions, steps, or explanations directly here..."
                className="mt-1.5 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2.5 text-sm text-heading focus:border-accent-sky focus:outline-none"
              />
            </div>
          )}

          {submitError && (
            <p className="rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {submitError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="submit"
              disabled={submitting || uploadPct !== null}
              className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-btn-primary px-5 py-3 text-sm font-bold text-white hover:bg-btn-primary-hover disabled:opacity-60 transition-colors"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4 text-[#FACC15]" />
              )}
              <span>{existingSubmission ? 'Update & Submit Answers' : 'Submit Answers'}</span>
            </button>

            {existingSubmission && showReplaceForm && (
              <button
                type="button"
                onClick={() => setShowReplaceForm(false)}
                className="min-h-[46px] rounded-xl border border-border-theme bg-surface px-4 py-2.5 text-xs font-semibold text-body hover:bg-surface-muted"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
};
