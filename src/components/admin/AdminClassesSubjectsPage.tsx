import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  FileUp,
  Loader2,
  Play,
  Plus,
  Square,
  Trash2,
  Users,
  Video,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, handleFirestoreError, OperationType, storage } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  CLASS_LEVELS,
  ClassLevel,
  Course,
  LiveAttendance,
  LiveClass,
  MATERIAL_TYPES,
  MaterialType,
  StudyMaterial,
  SUBJECTS,
  SubjectCode,
} from '../../types/academy';
import {
  formatTimestamp,
  generateDocId,
  sanitizeSafeUrl,
  sanitizeString,
} from '../../lib/validation';
import { logPlatformActivity } from '../../lib/activity';

export const AdminClassesSubjectsPage: React.FC = () => {
  const { role, adminProfile, teacherProfile } = useAuth();
  const isAdmin = role === 'admin';
  const staffUid = adminProfile?.uid || teacherProfile?.uid || '';
  const staffName = adminProfile?.fullName || teacherProfile?.fullName || 'Staff';

  const [tab, setTab] = useState<'courses' | 'materials' | 'live'>('courses');
  const [courses, setCourses] = useState<Course[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const [loading, setLoading] = useState(true);

  // Course creation state (Admin only)
  const [courseClass, setCourseClass] = useState<ClassLevel>('S1');
  const [courseSubject, setCourseSubject] = useState<SubjectCode>('MTC');
  const [courseTitle, setCourseTitle] = useState('');
  const [courseDesc, setCourseDesc] = useState('');
  const [courseTopicsText, setCourseTopicsText] = useState('');
  const [savingCourse, setSavingCourse] = useState(false);

  // Study Material upload state
  const [matTitle, setMatTitle] = useState('');
  const [matDesc, setMatDesc] = useState('');
  const [matClass, setMatClass] = useState<ClassLevel>('S1');
  const [matSubject, setMatSubject] = useState<SubjectCode>('MTC');
  const [matType, setMatType] = useState<MaterialType>('pdf');
  const [matUrl, setMatUrl] = useState('');
  const [matFileName, setMatFileName] = useState('');
  const [matInline, setMatInline] = useState('');
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [savingMat, setSavingMat] = useState(false);

  // Live Class schedule state
  const [liveTitle, setLiveTitle] = useState('');
  const [liveClass, setLiveClass] = useState<ClassLevel>('S1');
  const [liveSubject, setLiveSubject] = useState<SubjectCode>('MTC');
  const [liveDate, setLiveDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [liveDuration, setLiveDuration] = useState(60);
  const [liveMeetingUrl, setLiveMeetingUrl] = useState('');
  const [liveNotes, setLiveNotes] = useState('');
  const [liveMatTitle, setLiveMatTitle] = useState('');
  const [liveMatUrl, setLiveMatUrl] = useState('');
  const [savingLive, setSavingLive] = useState(false);
  const [attendanceLessonId, setAttendanceLessonId] = useState<string | null>(null);
  const [attendanceList, setAttendanceList] = useState<LiveAttendance[]>([]);

  useEffect(() => {
    const unsubC = onSnapshot(
      collection(db, 'courses'),
      (snap) => {
        setCourses(snap.docs.map((d) => d.data() as Course));
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'courses')
    );
    const unsubM = onSnapshot(
      collection(db, 'materials'),
      (snap) => setMaterials(snap.docs.map((d) => d.data() as StudyMaterial)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'materials')
    );
    const unsubL = onSnapshot(
      collection(db, 'liveClasses'),
      (snap) => setLiveClasses(snap.docs.map((d) => d.data() as LiveClass)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'liveClasses')
    );
    return () => {
      unsubC();
      unsubM();
      unsubL();
    };
  }, []);

  useEffect(() => {
    if (!attendanceLessonId) {
      setAttendanceList([]);
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'liveClasses', attendanceLessonId, 'attendance'),
      (snap) => setAttendanceList(snap.docs.map((d) => d.data() as LiveAttendance)),
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `liveClasses/${attendanceLessonId}/attendance`)
    );
    return () => unsub();
  }, [attendanceLessonId]);

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSavingCourse(true);
    const id = generateDocId('course');
    const topics = courseTopicsText
      .split('\n')
      .map((t) => sanitizeString(t, 120))
      .filter(Boolean)
      .slice(0, 20);
    try {
      await setDoc(doc(db, 'courses', id), {
        id,
        classLevel: courseClass,
        subject: courseSubject,
        title: sanitizeString(courseTitle, 140),
        description: sanitizeString(courseDesc, 1000),
        teacherId: staffUid,
        teacherName: staffName,
        topics,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCourseTitle('');
      setCourseDesc('');
      setCourseTopicsText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `courses/${id}`);
    } finally {
      setSavingCourse(false);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStorageNotice(null);
    setMatFileName(file.name);
    const storagePath = `materials/${matClass}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      'state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setUploadPct(pct);
      },
      (err) => {
        setUploadPct(null);
        setStorageNotice(
          `Firebase Storage upload requires Storage rules to be enabled in Firebase Console (${err.code}). You can still paste an external Resource / Video URL or enter inline lesson notes below.`
        );
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setMatUrl(url);
        setUploadPct(null);
      }
    );
  };

  const handlePublishMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMat(true);
    const id = generateDocId('mat');
    try {
      await setDoc(doc(db, 'materials', id), {
        id,
        title: sanitizeString(matTitle, 160),
        description: sanitizeString(matDesc, 1500),
        classLevel: matClass,
        subject: matSubject,
        materialType: matType,
        fileUrl: sanitizeSafeUrl(matUrl, 1000),
        inlineContent: sanitizeString(matInline, 20000),
        fileName: sanitizeString(matFileName, 200),
        uploadedBy: staffUid,
        uploaderName: staffName,
        published: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logPlatformActivity({
        actorId: staffUid,
        actorName: staffName,
        actorRole: isAdmin ? 'admin' : 'teacher',
        action: 'Published Study Material',
        details: `${matClass} ${matSubject} (${matType}): ${matTitle}`,
      });
      setMatTitle('');
      setMatDesc('');
      setMatUrl('');
      setMatFileName('');
      setMatInline('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `materials/${id}`);
    } finally {
      setSavingMat(false);
    }
  };

  const handleCreateLiveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLive(true);
    const id = generateDocId('live');
    try {
      await setDoc(doc(db, 'liveClasses', id), {
        id,
        title: sanitizeString(liveTitle, 160),
        classLevel: liveClass,
        subject: liveSubject,
        teacherId: staffUid,
        teacherName: staffName,
        scheduledAt: liveDate,
        durationMinutes: Number(liveDuration) || 60,
        meetingUrl: sanitizeSafeUrl(liveMeetingUrl, 500),
        sharedNotes: sanitizeString(liveNotes, 4000),
        attachedMaterialTitle: sanitizeString(liveMatTitle, 160),
        attachedMaterialUrl: sanitizeSafeUrl(liveMatUrl, 500),
        status: 'scheduled',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logPlatformActivity({
        actorId: staffUid,
        actorName: staffName,
        actorRole: isAdmin ? 'admin' : 'teacher',
        action: 'Scheduled Live Class',
        details: `${liveClass} ${liveSubject}: ${liveTitle}`,
      });
      setLiveTitle('');
      setLiveMeetingUrl('');
      setLiveNotes('');
      setLiveMatTitle('');
      setLiveMatUrl('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `liveClasses/${id}`);
    } finally {
      setSavingLive(false);
    }
  };

  const handleUpdateLiveStatus = async (lesson: LiveClass, status: LiveClass['status']) => {
    try {
      await updateDoc(doc(db, 'liveClasses', lesson.id), {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `liveClasses/${lesson.id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-heading">
          Classes, Study Materials & Live Classroom
        </h1>
        <p className="mt-1 text-sm text-muted">
          Manage S1–S6 Ugandan courses, upload notes and video lessons, and run live classes.
        </p>
      </div>

      {/* Sub-navigation tabs */}
      <div className="inline-flex flex-wrap gap-1 rounded-xl bg-surface-muted p-1">
        <button
          type="button"
          onClick={() => setTab('courses')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            tab === 'courses' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
          }`}
        >
          Classes & Subjects
        </button>
        <button
          type="button"
          onClick={() => setTab('materials')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            tab === 'materials' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
          }`}
        >
          Study Material Upload
        </button>
        <button
          type="button"
          onClick={() => setTab('live')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            tab === 'live' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
          }`}
        >
          Live Classroom & Attendance
        </button>
      </div>

      {tab === 'courses' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {isAdmin && (
            <form
              onSubmit={handleSaveCourse}
              className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4 lg:col-span-4"
            >
              <h2 className="font-display text-lg font-bold text-heading">
                Create Class Course
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-body">Class</label>
                  <select
                    value={courseClass}
                    onChange={(e) => setCourseClass(e.target.value as ClassLevel)}
                    className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-sm text-heading"
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
                    value={courseSubject}
                    onChange={(e) => setCourseSubject(e.target.value as SubjectCode)}
                    className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-sm text-heading"
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Course Title</label>
                <input
                  type="text"
                  required
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                  placeholder="e.g. S4 Mathematics — O-Level Core"
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Description</label>
                <textarea
                  rows={2}
                  value={courseDesc}
                  onChange={(e) => setCourseDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">
                  Syllabus Topics (one per line)
                </label>
                <textarea
                  rows={4}
                  value={courseTopicsText}
                  onChange={(e) => setCourseTopicsText(e.target.value)}
                  placeholder="Quadratics&#10;Trigonometry&#10;Vectors"
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
                />
              </div>
              <button
                type="submit"
                disabled={savingCourse}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-btn-primary-hover"
              >
                {savingCourse ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span>Add Course</span>
              </button>
            </form>
          )}

          <div className={isAdmin ? 'lg:col-span-8' : 'lg:col-span-12'}>
            <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs">
              <h2 className="font-display text-base font-bold text-heading">
                Configured S1–S6 Courses ({courses.length})
              </h2>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-accent-sky" />
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {courses.map((c) => (
                    <div key={c.id} className="rounded-xl border border-border-theme bg-surface-subtle p-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-accent-sky-text">
                          {c.classLevel} · {c.subject}
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => deleteDoc(doc(db, 'courses', c.id))}
                            className="text-faint hover:text-rose-600 dark:hover:text-rose-400"
                            aria-label="Delete course"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <h3 className="mt-1 font-display text-sm font-bold text-heading">
                        {c.title}
                      </h3>
                      <p className="mt-1 text-xs text-muted line-clamp-2">{c.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'materials' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={handlePublishMaterial}
            className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4 lg:col-span-5"
          >
            <h2 className="font-display text-lg font-bold text-heading">
              Upload Study Material
            </h2>

            <div>
              <label className="block text-xs font-semibold text-body">Title</label>
              <input
                type="text"
                required
                value={matTitle}
                onChange={(e) => setMatTitle(e.target.value)}
                placeholder="e.g. S4 Physics — Waves & Optics Notes"
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-body">Class</label>
                <select
                  value={matClass}
                  onChange={(e) => setMatClass(e.target.value as ClassLevel)}
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
                  value={matSubject}
                  onChange={(e) => setMatSubject(e.target.value as SubjectCode)}
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
                <label className="block text-xs font-semibold text-body">Type</label>
                <select
                  value={matType}
                  onChange={(e) => setMatType(e.target.value as MaterialType)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-2.5 py-2 text-xs font-semibold text-heading"
                >
                  {MATERIAL_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">Description</label>
              <textarea
                rows={2}
                value={matDesc}
                onChange={(e) => setMatDesc(e.target.value)}
                placeholder="Topics covered and study instructions..."
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">
                Upload File (PDF, Doc, Image, Slides, Video)
              </label>
              <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-input bg-surface-subtle px-4 py-3 text-xs font-semibold text-heading hover:bg-surface-muted">
                <FileUp className="h-4 w-4 text-accent-sky" />
                <span>{matFileName || 'Choose file to upload to Firebase Storage'}</span>
                <input type="file" onChange={handleFileSelected} className="hidden" />
              </label>
              {uploadPct !== null && (
                <div className="mt-2 text-xs font-semibold text-accent-sky-text tabular-nums">
                  Uploading: {uploadPct}%
                </div>
              )}
              {storageNotice && (
                <p className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 p-2.5 text-xs text-amber-900 dark:text-amber-300">
                  {storageNotice}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">
                Resource / Video Link (https://...)
              </label>
              <input
                type="url"
                value={matUrl}
                onChange={(e) => setMatUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">
                Inline Lesson Notes / Summary
              </label>
              <textarea
                rows={4}
                value={matInline}
                onChange={(e) => setMatInline(e.target.value)}
                placeholder="Write readable study notes directly for students..."
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            <button
              type="submit"
              disabled={savingMat}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-btn-primary-hover"
            >
              {savingMat ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
              <span>Publish Study Material</span>
            </button>
          </form>

          <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs lg:col-span-7">
            <h2 className="font-display text-base font-bold text-heading">
              Published Materials ({materials.length})
            </h2>
            <div className="mt-4 divide-y divide-border-subtle">
              {materials.length === 0 ? (
                <p className="py-6 text-xs text-muted">No study materials published yet.</p>
              ) : (
                materials.map((m) => (
                  <div key={m.id} className="py-3.5 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-accent-sky-text">
                        {m.classLevel} · {m.subject} ·{' '}
                        {MATERIAL_TYPES.find((t) => t.value === m.materialType)?.label}
                      </div>
                      <div className="font-display text-sm font-bold text-heading">
                        {m.title}
                      </div>
                      <div className="text-xs text-muted">
                        Uploaded by {m.uploaderName} · {formatTimestamp(m.createdAt)}
                      </div>
                    </div>
                    {(isAdmin || m.uploadedBy === staffUid) && (
                      <button
                        type="button"
                        onClick={() => deleteDoc(doc(db, 'materials', m.id))}
                        className="rounded-lg p-1.5 text-faint hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 dark:hover:text-rose-400"
                        aria-label="Delete material"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'live' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleCreateLiveClass}
            className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4 lg:col-span-5"
          >
            <h2 className="font-display text-lg font-bold text-heading">
              Schedule Live Lesson
            </h2>
            <div>
              <label className="block text-xs font-semibold text-body">Lesson Title</label>
              <input
                type="text"
                required
                value={liveTitle}
                onChange={(e) => setLiveTitle(e.target.value)}
                placeholder="e.g. Organic Chemistry — Alkanes & Alkenes"
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-body">Class</label>
                <select
                  value={liveClass}
                  onChange={(e) => setLiveClass(e.target.value as ClassLevel)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-sm text-heading"
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
                  value={liveSubject}
                  onChange={(e) => setLiveSubject(e.target.value as SubjectCode)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-sm text-heading"
                >
                  {SUBJECTS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-body">Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={liveDate}
                  onChange={(e) => setLiveDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-2.5 py-2 text-xs text-heading"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Duration (mins)</label>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={liveDuration}
                  onChange={(e) => setLiveDuration(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-sm text-heading"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">
                Video Meeting / Stream URL
              </label>
              <input
                type="url"
                value={liveMeetingUrl}
                onChange={(e) => setLiveMeetingUrl(e.target.value)}
                placeholder="https://meet.google.com/... or Jitsi / Zoom link"
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">
                Shared Lesson Notes
              </label>
              <textarea
                rows={3}
                value={liveNotes}
                onChange={(e) => setLiveNotes(e.target.value)}
                placeholder="Key objectives and class notes..."
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                value={liveMatTitle}
                onChange={(e) => setLiveMatTitle(e.target.value)}
                placeholder="Handout title (optional)"
                className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs text-heading"
              />
              <input
                type="url"
                value={liveMatUrl}
                onChange={(e) => setLiveMatUrl(e.target.value)}
                placeholder="Handout URL (optional)"
                className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs text-heading"
              />
            </div>

            <button
              type="submit"
              disabled={savingLive}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-btn-primary-hover"
            >
              {savingLive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
              <span>Schedule Live Class</span>
            </button>
          </form>

          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs">
              <h2 className="font-display text-base font-bold text-heading">
                Live & Scheduled Classes ({liveClasses.length})
              </h2>
              <div className="mt-4 space-y-3">
                {liveClasses.length === 0 ? (
                  <p className="text-xs text-muted">No live classes scheduled yet.</p>
                ) : (
                  liveClasses.map((l) => (
                    <div key={l.id} className="rounded-xl border border-border-theme bg-surface-subtle p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-accent-sky-text">
                            {l.classLevel} · {l.subject} · {l.status.toUpperCase()}
                          </div>
                          <h3 className="font-display text-base font-bold text-heading">
                            {l.title}
                          </h3>
                          <p className="text-xs text-muted">
                            {formatTimestamp(l.scheduledAt)} · {l.durationMinutes} mins
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {l.status !== 'live' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateLiveStatus(l, 'live')}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              <Play className="h-3.5 w-3.5" />
                              <span>Start Live</span>
                            </button>
                          )}
                          {l.status === 'live' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateLiveStatus(l, 'ended')}
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                            >
                              <Square className="h-3.5 w-3.5" />
                              <span>End Class</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setAttendanceLessonId(attendanceLessonId === l.id ? null : l.id)
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-border-theme bg-surface px-3 py-1.5 text-xs font-semibold text-heading hover:bg-surface-muted"
                          >
                            <Users className="h-3.5 w-3.5" />
                            <span>Attendance</span>
                          </button>
                        </div>
                      </div>

                      {attendanceLessonId === l.id && (
                        <div className="mt-4 rounded-xl bg-surface p-3.5 border border-border-theme">
                          <div className="text-xs font-bold text-heading">
                            Student Attendance ({attendanceList.length})
                          </div>
                          {attendanceList.length === 0 ? (
                            <p className="mt-1 text-xs text-muted">
                              No students have joined this session yet.
                            </p>
                          ) : (
                            <div className="mt-2 divide-y divide-border-subtle">
                              {attendanceList.map((a) => (
                                <div
                                  key={a.studentUid}
                                  className="py-1.5 flex items-center justify-between text-xs"
                                >
                                  <span className="font-medium text-heading">
                                    {a.studentName} ({a.classLevel})
                                  </span>
                                  <span className="text-muted">
                                    {formatTimestamp(a.joinedAt)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
