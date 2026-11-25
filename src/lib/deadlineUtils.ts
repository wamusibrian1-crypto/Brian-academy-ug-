import { Assessment, AssessmentSubmission } from '../types/academy';

export type DisplaySubmissionStatus =
  | 'Not Submitted'
  | 'Submitted'
  | 'Late Submission'
  | 'Under Review'
  | 'Marked'
  | 'Returned for Correction';

export function parseDueDateMs(dueDate?: string, dueTimestampMs?: number): number {
  if (typeof dueTimestampMs === 'number' && dueTimestampMs > 0) {
    return dueTimestampMs;
  }
  const raw = (dueDate || '').trim();
  if (!raw) return 0;

  // Date-only format YYYY-MM-DD defaults to end of that day (23:59:59 local time)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  }

  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function getSubmittedTimestampMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object' && ts !== null) {
    if ('toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
      return (ts as { toMillis: () => number }).toMillis();
    }
    if ('seconds' in ts) {
      return Number((ts as { seconds?: number }).seconds || 0) * 1000;
    }
  }
  if (typeof ts === 'string') {
    const p = new Date(ts).getTime();
    return Number.isNaN(p) ? 0 : p;
  }
  return 0;
}

export function isAssessmentOverdue(
  assessment: Pick<Assessment, 'dueDate' | 'dueTimestampMs'>,
  nowMs = Date.now()
): boolean {
  const dueMs = parseDueDateMs(assessment.dueDate, assessment.dueTimestampMs);
  if (!dueMs) return false;
  return nowMs > dueMs;
}

export function wasSubmittedLate(
  assessment: Pick<Assessment, 'dueDate' | 'dueTimestampMs'>,
  submission?: Pick<AssessmentSubmission, 'submittedAt' | 'isLate'> | null
): boolean {
  if (!submission) return false;
  const dueMs = parseDueDateMs(assessment.dueDate, assessment.dueTimestampMs);
  const subMs = getSubmittedTimestampMs(submission.submittedAt);
  // Never mark a submission as late if it was submitted on or before the deadline
  if (dueMs > 0 && subMs > 0) {
    return subMs > dueMs;
  }
  return Boolean(submission.isLate);
}

export function getSubmissionDisplayStatus(
  assessment: Pick<Assessment, 'dueDate' | 'dueTimestampMs'>,
  submission?: AssessmentSubmission | null
): DisplaySubmissionStatus {
  if (!submission) return 'Not Submitted';
  if (submission.status === 'returned') return 'Returned for Correction';
  if (submission.status === 'published' || submission.status === 'graded') return 'Marked';
  if (submission.status === 'under_review') return 'Under Review';
  if (wasSubmittedLate(assessment, submission)) return 'Late Submission';
  return 'Submitted';
}

export function getStatusBadgeClasses(status: DisplaySubmissionStatus): string {
  switch (status) {
    case 'Marked':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    case 'Under Review':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800';
    case 'Late Submission':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    case 'Returned for Correction':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    case 'Submitted':
      return 'bg-sky-50 text-[#0B1F3A] dark:bg-sky-950/40 dark:text-sky-200 border-sky-200 dark:border-sky-800';
    default:
      return 'bg-surface-muted text-muted border-border-theme';
  }
}

export function canStudentSubmitNow(
  assessment: Pick<
    Assessment,
    'dueDate' | 'dueTimestampMs' | 'allowLateSubmissions' | 'allowResubmit' | 'closed'
  >,
  existingSubmission?: AssessmentSubmission | null,
  nowMs = Date.now()
): { allowed: boolean; isReplacement: boolean; reason?: string } {
  if (assessment.closed) {
    return {
      allowed: false,
      isReplacement: Boolean(existingSubmission),
      reason: 'Submissions have been closed by your teacher.',
    };
  }

  const overdue = isAssessmentOverdue(assessment, nowMs);

  if (!existingSubmission) {
    if (overdue && assessment.allowLateSubmissions === false) {
      return {
        allowed: false,
        isReplacement: false,
        reason: 'The submission deadline has passed and late submissions are disabled.',
      };
    }
    return { allowed: true, isReplacement: false };
  }

  if (existingSubmission.status === 'returned') {
    return { allowed: true, isReplacement: true };
  }

  if (existingSubmission.status === 'published' || existingSubmission.status === 'graded') {
    return {
      allowed: false,
      isReplacement: true,
      reason: 'This assignment has already been marked.',
    };
  }

  if (existingSubmission.status === 'under_review') {
    return {
      allowed: false,
      isReplacement: true,
      reason: 'Your submission is currently under review by your teacher.',
    };
  }

  if (!assessment.allowResubmit) {
    return {
      allowed: false,
      isReplacement: true,
      reason: 'You have already submitted this assignment.',
    };
  }

  if (overdue) {
    return {
      allowed: false,
      isReplacement: true,
      reason: 'Replacement is only allowed before the submission deadline.',
    };
  }

  return { allowed: true, isReplacement: true };
}

export function formatDeadlineDisplay(
  assessment: Pick<Assessment, 'dueDate' | 'dueTimestampMs'>
): string {
  const ms = parseDueDateMs(assessment.dueDate, assessment.dueTimestampMs);
  if (!ms) return assessment.dueDate || 'No fixed deadline';
  return new Date(ms).toLocaleString('en-UG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
