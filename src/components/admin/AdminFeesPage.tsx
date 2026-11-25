import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  Volume2,
  VolumeX,
  X,
  XCircle,
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
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  CLASS_LEVELS,
  ClassLevel,
  FeePaymentRequest,
  FeeRecord,
  formatUGX,
  StudentProfile,
} from '../../types/academy';
import {
  formatTimestamp,
  generateDocId,
  sanitizeSafeReceiptUrl,
  sanitizeString,
} from '../../lib/validation';
import { logPlatformActivity } from '../../lib/activity';
import { ResolvedFileLink, ResolvedImage } from '../ResolvedFileView';

export const AdminFeesPage: React.FC = () => {
  const { adminProfile, academicSettings } = useAuth();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [records, setRecords] = useState<FeeRecord[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<FeePaymentRequest[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [inspectingRequest, setInspectingRequest] = useState<FeePaymentRequest | null>(null);
  const [loading, setLoading] = useState(true);

  // Class fee determination center state
  const [feeStructureDraft, setFeeStructureDraft] = useState<Record<ClassLevel, number>>(
    academicSettings.feeStructure
  );
  const [savingStructure, setSavingStructure] = useState(false);
  const [savedStructureMsg, setSavedStructureMsg] = useState(false);

  // Mute unpaid toggle & display filter
  const [togglingMute, setTogglingMute] = useState(false);
  const [hideUnpaidRows, setHideUnpaidRows] = useState(false);
  const [balanceSearch, setBalanceSearch] = useState('');

  // Individual student fee invoice & payment state
  const [selectedStudentUid, setSelectedStudentUid] = useState('');
  const [determinedStudentFee, setDeterminedStudentFee] = useState('');
  const [savingInvoice, setSavingInvoice] = useState(false);

  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<FeeRecord['paymentMethod']>('Airtel Money');
  const [referenceCode, setReferenceCode] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFeeStructureDraft(academicSettings.feeStructure);
  }, [academicSettings.feeStructure]);

  useEffect(() => {
    const unsubS = onSnapshot(
      collection(db, 'students'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as StudentProfile);
        setStudents(list);
        if (list.length > 0 && !selectedStudentUid) {
          setSelectedStudentUid(list[0].uid);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'students')
    );

    const unsubF = onSnapshot(
      collection(db, 'feeRecords'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as FeeRecord);
        list.sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''));
        setRecords(list);
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'feeRecords')
    );

    const unsubReq = onSnapshot(
      collection(db, 'feePaymentRequests'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as FeePaymentRequest);
        list.sort((a, b) => {
          const rank = { pending: 0, approved: 1, rejected: 2 };
          const rDiff = (rank[a.status] ?? 3) - (rank[b.status] ?? 3);
          if (rDiff !== 0) return rDiff;
          const ta = (a.createdAt as { seconds?: number })?.seconds ?? 0;
          const tb = (b.createdAt as { seconds?: number })?.seconds ?? 0;
          return tb - ta;
        });
        setPaymentRequests(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'feePaymentRequests')
    );

    return () => {
      unsubS();
      unsubF();
      unsubReq();
    };
  }, [selectedStudentUid]);

  const persistAcademicSettings = async (
    nextStructure: Record<ClassLevel, number>,
    nextMuteUnpaid: boolean
  ) => {
    if (!adminProfile) return;
    await setDoc(doc(db, 'settings', 'academic'), {
      termName: academicSettings.termName,
      academicYear: academicSettings.academicYear,
      passMark: academicSettings.passMark,
      gradingSystem: academicSettings.gradingSystem,
      gradeBands: academicSettings.gradeBands,
      schoolMotto: academicSettings.schoolMotto,
      supportPhone: academicSettings.supportPhone,
      supportEmail: academicSettings.supportEmail,
      feeStructure: nextStructure,
      muteUnpaid: nextMuteUnpaid,
      updatedBy: adminProfile.uid,
      updatedAt: serverTimestamp(),
    });
  };

  const handleSaveFeeStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setSavingStructure(true);
    setSavedStructureMsg(false);
    try {
      await persistAcademicSettings(
        feeStructureDraft,
        Boolean(academicSettings.muteUnpaid)
      );
      await logPlatformActivity({
        actorId: adminProfile.uid,
        actorName: adminProfile.fullName,
        actorRole: 'admin',
        action: 'Updated Class Fees Structure',
        details: `${academicSettings.termName} ${academicSettings.academicYear}`,
      });
      setSavedStructureMsg(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/academic');
    } finally {
      setSavingStructure(false);
    }
  };

  const handleToggleMuteUnpaid = async () => {
    if (!adminProfile) return;
    setTogglingMute(true);
    const nextMute = !academicSettings.muteUnpaid;
    try {
      await persistAcademicSettings(feeStructureDraft, nextMute);
      await logPlatformActivity({
        actorId: adminProfile.uid,
        actorName: adminProfile.fullName,
        actorRole: 'admin',
        action: nextMute ? 'Muted Unpaid Students' : 'Unmuted Unpaid Students',
        details: nextMute
          ? 'Unpaid accounts muted across Live Class and Chat'
          : 'Unpaid restriction lifted',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/academic');
    } finally {
      setTogglingMute(false);
    }
  };

  const getStudentDeterminedFee = (stu: StudentProfile): number => {
    const stuRecords = records.filter((r) => r.studentId === stu.uid);
    const customInvoice = stuRecords.find(
      (r) => r.paymentMethod === 'Term Invoice' && r.totalTermFeeUGX > 0
    );
    if (customInvoice) return customInvoice.totalTermFeeUGX;
    const latestWithTotal = stuRecords.find((r) => r.totalTermFeeUGX > 0);
    if (latestWithTotal) return latestWithTotal.totalTermFeeUGX;
    return academicSettings.feeStructure?.[stu.classLevel] ?? 450000;
  };

  const getStudentPaid = (stuUid: string): number =>
    records
      .filter((r) => r.studentId === stuUid)
      .reduce((sum, r) => sum + (r.amountPaidUGX || 0), 0);

  const handleSetStudentFeeDetermination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    const stu = students.find((s) => s.uid === selectedStudentUid);
    if (!stu) return;

    setSavingInvoice(true);
    const determinedUGX = Math.max(0, Number(determinedStudentFee) || 0);
    const existingInvoice = records.find(
      (r) => r.studentId === stu.uid && r.paymentMethod === 'Term Invoice'
    );
    const termLabel = `${academicSettings.termName} ${academicSettings.academicYear}`;

    try {
      if (existingInvoice) {
        await updateDoc(doc(db, 'feeRecords', existingInvoice.id), {
          totalTermFeeUGX: determinedUGX,
          term: termLabel,
        });
      } else {
        const id = generateDocId('inv');
        await setDoc(doc(db, 'feeRecords', id), {
          id,
          studentId: stu.uid,
          studentName: stu.fullName,
          studentNumber: stu.studentNumber || '',
          classLevel: stu.classLevel,
          term: termLabel,
          amountPaidUGX: 0,
          totalTermFeeUGX: determinedUGX,
          paymentMethod: 'Term Invoice',
          referenceCode: `INV-${Date.now().toString().slice(-6)}`,
          recordedBy: adminProfile.uid,
          paidAt: new Date().toISOString().slice(0, 10),
          createdAt: serverTimestamp(),
        });
      }
      await logPlatformActivity({
        actorId: adminProfile.uid,
        actorName: adminProfile.fullName,
        actorRole: 'admin',
        action: 'Determined Student Fee',
        details: `${stu.fullName} (${stu.classLevel}): ${formatUGX(determinedUGX)}`,
      });
      setDeterminedStudentFee('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'feeRecords');
    } finally {
      setSavingInvoice(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    const stu = students.find((s) => s.uid === selectedStudentUid);
    if (!stu) return;

    setSaving(true);
    const id = generateDocId('fee');
    const amountUGX = Math.max(0, Number(amountPaid) || 0);
    const termFee = getStudentDeterminedFee(stu);
    const termLabel = `${academicSettings.termName} ${academicSettings.academicYear}`;

    try {
      await setDoc(doc(db, 'feeRecords', id), {
        id,
        studentId: stu.uid,
        studentName: stu.fullName,
        studentNumber: stu.studentNumber || '',
        classLevel: stu.classLevel,
        term: termLabel,
        amountPaidUGX: amountUGX,
        totalTermFeeUGX: termFee,
        paymentMethod,
        referenceCode: sanitizeString(referenceCode || `RCPT-${Date.now()}`, 80),
        recordedBy: adminProfile.uid,
        paidAt,
        createdAt: serverTimestamp(),
      });
      await logPlatformActivity({
        actorId: adminProfile.uid,
        actorName: adminProfile.fullName,
        actorRole: 'admin',
        action: 'Recorded Fee Payment',
        details: `${stu.fullName} (${stu.classLevel}): ${formatUGX(amountUGX)} via ${paymentMethod}`,
      });
      setAmountPaid('');
      setReferenceCode('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `feeRecords/${id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleApproveRequest = async (req: FeePaymentRequest) => {
    if (!adminProfile) return;
    setProcessingRequestId(req.id);
    const feeId = generateDocId('fee');
    const stu = students.find((s) => s.uid === req.studentId);
    const termFee = stu
      ? getStudentDeterminedFee(stu)
      : academicSettings.feeStructure?.[req.classLevel] ?? 450000;
    const note = sanitizeString(
      noteDrafts[req.id] || 'Payment verified and posted to fee ledger.',
      400
    );

    try {
      await setDoc(doc(db, 'feeRecords', feeId), {
        id: feeId,
        studentId: req.studentId,
        studentName: req.studentName,
        studentNumber: stu?.studentNumber || '',
        classLevel: req.classLevel,
        term: req.term,
        amountPaidUGX: req.amountUGX,
        totalTermFeeUGX: termFee,
        paymentMethod: req.paymentMethod,
        referenceCode: req.referenceCode,
        recordedBy: adminProfile.uid,
        paidAt: new Date().toISOString().slice(0, 10),
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'feePaymentRequests', req.id), {
        status: 'approved',
        adminNote: note,
        updatedAt: serverTimestamp(),
      });

      await logPlatformActivity({
        actorId: adminProfile.uid,
        actorName: adminProfile.fullName,
        actorRole: 'admin',
        action: 'Approved Student Fee Payment',
        details: `${req.studentName} (${req.classLevel}): ${formatUGX(req.amountUGX)} (${req.referenceCode})`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `feePaymentRequests/${req.id}`);
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRejectRequest = async (req: FeePaymentRequest) => {
    if (!adminProfile) return;
    setProcessingRequestId(req.id);
    const note = sanitizeString(
      noteDrafts[req.id] || 'Payment reference could not be verified. Contact bursar.',
      400
    );

    try {
      await updateDoc(doc(db, 'feePaymentRequests', req.id), {
        status: 'rejected',
        adminNote: note,
        updatedAt: serverTimestamp(),
      });

      await logPlatformActivity({
        actorId: adminProfile.uid,
        actorName: adminProfile.fullName,
        actorRole: 'admin',
        action: 'Rejected Student Fee Payment',
        details: `${req.studentName} (${req.classLevel}): ${formatUGX(req.amountUGX)} (${req.referenceCode})`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `feePaymentRequests/${req.id}`);
    } finally {
      setProcessingRequestId(null);
    }
  };

  const isMuted = Boolean(academicSettings.muteUnpaid);
  const totalCollected = records.reduce((sum, r) => sum + (r.amountPaidUGX || 0), 0);
  const pendingRequestsCount = paymentRequests.filter((r) => r.status === 'pending').length;

  const studentFeeSummaries = students.map((stu) => {
    const determined = getStudentDeterminedFee(stu);
    const paid = getStudentPaid(stu.uid);
    const balance = Math.max(0, determined - paid);
    return { stu, determined, paid, balance, isUnpaid: balance > 0 };
  });

  const paidCount = studentFeeSummaries.filter((s) => !s.isUnpaid).length;
  const unpaidCount = studentFeeSummaries.filter((s) => s.isUnpaid).length;
  const visibleStudentSummaries = studentFeeSummaries.filter((s) => {
    if (hideUnpaidRows && s.isUnpaid) return false;
    if (balanceSearch.trim()) {
      const q = balanceSearch.toLowerCase();
      return (
        s.stu.fullName.toLowerCase().includes(q) ||
        s.stu.classLevel.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-heading">
            Student Fees Amount Determination Center
          </h1>
          <p className="mt-1 text-sm text-muted">
            Determine S1–S6 and individual student fee amounts in UGX, verify Airtel Money ({academicSettings.supportPhone || '256753336009'}) screenshots, and mute unpaid access.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={togglingMute}
            onClick={handleToggleMuteUnpaid}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors ${
              isMuted
                ? 'border-sky-500/40 bg-btn-primary text-white'
                : 'border-border-theme bg-surface text-body hover:bg-surface-muted'
            }`}
          >
            {togglingMute ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isMuted ? (
              <VolumeX className="h-4 w-4 text-accent-gold" />
            ) : (
              <Volume2 className="h-4 w-4 text-muted" />
            )}
            <span>{isMuted ? 'Unpaid Muted: ON' : 'Mute Unpaid: OFF'}</span>
          </button>

          <div className="rounded-xl border border-border-theme bg-surface px-4 py-2">
            <div className="text-[11px] font-medium text-muted">Total Collected</div>
            <div className="font-display text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {formatUGX(totalCollected)}
            </div>
          </div>
        </div>
      </div>

      {/* Central Class & Student Fees Amount Determination Center */}
      <section className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-heading">
              Fees Amount Determination Center ({academicSettings.termName} {academicSettings.academicYear})
            </h2>
            <p className="text-xs text-muted">
              Set standard class tuition per level or assign an exact fee amount to an individual student.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold tabular-nums">
            <span className="text-emerald-700 dark:text-emerald-400">{paidCount} Cleared</span>
            <span className="text-faint">{unpaidCount} Unpaid</span>
          </div>
        </div>

        <form onSubmit={handleSaveFeeStructure} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {CLASS_LEVELS.map((c) => (
              <div key={c.code} className="rounded-xl border border-border-theme bg-surface-subtle p-3">
                <label className="block text-xs font-bold text-heading">{c.code} Term Fee</label>
                <input
                  type="number"
                  min={0}
                  value={feeStructureDraft[c.code] ?? 0}
                  onChange={(e) =>
                    setFeeStructureDraft((prev) => ({
                      ...prev,
                      [c.code]: Number(e.target.value),
                    }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-border-input bg-input-bg px-2.5 py-1.5 font-mono text-xs font-semibold text-heading"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={savingStructure}
              className="inline-flex items-center gap-2 rounded-xl bg-btn-primary px-4 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover disabled:opacity-60"
            >
              {savingStructure ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 text-accent-gold" />
              )}
              <span>Save Class Fee Amounts</span>
            </button>
            {savedStructureMsg && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                Fee structure updated
              </span>
            )}
          </div>
        </form>

        {/* Per-student fee determination row */}
        <form
          onSubmit={handleSetStudentFeeDetermination}
          className="grid grid-cols-1 gap-3 border-t border-border-subtle pt-5 sm:grid-cols-12 sm:items-end"
        >
          <div className="sm:col-span-5">
            <label className="block text-xs font-semibold text-body">
              Determine Individual Student Fee Amount
            </label>
            <select
              required
              value={selectedStudentUid}
              onChange={(e) => setSelectedStudentUid(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-sm text-heading"
            >
              {students.length === 0 ? (
                <option value="">No registered students</option>
              ) : (
                students.map((s) => (
                  <option key={s.uid} value={s.uid}>
                    {s.fullName} ({s.classLevel})
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-body">
              Determined Term Amount (UGX)
            </label>
            <input
              type="number"
              required
              min={0}
              value={determinedStudentFee}
              onChange={(e) => setDeterminedStudentFee(e.target.value)}
              placeholder="e.g. 520000"
              className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 font-mono text-sm text-heading"
            />
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={savingInvoice || students.length === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-btn-primary bg-surface px-4 py-2 text-xs font-semibold text-heading hover:bg-surface-muted disabled:opacity-50"
            >
              {savingInvoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>Set Student Amount</span>
            </button>
          </div>
        </form>
      </section>

      {/* Student Payment Submissions Verification Queue */}
      <section className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
          <div>
            <h2 className="font-display text-base font-bold text-heading">
              Student Payment Submissions ({paymentRequests.length})
            </h2>
            <p className="text-xs text-muted">
              Verify payments submitted by students via the Pay School Fees button to post official
              receipts.
            </p>
          </div>
          {pendingRequestsCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <Clock className="h-3.5 w-3.5" />
              {pendingRequestsCount} Pending Review
            </span>
          )}
        </div>

        {paymentRequests.length === 0 ? (
          <p className="py-3 text-xs text-muted">
            No student payment submissions yet.
          </p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {paymentRequests.map((req) => {
              const safeReceipt = sanitizeSafeReceiptUrl(req.receiptUrl, 900000);
              const isBusy = processingRequestId === req.id;
              return (
                <div
                  key={req.id}
                  className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex items-start gap-3">
                    {safeReceipt && !safeReceipt.startsWith('chunked://') && !safeReceipt.startsWith('data:application/pdf') && (
                      <button
                        type="button"
                        onClick={() => setInspectingRequest(req)}
                        className="group relative shrink-0 overflow-hidden rounded-xl border border-border-theme bg-surface-muted"
                        title="Inspect payment proof screenshot"
                      >
                        <img
                          src={safeReceipt}
                          alt={`Payment proof from ${req.studentName}`}
                          className="h-14 w-14 object-cover"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-[#0B1F3A]/40 opacity-0 transition-opacity group-hover:opacity-100">
                          <Eye className="h-4 w-4 text-white" />
                        </span>
                      </button>
                    )}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-display text-sm font-bold text-heading">
                          {req.studentName} · {req.classLevel}
                        </span>
                        <span className="font-display text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {formatUGX(req.amountUGX)}
                        </span>
                        {req.status === 'pending' && (
                          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Pending</span>
                        )}
                        {req.status === 'approved' && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approved
                          </span>
                        )}
                        {req.status === 'rejected' && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                            <XCircle className="h-3.5 w-3.5" />
                            Rejected
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted font-mono">
                        {req.paymentMethod} · Ref: {req.referenceCode}
                        {req.payerPhone ? ` · Phone: ${req.payerPhone}` : ''} ·{' '}
                        {formatTimestamp(req.createdAt)}
                      </div>
                      {safeReceipt && (
                        <button
                          type="button"
                          onClick={() => setInspectingRequest(req)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-accent-sky-text hover:underline"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Inspect Payment Screenshot</span>
                        </button>
                      )}
                      {req.status !== 'pending' && req.adminNote && (
                        <div className="text-xs text-muted">Note: {req.adminNote}</div>
                      )}
                    </div>
                  </div>

                  {req.status === 'pending' ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="text"
                        maxLength={400}
                        value={noteDrafts[req.id] || ''}
                        onChange={(e) =>
                          setNoteDrafts((prev) => ({ ...prev, [req.id]: e.target.value }))
                        }
                        placeholder="Optional bursar note"
                        className="w-full sm:w-52 rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs text-heading"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleApproveRequest(req)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          <span>Approve & Post Receipt</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleRejectRequest(req)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-800/70 bg-surface px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => deleteDoc(doc(db, 'feePaymentRequests', req.id))}
                      className="self-start lg:self-center rounded-lg p-1.5 text-faint hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 dark:hover:text-rose-400"
                      aria-label="Remove payment submission"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Record Payment + Ledger & Student Status */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleRecordPayment}
          className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4 lg:col-span-4"
        >
          <h2 className="font-display text-lg font-bold text-heading">
            Record Fee Payment
          </h2>

          <div>
            <label className="block text-xs font-semibold text-body">Student</label>
            <select
              required
              value={selectedStudentUid}
              onChange={(e) => setSelectedStudentUid(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2.5 text-sm text-heading"
            >
              {students.length === 0 ? (
                <option value="">No registered students</option>
              ) : (
                students.map((s) => (
                  <option key={s.uid} value={s.uid}>
                    {s.fullName} ({s.classLevel})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-body">
              Amount Paid (UGX)
            </label>
            <input
              type="number"
              required
              min={1000}
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder="e.g. 250000"
              className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2.5 font-mono text-sm text-heading"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-body">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as FeeRecord['paymentMethod'])}
              className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2.5 text-sm text-heading"
            >
              <option value="Airtel Money">Airtel Money</option>
              <option value="MTN MoMo">MTN MoMo</option>
              <option value="Bank Deposit">Bank Deposit</option>
              <option value="Cash Receipt">Cash Receipt</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-body">Receipt / Ref</label>
              <input
                type="text"
                required
                value={referenceCode}
                onChange={(e) => setReferenceCode(e.target.value)}
                placeholder="AIRTEL-8921"
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 font-mono text-xs text-heading"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-body">Payment Date</label>
              <input
                type="date"
                required
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs text-heading"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || students.length === 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-btn-primary-hover disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span>Save Payment Receipt</span>
          </button>
        </form>

        <div className="space-y-6 lg:col-span-8">
          {/* Student Balances (Mute Unpaid view) */}
          <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="font-display text-base font-bold text-heading">
                Student Fee Balances ({visibleStudentSummaries.length})
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                  <input
                    type="text"
                    value={balanceSearch}
                    onChange={(e) => setBalanceSearch(e.target.value)}
                    placeholder="Filter student..."
                    className="w-40 rounded-lg border border-border-theme bg-input-bg py-1.5 pl-8 pr-2.5 text-xs text-heading focus:border-accent-sky focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setHideUnpaidRows((prev) => !prev)}
                  className="rounded-lg border border-border-theme bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-muted"
                >
                  {hideUnpaidRows ? 'Show Unpaid' : 'Mute Unpaid Rows'}
                </button>
              </div>
            </div>

            {visibleStudentSummaries.length === 0 ? (
              <p className="py-4 text-xs text-muted">No students to display.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border-subtle text-muted">
                    <tr>
                      <th className="py-2 pr-3">Student</th>
                      <th className="py-2 pr-3">Determined Fee</th>
                      <th className="py-2 pr-3">Paid</th>
                      <th className="py-2 pr-3">Balance</th>
                      <th className="py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {visibleStudentSummaries.map(({ stu, determined, paid, balance, isUnpaid }) => (
                      <tr
                        key={stu.uid}
                        className={isUnpaid ? 'text-faint bg-surface-subtle' : 'text-heading'}
                      >
                        <td className="py-2.5 pr-3 font-semibold">
                          {stu.fullName} · {stu.classLevel}
                        </td>
                        <td className="py-2.5 pr-3 font-mono tabular-nums">
                          {formatUGX(determined)}
                        </td>
                        <td className="py-2.5 pr-3 font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatUGX(paid)}
                        </td>
                        <td className="py-2.5 pr-3 font-mono tabular-nums">
                          {formatUGX(balance)}
                        </td>
                        <td className="py-2.5 text-right font-semibold">
                          {isUnpaid ? (
                            <span className="text-faint">
                              {isMuted ? 'Unpaid (Muted)' : 'Unpaid'}
                            </span>
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400">Cleared</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Payment Ledger */}
          <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-bold text-heading">
                Fee Ledger ({records.filter((r) => r.amountPaidUGX > 0).length})
              </h2>
              <CreditCard className="h-4 w-4 text-faint" />
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-accent-sky" />
              </div>
            ) : records.length === 0 ? (
              <p className="py-6 text-xs text-muted">No fee records recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border-subtle text-xs text-muted">
                    <tr>
                      <th className="py-2.5 pr-4">Student</th>
                      <th className="py-2.5 pr-4">Method & Ref</th>
                      <th className="py-2.5 pr-4">Amount</th>
                      <th className="py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {records.map((r) => (
                      <tr
                        key={r.id}
                        className={r.amountPaidUGX === 0 ? 'text-faint' : ''}
                      >
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-heading">{r.studentName}</div>
                          <div className="text-xs text-muted">{r.classLevel}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="text-xs font-medium text-heading">{r.paymentMethod}</div>
                          <div className="text-xs font-mono text-muted">
                            {r.referenceCode} · {r.paidAt}
                          </div>
                        </td>
                        <td className="py-3 pr-4 font-display font-bold tabular-nums">
                          {r.paymentMethod === 'Term Invoice' ? (
                            <span className="text-xs text-muted">
                              Determined: {formatUGX(r.totalTermFeeUGX)}
                            </span>
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400">{formatUGX(r.amountPaidUGX)}</span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => deleteDoc(doc(db, 'feeRecords', r.id))}
                            className="rounded-lg p-1.5 text-faint hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 dark:hover:text-rose-400"
                            aria-label="Delete fee record"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inline Proof-of-Payment Screenshot Viewer Modal */}
      {inspectingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-surface p-5 shadow-xl border border-border-theme space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-heading">
                  {inspectingRequest.studentName} · {inspectingRequest.classLevel}
                </h3>
                <p className="text-xs text-muted font-mono">
                  {inspectingRequest.paymentMethod} · {formatUGX(inspectingRequest.amountUGX)} · Ref:{' '}
                  {inspectingRequest.referenceCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingRequest(null)}
                className="rounded-lg p-1.5 text-faint hover:bg-surface-muted hover:text-body"
                aria-label="Close screenshot viewer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {sanitizeSafeReceiptUrl(inspectingRequest.receiptUrl, 900000) ? (
              inspectingRequest.receiptUrl.startsWith('data:application/pdf') ? (
                <ResolvedFileLink
                  url={inspectingRequest.receiptUrl}
                  fileName={`receipt_${inspectingRequest.referenceCode}.pdf`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-3 text-xs font-semibold text-white hover:bg-btn-primary-hover"
                >
                  <Eye className="h-4 w-4" />
                  <span>Open / Download PDF Receipt</span>
                </ResolvedFileLink>
              ) : (
                <div className="space-y-2.5">
                  <ResolvedImage
                    url={inspectingRequest.receiptUrl}
                    alt="Student payment proof"
                    className="max-h-[60vh] w-full rounded-xl object-contain bg-surface-subtle border border-border-theme"
                  />
                  <ResolvedFileLink
                    url={inspectingRequest.receiptUrl}
                    fileName={`receipt_${inspectingRequest.referenceCode}`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border-theme bg-surface-subtle px-4 py-2 text-xs font-semibold text-heading hover:bg-surface-muted"
                  >
                    <Eye className="h-3.5 w-3.5 text-accent-sky" />
                    <span>Open / Download Full Proof File (Photo or PDF)</span>
                  </ResolvedFileLink>
                </div>
              )
            ) : (
              <p className="py-6 text-center text-xs text-muted">
                No screenshot attached to this submission.
              </p>
            )}

            {inspectingRequest.status === 'pending' && (
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={processingRequestId === inspectingRequest.id}
                  onClick={async () => {
                    await handleRejectRequest(inspectingRequest);
                    setInspectingRequest(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-800/70 bg-surface px-4 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span>Reject</span>
                </button>
                <button
                  type="button"
                  disabled={processingRequestId === inspectingRequest.id}
                  onClick={async () => {
                    await handleApproveRequest(inspectingRequest);
                    setInspectingRequest(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Approve & Post Receipt</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
