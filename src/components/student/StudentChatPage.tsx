import React, { useEffect, useState } from 'react';
import { ArrowLeft, Globe2, Loader2, MessageSquare, Send, VolumeX } from 'lucide-react';
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
import { ChatMessage, SUBJECTS, SubjectCode } from '../../types/academy';
import { formatTimestamp, generateDocId, sanitizeString } from '../../lib/validation';
import { useStudentFeeMute } from '../../hooks/useStudentFeeMute';
import { publishPublicNotice } from '../../lib/publicNotifications';

interface StudentChatPageProps {
  onBack: () => void;
  onOpenFees?: () => void;
}

export const StudentChatPage: React.FC<StudentChatPageProps> = ({ onBack, onOpenFees }) => {
  const { studentProfile, academicSettings } = useAuth();
  const { isMutedUnpaid } = useStudentFeeMute();
  const [mode, setMode] = useState<'institution' | 'channel' | 'direct'>('institution');
  const [selectedSubject, setSelectedSubject] = useState<SubjectCode>('MTC');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const channelId =
    mode === 'institution'
      ? 'institution_all'
      : mode === 'channel'
        ? `${studentProfile?.classLevel}_${selectedSubject}`
        : `dm_${studentProfile?.uid}`;

  useEffect(() => {
    if (!studentProfile) return;
    setLoading(true);
    const q =
      mode === 'institution'
        ? query(
            collection(db, 'chatMessages'),
            where('classLevel', '==', 'ALL'),
            where('recipientStudentId', '==', '')
          )
        : mode === 'channel'
          ? query(
              collection(db, 'chatMessages'),
              where('classLevel', '==', studentProfile.classLevel),
              where('recipientStudentId', '==', '')
            )
          : query(
              collection(db, 'chatMessages'),
              where('classLevel', '==', studentProfile.classLevel),
              where('recipientStudentId', '==', studentProfile.uid)
            );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as ChatMessage)
          .filter((m) => m.channelId === channelId);
        list.sort((a, b) => {
          const ta = (a.createdAt as { seconds?: number })?.seconds ?? 0;
          const tb = (b.createdAt as { seconds?: number })?.seconds ?? 0;
          return ta - tb;
        });
        setMessages(list);
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'chatMessages')
    );
    return () => unsub();
  }, [studentProfile, mode, channelId]);

  if (!studentProfile) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = sanitizeString(text, 1500);
    if (!clean) return;
    setSending(true);
    const id = generateDocId('msg');
    const path = `chatMessages/${id}`;
    try {
      await setDoc(doc(db, 'chatMessages', id), {
        id,
        channelId,
        classLevel: mode === 'institution' ? 'ALL' : studentProfile.classLevel,
        subject:
          mode === 'institution'
            ? studentProfile.classLevel
            : mode === 'channel'
              ? selectedSubject
              : 'Direct Staff Thread',
        senderId: studentProfile.uid,
        senderName: studentProfile.fullName,
        senderRole: 'student',
        recipientStudentId: mode === 'direct' ? studentProfile.uid : '',
        text: clean,
        createdAt: serverTimestamp(),
      });
      if (mode !== 'direct') {
        void publishPublicNotice({
          kind: 'chat',
          title:
            mode === 'institution'
              ? 'New Institution Chat Message'
              : `New ${studentProfile.classLevel} ${selectedSubject} Chat`,
          summary:
            mode === 'institution'
              ? 'Whole Institution Chat Room · New discussion message posted'
              : `${studentProfile.classLevel} ${selectedSubject} · New subject discussion posted`,
          subject: mode === 'institution' ? 'Institution' : selectedSubject,
          classLevel: mode === 'institution' ? 'ALL' : studentProfile.classLevel,
          createdBy: studentProfile.uid,
        });
      }
      setText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
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
            Institution Chat Room
          </h1>
          <p className="text-xs text-muted">
            Whole-academy discussion room for all S1–S6 students, teachers, and administration.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap rounded-xl bg-surface-muted p-1">
          <button
            type="button"
            onClick={() => setMode('institution')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              mode === 'institution' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
            }`}
          >
            <Globe2 className="h-3.5 w-3.5 text-accent-sky" />
            <span>Whole Institution</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('channel')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              mode === 'channel' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
            }`}
          >
            {studentProfile.classLevel} Subjects
          </button>
          <button
            type="button"
            onClick={() => setMode('direct')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              mode === 'direct' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
            }`}
          >
            Direct Teacher Chat
          </button>
        </div>

        {mode === 'channel' && (
          <div className="flex flex-wrap gap-1.5">
            {SUBJECTS.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => setSelectedSubject(s.code)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selectedSubject === s.code
                    ? 'border-btn-primary bg-btn-primary text-white'
                    : 'border-border-theme bg-surface text-body hover:bg-surface-muted'
                }`}
              >
                {s.code}
              </button>
            ))}
          </div>
        )}
      </div>

      {isMutedUnpaid ? (
        <div className="rounded-2xl border border-border-theme bg-surface p-8 text-center">
          <VolumeX className="mx-auto h-8 w-8 text-faint" />
          <h2 className="mt-3 font-display text-base font-bold text-heading">
            Chat Muted (Unpaid Fees)
          </h2>
          <p className="mt-1 text-sm text-muted">
            Academic chat is muted while term tuition remains unpaid. Pay school fees via{' '}
            {academicSettings.supportPhone || '256753336009'} and upload your proof to unlock.
          </p>
          {onOpenFees && (
            <button
              type="button"
              onClick={onOpenFees}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-btn-primary px-5 py-2.5 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors"
            >
              Open School Fees
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-[460px] flex-col rounded-2xl border border-border-theme bg-surface shadow-xs overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-3 flex items-center justify-between bg-surface-subtle">
            <div className="text-xs font-bold text-heading">
              {mode === 'institution'
                ? 'BRIAN ACADEMY UG — Whole Institution Chat Room (S1–S6 & Staff)'
                : mode === 'channel'
                  ? `${studentProfile.classLevel} ${selectedSubject} Discussion`
                  : 'Direct Message with Teachers & Administration'}
            </div>
            <MessageSquare className="h-4 w-4 text-accent-sky" />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-accent-sky" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-muted">
                <p className="text-sm font-medium">No messages in this room yet.</p>
                <p className="mt-1 text-xs">Send a message below to connect with the academy.</p>
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.senderId === studentProfile.uid;
                const roleLabel =
                  m.senderRole === 'admin'
                    ? 'Administrator'
                    : m.senderRole === 'teacher'
                      ? 'Teacher'
                      : m.classLevel === 'ALL' && m.subject
                        ? `Student · ${m.subject}`
                        : 'Student';
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm ${
                        isMe
                          ? 'bg-btn-primary text-white'
                          : m.senderRole !== 'student'
                            ? 'border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/60 text-heading'
                            : 'bg-surface-muted text-heading'
                      }`}
                    >
                      <div
                        className={`text-[11px] font-semibold ${
                          isMe ? 'text-sky-100' : 'text-muted'
                        }`}
                      >
                        {m.senderName} · {roleLabel}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{m.text}</p>
                    </div>
                    <span className="mt-1 text-[10px] text-faint">
                      {formatTimestamp(m.createdAt)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={handleSend} className="border-t border-border-subtle p-3 flex items-center gap-2">
            <input
              type="text"
              maxLength={1500}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                mode === 'institution'
                  ? 'Message the whole academy (alerts all students & staff)...'
                  : 'Write a message...'
              }
              className="flex-1 rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2.5 text-sm focus:border-accent-sky focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-btn-primary px-4 text-xs font-semibold text-white hover:bg-btn-primary-hover disabled:opacity-50 transition-colors"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span>Send</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
