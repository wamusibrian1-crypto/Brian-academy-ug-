import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Video,
  VolumeX,
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
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { LiveClass } from '../../types/academy';
import { formatTimestamp, sanitizeSafeUrl } from '../../lib/validation';
import { logPlatformActivity } from '../../lib/activity';
import { useStudentFeeMute } from '../../hooks/useStudentFeeMute';

interface StudentLiveClassPageProps {
  onBack: () => void;
  onOpenFees?: () => void;
}

export const StudentLiveClassPage: React.FC<StudentLiveClassPageProps> = ({
  onBack,
  onOpenFees,
}) => {
  const { studentProfile, academicSettings } = useAuth();
  const { isMutedUnpaid } = useStudentFeeMute();
  const [lessons, setLessons] = useState<LiveClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState<LiveClass | null>(null);
  const [joinedIds, setJoinedIds] = useState<Record<string, boolean>>({});
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    if (!studentProfile) return;
    const q = query(
      collection(db, 'liveClasses'),
      where('classLevel', '==', studentProfile.classLevel)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as LiveClass);
        list.sort((a, b) => {
          const order = { live: 0, scheduled: 1, ended: 2 };
          return (order[a.status] ?? 3) - (order[b.status] ?? 3);
        });
        setLessons(list);
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'liveClasses')
    );
    return () => unsub();
  }, [studentProfile]);

  if (!studentProfile) return null;

  const handleJoinClass = async (lesson: LiveClass) => {
    setJoiningId(lesson.id);
    const attPath = `liveClasses/${lesson.id}/attendance/${studentProfile.uid}`;
    try {
      await setDoc(doc(db, 'liveClasses', lesson.id, 'attendance', studentProfile.uid), {
        studentUid: studentProfile.uid,
        studentName: studentProfile.fullName,
        studentNumber: studentProfile.studentNumber,
        classLevel: studentProfile.classLevel,
        joinedAt: serverTimestamp(),
      });
      await logPlatformActivity({
        actorId: studentProfile.uid,
        actorName: studentProfile.fullName,
        actorRole: 'student',
        action: 'Joined Live Class',
        details: `${lesson.subject} (${lesson.classLevel}): ${lesson.title}`,
      });
      setJoinedIds((prev) => ({ ...prev, [lesson.id]: true }));
      setActiveLesson(lesson);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, attPath);
    } finally {
      setJoiningId(null);
    }
  };

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
            Live Class · {studentProfile.classLevel}
          </h1>
          <p className="text-xs text-muted">
            Assigned live lessons, classroom notes, and attendance check-in.
          </p>
        </div>
      </div>

      {activeLesson && (
        <div className="rounded-2xl border border-sky-200 dark:border-sky-800/70 bg-surface p-6 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-accent-sky-text">
                {activeLesson.classLevel} · {activeLesson.subject} · Attendance Marked
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-heading">
                {activeLesson.title}
              </h2>
              <p className="mt-1 text-xs text-muted">
                Teacher: {activeLesson.teacherName} · Duration: {activeLesson.durationMinutes} mins
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveLesson(null)}
              className="rounded-xl border border-border-theme bg-surface px-3 py-1.5 text-xs font-semibold text-body hover:bg-surface-muted"
            >
              Close Room View
            </button>
          </div>

          {sanitizeSafeUrl(activeLesson.meetingUrl) && (
            <div className="mt-4 rounded-xl bg-accent-sky-soft p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-medium text-heading">
                Live video broadcast room is open for {activeLesson.classLevel}.
              </div>
              <a
                href={sanitizeSafeUrl(activeLesson.meetingUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-btn-primary px-4 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors"
              >
                <span>Open Live Stream</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}

          {activeLesson.sharedNotes && (
            <div className="mt-4 rounded-xl border border-border-theme bg-surface-subtle p-4">
              <h3 className="text-xs font-bold text-heading">Teacher Lesson Notes</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-body">
                {activeLesson.sharedNotes}
              </p>
            </div>
          )}

          {sanitizeSafeUrl(activeLesson.attachedMaterialUrl) && (
            <div className="mt-3">
              <a
                href={sanitizeSafeUrl(activeLesson.attachedMaterialUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-border-theme bg-surface px-4 py-2 text-xs font-semibold text-heading hover:bg-surface-muted"
              >
                <FileText className="h-4 w-4 text-accent-sky" />
                <span>{activeLesson.attachedMaterialTitle || 'Download Lesson Handout'}</span>
              </a>
            </div>
          )}
        </div>
      )}

      {isMutedUnpaid ? (
        <div className="rounded-2xl border border-border-theme bg-surface p-8 text-center">
          <VolumeX className="mx-auto h-8 w-8 text-faint" />
          <h2 className="mt-3 font-display text-base font-bold text-heading">
            Live Class Muted (Unpaid Fees)
          </h2>
          <p className="mt-1 text-sm text-muted">
            Live Class access is muted while term tuition remains unpaid. Pay via Airtel Money ({academicSettings.supportPhone || '0753336009'}) and upload your screenshot to unlock.
          </p>
          {onOpenFees && (
            <button
              type="button"
              onClick={onOpenFees}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-btn-primary px-5 py-2.5 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors"
            >
              Pay School Fees
            </button>
          )}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-accent-sky" />
        </div>
      ) : lessons.length === 0 ? (
        <div className="rounded-2xl border border-border-theme bg-surface p-8 text-center">
          <Video className="mx-auto h-8 w-8 text-faint" />
          <h2 className="mt-3 font-display text-base font-bold text-heading">
            No Live Classes Scheduled Yet
          </h2>
          <p className="mt-1 text-sm text-muted">
            Your teachers will schedule {studentProfile.classLevel} live sessions here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {lessons.map((lesson) => (
            <div
              key={lesson.id}
              className="flex flex-col justify-between rounded-2xl border border-border-theme bg-surface p-5 shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-accent-sky-text">
                    {lesson.classLevel} · {lesson.subject}
                  </span>
                  <span
                    className={`font-semibold ${
                      lesson.status === 'live'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : lesson.status === 'scheduled'
                          ? 'text-accent-gold-text'
                          : 'text-muted'
                    }`}
                  >
                    {lesson.status === 'live'
                      ? 'Live Now'
                      : lesson.status === 'scheduled'
                        ? 'Scheduled'
                        : 'Completed'}
                  </span>
                </div>
                <h3 className="mt-2 font-display text-lg font-bold text-heading">
                  {lesson.title}
                </h3>
                <p className="mt-1 text-xs text-muted">Instructor: {lesson.teacherName}</p>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-body tabular-nums">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-faint" />
                    {formatTimestamp(lesson.scheduledAt)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-faint" />
                    {lesson.durationMinutes} mins
                  </span>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={joiningId === lesson.id || lesson.status === 'ended'}
                  onClick={() => handleJoinClass(lesson)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-2.5 text-xs font-semibold text-white hover:bg-btn-primary-hover disabled:bg-surface-muted disabled:text-faint transition-colors"
                >
                  {joiningId === lesson.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : joinedIds[lesson.id] ? (
                    <CheckCircle2 className="h-4 w-4 text-accent-gold" />
                  ) : (
                    <Video className="h-4 w-4" />
                  )}
                  <span>
                    {lesson.status === 'ended'
                      ? 'Session Ended'
                      : joinedIds[lesson.id]
                        ? 'Re-open Classroom'
                        : 'Join Live Class'}
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
