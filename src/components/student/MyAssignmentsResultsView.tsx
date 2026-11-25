import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Paperclip,
} from 'lucide-react';
import { Assessment, AssessmentSubmission, SUBJECTS, SubjectCode } from '../../types/academy';
import { formatTimestamp, sanitizeSafeUrl } from '../../lib/validation';
import {
  formatDeadlineDisplay,
  getStatusBadgeClasses,
  getSubmissionDisplayStatus,
  isAssessmentOverdue,
} from '../../lib/deadlineUtils';
import { ResolvedFileLink } from '../ResolvedFileView';
import { SubmitAnswersSection } from './SubmitAnswersSection';

interface MyAssignmentsResultsViewProps {
  assessments: Assessment[];
  submissions: AssessmentSubmission[];
}

export const MyAssignmentsResultsView: React.FC<MyAssignmentsResultsViewProps> = ({
  assessments,
  submissions,
}) => {
  const [subjectFilter, setSubjectFilter] = useState<'ALL' | SubjectCode>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'SUBMITTED' | 'MARKED' | 'RETURNED'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const items = assessments.map((asmt) => {
      const sub = submissions.find((s) => s.assessmentId === asmt.id) || null;
      const status = getSubmissionDisplayStatus(asmt, sub);
      return { asmt, sub, status };
    });

    // Also include any historical submissions whose assessment might have been unpublished/removed
    for (const sub of submissions) {
      if (!assessments.some((a) => a.id === sub.assessmentId)) {
        const fallbackAsmt: Assessment = {
          id: sub.assessmentId,
          kind: sub.kind,
          title: sub.assessmentTitle,
          instructions: '',
          classLevel: sub.classLevel,
          subject: sub.subject,
          durationMinutes: 60,
          totalMarks: sub.maxMarks,
          dueDate: '',
          questions: [],
          attachmentUrl: '',
          attachmentName: '',
          attachmentType: '',
          published: true,
          resultsPublished: sub.status === 'published',
          createdBy: '',
          creatorName: '',
        };
        items.push({
          asmt: fallbackAsmt,
          sub,
          status: getSubmissionDisplayStatus(fallbackAsmt, sub),
        });
      }
    }

    return items.filter((row) => {
      if (subjectFilter !== 'ALL' && row.asmt.subject !== subjectFilter) return false;
      if (statusFilter === 'PENDING' && row.status !== 'Not Submitted') return false;
      if (
        statusFilter === 'SUBMITTED' &&
        row.status !== 'Submitted' &&
        row.status !== 'Late Submission' &&
        row.status !== 'Under Review'
      ) {
        return false;
      }
      if (statusFilter === 'MARKED' && row.status !== 'Marked') return false;
      if (statusFilter === 'RETURNED' && row.status !== 'Returned for Correction') return false;
      return true;
    });
  }, [assessments, submissions, subjectFilter, statusFilter]);

  const markedCount = assessments.filter((a) => {
    const s = submissions.find((sub) => sub.assessmentId === a.id);
    return getSubmissionDisplayStatus(a, s) === 'Marked';
  }).length;
  const returnedCount = assessments.filter((a) => {
    const s = submissions.find((sub) => sub.assessmentId === a.id);
    return getSubmissionDisplayStatus(a, s) === 'Returned for Correction';
  }).length;
  const overdueCount = assessments.filter((a) => {
    const s = submissions.find((sub) => sub.assessmentId === a.id);
    return !s && isAssessmentOverdue(a);
  }).length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border-theme bg-surface p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-heading">
              MY ASSIGNMENTS AND RESULTS
            </h2>
            <p className="text-xs text-muted">
              Track your deadlines, submission statuses, marks obtained, teacher comments, and corrections.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold tabular-nums">
            <span className="text-emerald-700 dark:text-emerald-400">
              {markedCount} Marked
            </span>
            {returnedCount > 0 && (
              <span className="text-rose-700 dark:text-rose-400">
                {returnedCount} Returned
              </span>
            )}
            {overdueCount > 0 && (
              <span className="text-amber-700 dark:text-amber-300">
                {overdueCount} Overdue
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value as 'ALL' | SubjectCode)}
            className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
          >
            <option value="ALL">All Subjects</option>
            {SUBJECTS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as 'ALL' | 'PENDING' | 'SUBMITTED' | 'MARKED' | 'RETURNED'
              )
            }
            className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Not Submitted</option>
            <option value="SUBMITTED">Submitted / Under Review</option>
            <option value="MARKED">Marked</option>
            <option value="RETURNED">Returned for Correction</option>
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border-theme bg-surface p-8 text-center">
          <ClipboardCheck className="mx-auto h-8 w-8 text-faint" />
          <h3 className="mt-3 font-display text-base font-bold text-heading">
            No Assignments Match This Filter
          </h3>
          <p className="mt-1 text-xs text-muted">
            Your assignments, deadlines, marks, and teacher feedback will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map(({ asmt, sub, status }) => {
            const isExpanded = expandedId === asmt.id;
            const overdue = !sub && isAssessmentOverdue(asmt);
            const attachmentList =
              sub?.attachments && sub.attachments.length > 0
                ? sub.attachments
                : sub?.attachmentUrl && sanitizeSafeUrl(sub.attachmentUrl, 900000)
                  ? [{ url: sub.attachmentUrl, name: sub.attachmentName || 'Submitted File' }]
                  : [];

            return (
              <div
                key={asmt.id}
                className="rounded-2xl border border-border-theme bg-surface p-5 shadow-xs space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-accent-sky-text">
                      <span>
                        {asmt.subject} · {asmt.classLevel} ·{' '}
                        {asmt.kind === 'homework' ? 'Assignment' : 'Test'}
                      </span>
                      {asmt.topic && <span className="text-muted">· {asmt.topic}</span>}
                    </div>
                    <h3 className="mt-1 font-display text-base sm:text-lg font-bold text-heading">
                      {asmt.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span>
                        Submission date:{' '}
                        <strong className="text-heading">
                          {sub ? formatTimestamp(sub.submittedAt) : 'Not submitted yet'}
                        </strong>
                      </span>
                      <span>· Deadline: {formatDeadlineDisplay(asmt)}</span>
                      {overdue && (
                        <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Overdue
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span
                      className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-bold ${getStatusBadgeClasses(
                        status
                      )}`}
                    >
                      {status}
                    </span>
                    {status === 'Marked' && sub && (
                      <div className="inline-flex items-center gap-1.5 font-display text-base font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        <Award className="h-4 w-4 text-accent-gold" />
                        <span>
                          {sub.totalScore} / {sub.maxMarks} ({sub.grade})
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Marked Feedback & Corrections */}
                {sub && (sub.teacherRemarks || sub.corrections || sub.questionScores?.some((q) => q.comment)) && (
                  <div className="rounded-xl border border-border-theme bg-surface-subtle p-4 space-y-2">
                    {sub.teacherRemarks && (
                      <div className="text-xs text-heading">
                        <strong className="text-accent-sky-text">Teacher Comments: </strong>
                        {sub.teacherRemarks}
                      </div>
                    )}
                    {sub.corrections && (
                      <div className="text-xs text-rose-700 dark:text-rose-300">
                        <strong>Corrections & Guidance: </strong>
                        {sub.corrections}
                      </div>
                    )}
                    {sub.questionScores?.some((qs) => qs.comment) && (
                      <div className="border-t border-border-subtle pt-2 space-y-1">
                        {sub.questionScores.map((qs, qi) =>
                          qs.comment ? (
                            <div key={qs.questionId} className="text-[11px] text-body">
                              <strong>Q{qi + 1} ({qs.score} marks):</strong> {qs.comment}
                            </div>
                          ) : null
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Submitted Files */}
                {attachmentList.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {attachmentList.map((f, idx) => (
                      <ResolvedFileLink
                        key={`${f.name}_${idx}`}
                        url={f.url}
                        fileName={f.name}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border-theme bg-surface-subtle px-3 py-1.5 text-xs font-semibold text-accent-sky-text hover:bg-accent-sky-soft"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        <span>{f.name}</span>
                        <ExternalLink className="h-3 w-3" />
                      </ResolvedFileLink>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : asmt.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-btn-primary px-4 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors"
                  >
                    {status === 'Marked' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-accent-gold" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-accent-gold" />
                    )}
                    <span>
                      {isExpanded
                        ? 'Hide Submission Panel'
                        : sub
                          ? status === 'Returned for Correction'
                            ? 'Upload Corrections'
                            : 'View / Manage Submission'
                          : 'SUBMIT YOUR ANSWERS'}
                    </span>
                  </button>
                </div>

                {isExpanded && (
                  <div className="pt-2">
                    <SubmitAnswersSection assessment={asmt} existingSubmission={sub} compactHeader />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
