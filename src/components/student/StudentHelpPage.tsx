import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, HelpCircle, Loader2, Send } from 'lucide-react';
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
import { SupportTicket } from '../../types/academy';
import { formatTimestamp, generateDocId, sanitizeString } from '../../lib/validation';
import { PWAInstallButton } from '../PWAInstallButton';

interface StudentHelpPageProps {
  onBack: () => void;
}

export const StudentHelpPage: React.FC<StudentHelpPageProps> = ({ onBack }) => {
  const { studentProfile, academicSettings } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<SupportTicket['category']>('Technical');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!studentProfile) return;
    const q = query(
      collection(db, 'supportTickets'),
      where('studentId', '==', studentProfile.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTickets(snap.docs.map((d) => d.data() as SupportTicket));
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'supportTickets')
    );
    return () => unsub();
  }, [studentProfile]);

  if (!studentProfile) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const id = generateDocId('tkt');
    const path = `supportTickets/${id}`;
    try {
      await setDoc(doc(db, 'supportTickets', id), {
        id,
        studentId: studentProfile.uid,
        studentName: studentProfile.fullName,
        classLevel: studentProfile.classLevel,
        category,
        subject: sanitizeString(subject, 160),
        message: sanitizeString(message, 2000),
        adminReply: '',
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSubject('');
      setMessage('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setSubmitting(false);
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
          <h1 className="font-display text-2xl font-bold text-heading">Help & Support Desk</h1>
          <p className="text-xs text-muted">
            Student guides, Android app installation, and administrative support requests.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Submit Help Request */}
        <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs lg:col-span-6">
          <h2 className="font-display text-lg font-bold text-heading">Send a Help Request</h2>
          <p className="mt-1 text-xs text-muted">
            Contact school administration ({academicSettings.supportEmail} · {academicSettings.supportPhone}).
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-body">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SupportTicket['category'])}
                className="mt-1.5 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2.5 text-sm focus:border-accent-sky focus:outline-none"
              >
                <option value="Technical">Technical Support</option>
                <option value="Fees">School Fees & Receipts</option>
                <option value="Exams">Tests & Homework</option>
                <option value="Account">Student Profile / Class</option>
                <option value="Other">Other Inquiry</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">Subject</label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={160}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary of your request"
                className="mt-1.5 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2.5 text-sm focus:border-accent-sky focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">Message</label>
              <textarea
                rows={4}
                required
                minLength={2}
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Explain how our team can assist you..."
                className="mt-1.5 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2.5 text-sm focus:border-accent-sky focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-btn-primary-hover disabled:opacity-60 transition-colors"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span>Submit Help Request</span>
            </button>
          </form>
        </div>

        {/* Guides & Ticket Status */}
        <div className="space-y-6 lg:col-span-6">
          <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs">
            <h2 className="font-display text-base font-bold text-heading">
              Quick Student Guides
            </h2>
            <div className="mt-3 space-y-3 text-xs text-body">
              <div>
                <strong className="text-heading">Ugandan Grading Scale:</strong> Tests and homework follow UNEB O-Level (D1–F9) or A-Level (A–F) scales configured by administration.
              </div>
              <div>
                <strong className="text-heading">Live Class Attendance:</strong> Joining a live session from the Live Class page records your attendance automatically.
              </div>
              <div className="pt-2">
                <PWAInstallButton variant="card" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs">
            <h2 className="font-display text-base font-bold text-heading">My Support Requests</h2>
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-accent-sky" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted">
                <HelpCircle className="mx-auto h-6 w-6 text-faint mb-2" />
                You have not submitted any help requests yet.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {tickets.map((t) => (
                  <div key={t.id} className="rounded-xl border border-border-theme bg-surface-subtle p-3.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-heading">{t.subject}</span>
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          t.status === 'resolved'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-accent-gold-text'
                        }`}
                      >
                        {t.status === 'resolved' && <CheckCircle2 className="h-3.5 w-3.5" />}
                        {t.status === 'resolved' ? 'Resolved' : 'Open'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-body">{t.message}</p>
                    {t.adminReply && (
                      <div className="mt-2 rounded-lg bg-accent-sky-soft px-3 py-2 text-xs text-heading">
                        <strong>Admin Reply:</strong> {t.adminReply}
                      </div>
                    )}
                    <p className="mt-1.5 text-[11px] text-faint">
                      {t.category} · {formatTimestamp(t.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
