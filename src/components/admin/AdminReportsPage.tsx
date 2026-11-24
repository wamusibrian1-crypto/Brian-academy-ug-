import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Download,
  FileCheck2,
  Loader2,
  MessageSquare,
  Plus,
  Printer,
  Send,
  Trash2,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  ActivityLog,
  AssessmentSubmission,
  ChatMessage,
  CLASS_LEVELS,
  ClassLevel,
  computeUgandanGrade,
  ReportCard,
  ReportCardEntry,
  StudentProfile,
  SUBJECTS,
  SubjectCode,
  SupportTicket,
} from '../../types/academy';
import { formatTimestamp, generateDocId, sanitizeString } from '../../lib/validation';
import { generateReportCardPdf } from '../../lib/reportCardPdf';
import { logPlatformActivity } from '../../lib/activity';

export const AdminReportsPage: React.FC = () => {
  const { role, adminProfile, teacherProfile, academicSettings } = useAuth();
  const isAdmin = role === 'admin';
  const staffUid = adminProfile?.uid || teacherProfile?.uid || '';
  const staffName = adminProfile?.fullName || teacherProfile?.fullName || 'Staff';

  const [tab, setTab] = useState<'reports' | 'activity' | 'tickets' | 'chat'>('reports');
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [submissions, setSubmissions] = useState<AssessmentSubmission[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [ticketReplies, setTicketReplies] = useState<Record<string, string>>({});
  const [chatMode, setChatMode] = useState<'channel' | 'direct'>('channel');
  const [chatClass, setChatClass] = useState<ClassLevel>('S1');
  const [chatSubject, setChatSubject] = useState('MTC');
  const [chatStudentId, setChatStudentId] = useState('');
  const [chatText, setChatText] = useState('');

  // Report card builder state
  const [rcEntries, setRcEntries] = useState<ReportCardEntry[]>([]);
  const [rcConduct, setRcConduct] = useState('Exemplary');
  const [rcTeacherRemark, setRcTeacherRemark] = useState('');
  const [rcHeadRemark, setRcHeadRemark] = useState('');
  const [rcPublished, setRcPublished] = useState(true);
  const [savingRc, setSavingRc] = useState(false);
  const [rcSavedNotice, setRcSavedNotice] = useState('');

  useEffect(() => {
    const unsubStu = onSnapshot(
      collection(db, 'students'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as StudentProfile);
        setStudents(list);
        if (list.length > 0 && !selectedStudentId) setSelectedStudentId(list[0].uid);
        if (list.length > 0 && !chatStudentId) setChatStudentId(list[0].uid);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'students')
    );

    const unsubSub = onSnapshot(
      collection(db, 'submissions'),
      (snap) => {
        setSubmissions(snap.docs.map((d) => d.data() as AssessmentSubmission));
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'submissions')
    );

    const unsubRc = onSnapshot(
      collection(db, 'reportCards'),
      (snap) => setReportCards(snap.docs.map((d) => d.data() as ReportCard)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'reportCards')
    );

    const unsubChat = onSnapshot(
      collection(db, 'chatMessages'),
      (snap) => setChatMessages(snap.docs.map((d) => d.data() as ChatMessage)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'chatMessages')
    );

    let unsubLogs = () => {};
    let unsubTkt = () => {};
    if (isAdmin) {
      unsubLogs = onSnapshot(
        collection(db, 'activityLogs'),
        (snap) => setLogs(snap.docs.map((d) => d.data() as ActivityLog)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'activityLogs')
      );
      unsubTkt = onSnapshot(
        collection(db, 'supportTickets'),
        (snap) => setTickets(snap.docs.map((d) => d.data() as SupportTicket)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'supportTickets')
      );
    }

    return () => {
      unsubStu();
      unsubSub();
      unsubRc();
      unsubChat();
      unsubLogs();
      unsubTkt();
    };
  }, [isAdmin, selectedStudentId]);

  const selectedStudent = students.find((s) => s.uid === selectedStudentId);
  const studentResults = submissions.filter(
    (s) => s.studentId === selectedStudentId && s.status === 'published'
  );
  const existingRc = reportCards.find(
    (r) =>
      r.studentId === selectedStudentId &&
      r.term === academicSettings.termName &&
      r.academicYear === academicSettings.academicYear
  );

  // Sync builder when student or saved report card changes
  useEffect(() => {
    setRcSavedNotice('');
    if (!selectedStudent) return;
    if (existingRc) {
      setRcEntries(existingRc.entries || []);
      setRcConduct(existingRc.conduct || 'Good');
      setRcTeacherRemark(existingRc.teacherRemark || '');
      setRcHeadRemark(existingRc.headTeacherRemark || '');
      setRcPublished(existingRc.published);
    } else {
      const fromSubs: ReportCardEntry[] = studentResults.map((r) => ({
        subject: r.subject,
        assessmentTitle: r.assessmentTitle,
        score: r.totalScore,
        maxMarks: r.maxMarks,
        grade: r.grade,
        remark: r.teacherRemarks || '',
      }));
      setRcEntries(fromSubs);
      setRcConduct('Good');
      setRcTeacherRemark('');
      setRcHeadRemark('');
      setRcPublished(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId, existingRc?.id]);

  const computeAverage = (entries: ReportCardEntry[]) => {
    if (entries.length === 0) return 0;
    const sumPct = entries.reduce((acc, e) => {
      const max = e.maxMarks > 0 ? e.maxMarks : 100;
      return acc + (e.score / max) * 100;
    }, 0);
    return Math.round(sumPct / entries.length);
  };

  const handleLoadFromAssessments = () => {
    const fromSubs: ReportCardEntry[] = studentResults.map((r) => ({
      subject: r.subject,
      assessmentTitle: r.assessmentTitle,
      score: r.totalScore,
      maxMarks: r.maxMarks,
      grade: r.grade,
      remark: r.teacherRemarks || '',
    }));
    setRcEntries(fromSubs);
  };

  const handleAddSubjectRow = () => {
    setRcEntries((prev) => [
      ...prev,
      {
        subject: 'MTC',
        assessmentTitle: 'Term Assessment',
        score: 0,
        maxMarks: 100,
        grade: 'F9',
        remark: '',
      },
    ]);
  };

  const handleSaveReportCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    setSavingRc(true);
    setRcSavedNotice('');

    const sanitizedEntries: ReportCardEntry[] = rcEntries.slice(0, 30).map((entry) => {
      const safeMax = Math.max(1, Number(entry.maxMarks) || 100);
      const safeScore = Math.min(safeMax, Math.max(0, Number(entry.score) || 0));
      const autoGrade = computeUgandanGrade(
        safeScore,
        safeMax,
        academicSettings.gradeBands
      ).grade;
      return {
        subject: entry.subject,
        assessmentTitle: sanitizeString(entry.assessmentTitle || 'Term Assessment', 120),
        score: safeScore,
        maxMarks: safeMax,
        grade: sanitizeString(entry.grade || autoGrade, 20),
        remark: sanitizeString(entry.remark || '', 300),
      };
    });

    const overallAverage = computeAverage(sanitizedEntries);
    const reportId =
      existingRc?.id ||
      `rc_${selectedStudent.uid}_${academicSettings.academicYear.replace(/[^a-zA-Z0-9]/g, '')}_${academicSettings.termName.replace(/[^a-zA-Z0-9]/g, '')}`.slice(
        0,
        128
      );

    try {
      if (existingRc) {
        await updateDoc(doc(db, 'reportCards', reportId), {
          studentName: selectedStudent.fullName,
          studentNumber: selectedStudent.studentNumber,
          classLevel: selectedStudent.classLevel,
          term: academicSettings.termName,
          academicYear: academicSettings.academicYear,
          entries: sanitizedEntries,
          overallAverage,
          conduct: sanitizeString(rcConduct, 80),
          teacherRemark: sanitizeString(rcTeacherRemark, 1000),
          headTeacherRemark: sanitizeString(rcHeadRemark, 1000),
          published: rcPublished,
          preparedBy: staffUid,
          preparedByName: staffName,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'reportCards', reportId), {
          id: reportId,
          studentId: selectedStudent.uid,
          studentName: selectedStudent.fullName,
          studentNumber: selectedStudent.studentNumber,
          classLevel: selectedStudent.classLevel,
          term: academicSettings.termName,
          academicYear: academicSettings.academicYear,
          entries: sanitizedEntries,
          overallAverage,
          conduct: sanitizeString(rcConduct, 80),
          teacherRemark: sanitizeString(rcTeacherRemark, 1000),
          headTeacherRemark: sanitizeString(rcHeadRemark, 1000),
          published: rcPublished,
          preparedBy: staffUid,
          preparedByName: staffName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await logPlatformActivity({
        actorId: staffUid,
        actorName: staffName,
        actorRole: isAdmin ? 'admin' : 'teacher',
        action: 'Prepared Report Card',
        details: `${selectedStudent.fullName} (${selectedStudent.classLevel}) · Avg ${overallAverage}%`,
      });

      setRcSavedNotice(
        rcPublished
          ? 'Report card saved and published to student portal.'
          : 'Report card draft saved.'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `reportCards/${reportId}`);
    } finally {
      setSavingRc(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!selectedStudent) return;
    const sanitizedEntries: ReportCardEntry[] = rcEntries.map((entry) => {
      const safeMax = Math.max(1, Number(entry.maxMarks) || 100);
      const safeScore = Math.min(safeMax, Math.max(0, Number(entry.score) || 0));
      const autoGrade = computeUgandanGrade(
        safeScore,
        safeMax,
        academicSettings.gradeBands
      ).grade;
      return {
        ...entry,
        score: safeScore,
        maxMarks: safeMax,
        grade: entry.grade || autoGrade,
      };
    });
    const draftCard: ReportCard = {
      id: existingRc?.id || 'draft',
      studentId: selectedStudent.uid,
      studentName: selectedStudent.fullName,
      studentNumber: selectedStudent.studentNumber,
      classLevel: selectedStudent.classLevel,
      term: academicSettings.termName,
      academicYear: academicSettings.academicYear,
      entries: sanitizedEntries,
      overallAverage: computeAverage(sanitizedEntries),
      conduct: rcConduct || 'Good',
      teacherRemark: rcTeacherRemark,
      headTeacherRemark: rcHeadRemark,
      published: rcPublished,
      preparedBy: staffUid,
      preparedByName: staffName,
    };
    generateReportCardPdf(draftCard, academicSettings);
  };

  const handleResolveTicket = async (t: SupportTicket) => {
    const reply = sanitizeString(ticketReplies[t.id] || 'Resolved by administration.', 2000);
    try {
      await updateDoc(doc(db, 'supportTickets', t.id), {
        adminReply: reply,
        status: 'resolved',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `supportTickets/${t.id}`);
    }
  };

  const handleSendStaffChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = sanitizeString(chatText, 1500);
    if (!clean) return;
    const id = generateDocId('msg');
    const targetStu = students.find((s) => s.uid === chatStudentId);
    const isDirect = chatMode === 'direct' && Boolean(targetStu);
    const channelId = isDirect && targetStu ? `dm_${targetStu.uid}` : `${chatClass}_${chatSubject}`;
    try {
      await setDoc(doc(db, 'chatMessages', id), {
        id,
        channelId,
        classLevel: isDirect && targetStu ? targetStu.classLevel : chatClass,
        subject: isDirect ? 'Progress Chat' : chatSubject,
        senderId: staffUid,
        senderName: staffName,
        senderRole: isAdmin ? 'admin' : 'teacher',
        recipientStudentId: isDirect && targetStu ? targetStu.uid : '',
        text: clean,
        createdAt: serverTimestamp(),
      });
      setChatText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `chatMessages/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-heading">
          Reports, Results & Communications
        </h1>
        <p className="mt-1 text-sm text-muted">
          Prepare official <span className="brand-wordmark font-bold text-heading">BRIAN ACADEMY UG</span> report cards with teacher remarks, export Report Card PDFs, monitor activity, and communicate with classes.
        </p>
      </div>

      <div className="inline-flex flex-wrap gap-1 rounded-xl bg-surface-muted p-1">
        <button
          type="button"
          onClick={() => setTab('reports')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold ${
            tab === 'reports' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
          }`}
        >
          Prepare Report Card PDF
        </button>
        <button
          type="button"
          onClick={() => setTab('chat')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold ${
            tab === 'chat' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
          }`}
        >
          Class Academic Chat
        </button>
        {isAdmin && (
          <>
            <button
              type="button"
              onClick={() => setTab('activity')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                tab === 'activity' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
              }`}
            >
              Activity Monitor ({logs.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('tickets')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                tab === 'tickets' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
              }`}
            >
              Help Tickets ({tickets.filter((t) => t.status === 'open').length})
            </button>
          </>
        )}
      </div>

      {tab === 'reports' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-theme bg-surface p-5">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-semibold text-body">Select Student:</label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              >
                {students.map((s) => (
                  <option key={s.uid} value={s.uid}>
                    {s.fullName} ({s.classLevel})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={!selectedStudent}
                className="inline-flex items-center gap-2 rounded-xl bg-btn-primary px-4 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover disabled:opacity-50"
              >
                <Download className="h-4 w-4 text-accent-gold" />
                <span>Download Report Card PDF</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-xl border border-border-theme bg-surface px-4 py-2 text-xs font-semibold text-heading hover:bg-surface-muted"
              >
                <Printer className="h-4 w-4" />
                <span>Print</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-accent-sky" />
            </div>
          ) : selectedStudent ? (
            <>
              {/* Student Subject Progress Chart */}
              <div className="rounded-2xl border border-border-theme bg-surface p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-accent-sky" />
                    <h2 className="font-display text-sm font-bold text-heading">
                      Subject Progress Chart · {selectedStudent.fullName} ({selectedStudent.classLevel})
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setChatMode('direct');
                      setChatStudentId(selectedStudent.uid);
                      setTab('chat');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-accent-sky-text hover:underline"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Open Progress Chat</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {SUBJECTS.map((subj) => {
                    const rows = rcEntries.filter((e) => e.subject === subj.code);
                    const pct =
                      rows.length > 0
                        ? Math.round(
                            rows.reduce((sum, r) => sum + (r.score / (r.maxMarks || 100)) * 100, 0) /
                              rows.length
                          )
                        : 0;
                    return (
                      <div key={subj.code} className="rounded-xl bg-surface-subtle p-3 space-y-1.5 border border-border-subtle">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-heading">{subj.code}</span>
                          <span className="font-mono font-bold text-accent-sky-text tabular-nums">
                            {rows.length > 0 ? `${pct}%` : '—'}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full bg-btn-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            <form
              onSubmit={handleSaveReportCard}
              className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-5"
            >
              <div className="border-b border-border-theme pb-4 flex flex-wrap justify-between gap-4">
                <div>
                  <h2 className="text-xl text-heading">
                    <span className="brand-wordmark">BRIAN ACADEMY <span className="text-accent-gold-text">UG</span></span>
                    <span className="font-display font-bold text-muted"> — REPORT CARD BUILDER</span>
                  </h2>
                  <p className="text-xs text-muted">
                    {academicSettings.termName} {academicSettings.academicYear} · {academicSettings.schoolMotto}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <div className="font-bold text-heading">{selectedStudent.fullName}</div>
                  <div className="font-mono text-muted">
                    {selectedStudent.classLevel}
                  </div>
                  <div className="mt-1 font-semibold text-accent-sky-text tabular-nums">
                    Overall Average: {computeAverage(rcEntries)}%
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-heading">
                  Subject Marks & Per-Subject Remarks ({rcEntries.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleLoadFromAssessments}
                    className="rounded-lg border border-border-theme bg-surface px-3 py-1.5 text-xs font-semibold text-accent-sky-text hover:bg-accent-sky-soft"
                  >
                    Import Published Results ({studentResults.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleAddSubjectRow}
                    className="inline-flex items-center gap-1 rounded-lg border border-border-theme bg-surface px-3 py-1.5 text-xs font-semibold text-heading hover:bg-surface-muted"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Subject Row</span>
                  </button>
                </div>
              </div>

              {rcEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-theme p-6 text-center text-xs text-muted">
                  No entries added yet. Click &ldquo;Import Published Results&rdquo; or &ldquo;Add Subject Row&rdquo; to populate the report card.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {rcEntries.map((entry, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 gap-2.5 rounded-xl border border-border-theme bg-surface-subtle p-3 sm:grid-cols-12 sm:items-center"
                    >
                      <select
                        value={entry.subject}
                        onChange={(e) => {
                          const subj = e.target.value as SubjectCode;
                          setRcEntries((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, subject: subj } : item))
                          );
                        }}
                        className="rounded-lg border border-border-input bg-input-bg px-2 py-1.5 text-xs font-semibold text-heading sm:col-span-2"
                      >
                        {SUBJECTS.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.code}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        value={entry.assessmentTitle}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRcEntries((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, assessmentTitle: val } : item
                            )
                          );
                        }}
                        placeholder="Paper / Assessment"
                        className="rounded-lg border border-border-input bg-input-bg px-2.5 py-1.5 text-xs text-heading sm:col-span-3"
                      />

                      <div className="flex items-center gap-1 sm:col-span-2">
                        <input
                          type="number"
                          min={0}
                          max={500}
                          value={entry.score}
                          onChange={(e) => {
                            const scoreVal = Number(e.target.value);
                            setRcEntries((prev) =>
                              prev.map((item, i) => {
                                if (i !== idx) return item;
                                const g = computeUgandanGrade(
                                  scoreVal,
                                  item.maxMarks,
                                  academicSettings.gradeBands
                                ).grade;
                                return { ...item, score: scoreVal, grade: g };
                              })
                            );
                          }}
                          className="w-16 rounded-lg border border-border-input bg-input-bg px-2 py-1.5 text-xs font-mono text-heading"
                        />
                        <span className="text-xs text-faint">/</span>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={entry.maxMarks}
                          onChange={(e) => {
                            const maxVal = Number(e.target.value);
                            setRcEntries((prev) =>
                              prev.map((item, i) => {
                                if (i !== idx) return item;
                                const g = computeUgandanGrade(
                                  item.score,
                                  maxVal,
                                  academicSettings.gradeBands
                                ).grade;
                                return { ...item, maxMarks: maxVal, grade: g };
                              })
                            );
                          }}
                          className="w-16 rounded-lg border border-border-input bg-input-bg px-2 py-1.5 text-xs font-mono text-heading"
                        />
                      </div>

                      <input
                        type="text"
                        value={entry.grade}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRcEntries((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, grade: val } : item))
                          );
                        }}
                        placeholder="Grade"
                        className="rounded-lg border border-border-input bg-input-bg px-2 py-1.5 text-xs font-bold text-accent-sky-text sm:col-span-1"
                      />

                      <input
                        type="text"
                        value={entry.remark}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRcEntries((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, remark: val } : item))
                          );
                        }}
                        placeholder="Subject teacher remark..."
                        className="rounded-lg border border-border-input bg-input-bg px-2.5 py-1.5 text-xs text-heading sm:col-span-3"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setRcEntries((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="justify-self-end rounded-lg p-1.5 text-faint hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 dark:hover:text-rose-400 sm:col-span-1"
                        aria-label="Remove subject row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 border-t border-border-subtle pt-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-body">
                    Student Conduct
                  </label>
                  <select
                    value={rcConduct}
                    onChange={(e) => setRcConduct(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-sm text-heading"
                  >
                    <option value="Exemplary">Exemplary</option>
                    <option value="Very Good">Very Good</option>
                    <option value="Good">Good</option>
                    <option value="Satisfactory">Satisfactory</option>
                    <option value="Needs Improvement">Needs Improvement</option>
                  </select>
                </div>
                <div className="sm:col-span-2 flex items-end">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-heading cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rcPublished}
                      onChange={(e) => setRcPublished(e.target.checked)}
                      className="h-4 w-4 rounded border-border-input"
                    />
                    <span>Publish Report Card PDF to Student Profile Portal</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-body">
                    Class / Subject Teacher Remarks
                  </label>
                  <textarea
                    rows={3}
                    value={rcTeacherRemark}
                    onChange={(e) => setRcTeacherRemark(e.target.value)}
                    placeholder="Overall academic strength, attendance, and areas for improvement..."
                    className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-body">
                    Head Teacher / Administration Remarks
                  </label>
                  <textarea
                    rows={3}
                    value={rcHeadRemark}
                    onChange={(e) => setRcHeadRemark(e.target.value)}
                    placeholder="Official term conclusion and promotion/encouragement note..."
                    className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={savingRc}
                    className="inline-flex items-center gap-2 rounded-xl bg-btn-primary px-5 py-2.5 text-xs font-semibold text-white hover:bg-btn-primary-hover disabled:opacity-60"
                  >
                    {savingRc ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileCheck2 className="h-4 w-4 text-accent-gold" />
                    )}
                    <span>Save & {rcPublished ? 'Publish' : 'Save Draft'} Report Card</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    className="inline-flex items-center gap-2 rounded-xl border border-border-input bg-surface px-4 py-2.5 text-xs font-semibold text-heading hover:bg-surface-muted"
                  >
                    <Download className="h-4 w-4 text-accent-sky" />
                    <span>Export PDF</span>
                  </button>
                </div>

                {rcSavedNotice && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    {rcSavedNotice}
                  </span>
                )}
              </div>
            </form>
            </>
          ) : (
            <div className="rounded-2xl border border-border-theme bg-surface p-8 text-center text-sm text-muted">
              No students registered yet.
            </div>
          )}
        </div>
      )}

      {tab === 'chat' && (
        <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl bg-surface-muted p-1">
              <button
                type="button"
                onClick={() => setChatMode('channel')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  chatMode === 'channel' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
                }`}
              >
                Class Subject Channel
              </button>
              <button
                type="button"
                onClick={() => setChatMode('direct')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  chatMode === 'direct' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
                }`}
              >
                Direct Student Progress Chat
              </button>
            </div>

            {chatMode === 'channel' ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={chatClass}
                  onChange={(e) => setChatClass(e.target.value as ClassLevel)}
                  className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
                >
                  {CLASS_LEVELS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
                <select
                  value={chatSubject}
                  onChange={(e) => setChatSubject(e.target.value)}
                  className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
                >
                  {SUBJECTS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <select
                value={chatStudentId}
                onChange={(e) => setChatStudentId(e.target.value)}
                className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
              >
                {students.map((s) => (
                  <option key={s.uid} value={s.uid}>
                    {s.fullName} ({s.classLevel})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="h-80 overflow-y-auto rounded-xl border border-border-theme bg-surface-subtle p-4 space-y-3">
            {chatMessages
              .filter((m) =>
                chatMode === 'direct'
                  ? m.channelId === `dm_${chatStudentId}`
                  : m.channelId === `${chatClass}_${chatSubject}`
              )
              .sort((a, b) => {
                const ta = (a.createdAt as { seconds?: number })?.seconds ?? 0;
                const tb = (b.createdAt as { seconds?: number })?.seconds ?? 0;
                return ta - tb;
              })
              .map((m) => (
                <div key={m.id} className="rounded-xl bg-surface p-3 border border-border-theme">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-heading">
                      {m.senderName} ({m.senderRole}) · {m.classLevel} {m.subject}
                    </span>
                    <span className="text-faint">{formatTimestamp(m.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-heading">{m.text}</p>
                </div>
              ))}
          </div>

          <form onSubmit={handleSendStaffChat} className="flex gap-2">
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder={
                chatMode === 'direct'
                  ? 'Send a direct progress alert or message to this student...'
                  : `Message ${chatClass} ${chatSubject} channel (alerts students)...`
              }
              className="flex-1 rounded-xl border border-border-input bg-input-bg px-3.5 py-2.5 text-sm text-heading"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-btn-primary px-4 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover"
            >
              <Send className="h-4 w-4" />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}

      {tab === 'activity' && isAdmin && (
        <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs">
          <h2 className="font-display text-base font-bold text-heading">
            Platform Activity Monitor
          </h2>
          <div className="mt-4 divide-y divide-border-subtle">
            {logs.length === 0 ? (
              <p className="py-6 text-xs text-muted">No activity logs recorded yet.</p>
            ) : (
              logs.slice(0, 50).map((log) => (
                <div key={log.id} className="py-3 flex flex-wrap justify-between gap-2 text-xs">
                  <div>
                    <span className="font-bold text-heading">{log.action}</span> ·{' '}
                    <span className="text-body">{log.details}</span>
                  </div>
                  <div className="text-muted">
                    {log.actorName} ({log.actorRole}) · {formatTimestamp(log.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'tickets' && isAdmin && (
        <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4">
          <h2 className="font-display text-base font-bold text-heading">
            Student Support Tickets
          </h2>
          {tickets.length === 0 ? (
            <p className="text-xs text-muted">No support tickets submitted.</p>
          ) : (
            tickets.map((t) => (
              <div key={t.id} className="rounded-xl border border-border-theme bg-surface-subtle p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-heading">
                    {t.studentName} ({t.classLevel}) · {t.subject}
                  </span>
                  <span
                    className={`font-semibold inline-flex items-center gap-1 ${
                      t.status === 'resolved'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-accent-gold-text'
                    }`}
                  >
                    {t.status === 'resolved' && <CheckCircle2 className="h-3.5 w-3.5" />}
                    {t.status === 'resolved' ? 'Resolved' : 'Open'}
                  </span>
                </div>
                <p className="text-sm text-body">{t.message}</p>
                {t.status === 'open' ? (
                  <div className="flex gap-2 pt-2">
                    <input
                      type="text"
                      value={ticketReplies[t.id] || ''}
                      onChange={(e) =>
                        setTicketReplies((prev) => ({ ...prev, [t.id]: e.target.value }))
                      }
                      placeholder="Write administrative response..."
                      className="flex-1 rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs text-heading"
                    />
                    <button
                      type="button"
                      onClick={() => handleResolveTicket(t)}
                      className="rounded-xl bg-btn-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover"
                    >
                      Resolve Ticket
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg bg-accent-sky-soft px-3 py-2 text-xs text-heading">
                    <MessageSquare className="inline h-3.5 w-3.5 mr-1" />
                    Reply: {t.adminReply}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
