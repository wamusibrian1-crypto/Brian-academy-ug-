import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Image as ImageIcon,
  Loader2,
  Phone,
  Receipt,
  Send,
  Trash2,
  VolumeX,
  X,
  XCircle,
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
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, handleFirestoreError, OperationType, storage } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { FeePaymentRequest, FeeRecord, formatUGX } from '../../types/academy';
import {
  compressImageToDataUrl,
  formatTimestamp,
  generateDocId,
  sanitizeSafeReceiptUrl,
  sanitizeString,
} from '../../lib/validation';
import { logPlatformActivity } from '../../lib/activity';

interface StudentFeesPageProps {
  onBack: () => void;
}

export const StudentFeesPage: React.FC<StudentFeesPageProps> = ({ onBack }) => {
  const { studentProfile, academicSettings } = useAuth();
  const [records, setRecords] = useState<FeeRecord[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<FeePaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const airtelNumber = academicSettings.supportPhone || '0753336009';

  // Payment form state
  const [showPayPanel, setShowPayPanel] = useState(false);
  const [amountUGX, setAmountUGX] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<FeePaymentRequest['paymentMethod']>('Airtel Money');
  const [referenceCode, setReferenceCode] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [compressingImg, setCompressingImg] = useState(false);
  const [screenshotNotice, setScreenshotNotice] = useState<string | null>(null);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [previewScreenshot, setPreviewScreenshot] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!studentProfile) return;
    const qRecords = query(
      collection(db, 'feeRecords'),
      where('studentId', '==', studentProfile.uid)
    );
    const unsubRecords = onSnapshot(
      qRecords,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as FeeRecord);
        list.sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''));
        setRecords(list);
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'feeRecords')
    );

    const qRequests = query(
      collection(db, 'feePaymentRequests'),
      where('studentId', '==', studentProfile.uid)
    );
    const unsubRequests = onSnapshot(
      qRequests,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as FeePaymentRequest);
        list.sort((a, b) => {
          const ta = (a.createdAt as { seconds?: number })?.seconds ?? 0;
          const tb = (b.createdAt as { seconds?: number })?.seconds ?? 0;
          return tb - ta;
        });
        setPaymentRequests(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'feePaymentRequests')
    );

    return () => {
      unsubRecords();
      unsubRequests();
    };
  }, [studentProfile]);

  if (!studentProfile) return null;

  const customInvoice = records.find(
    (r) => r.paymentMethod === 'Term Invoice' && r.totalTermFeeUGX > 0
  );
  const latestWithFee = records.find((r) => r.totalTermFeeUGX > 0);
  const expectedTermFee =
    customInvoice?.totalTermFeeUGX ??
    latestWithFee?.totalTermFeeUGX ??
    academicSettings.feeStructure?.[studentProfile.classLevel] ??
    450000;

  const paymentReceipts = records.filter((r) => r.amountPaidUGX > 0);
  const totalPaid = paymentReceipts.reduce((sum, r) => sum + (r.amountPaidUGX || 0), 0);
  const balance = Math.max(0, expectedTermFee - totalPaid);
  const isUnpaidMuted = Boolean(academicSettings.muteUnpaid) && balance > 0;

  const openPayPanel = () => {
    setSubmitError(null);
    setSubmitSuccess(null);
    setScreenshotNotice(null);
    if (!amountUGX && balance > 0) {
      setAmountUGX(String(balance));
    }
    setShowPayPanel(true);
  };

  const handleCopyNumber = async () => {
    try {
      await navigator.clipboard.writeText(airtelNumber);
      setCopiedPhone(true);
      window.setTimeout(() => setCopiedPhone(false), 2500);
    } catch {
      // Clipboard may not be permitted
    }
  };

  const handleScreenshotSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshotNotice(null);
    setSubmitError(null);

    if (!file.type.startsWith('image/')) {
      setSubmitError('Please select a screenshot image (PNG, JPG, or WebP).');
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `submissions/fees/${studentProfile.uid}/${Date.now()}_${safeName}`;
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      'state_changed',
      (snap) => {
        setUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      async () => {
        // Fallback: compress screenshot directly in browser so proof-of-payment ALWAYS succeeds
        setUploadPct(null);
        setCompressingImg(true);
        try {
          const compressed = await compressImageToDataUrl(file);
          setReceiptUrl(compressed);
          setScreenshotNotice('Screenshot attached and ready to submit.');
        } catch (compErr) {
          setSubmitError(
            compErr instanceof Error
              ? compErr.message
              : 'Could not process screenshot. Please try another image.'
          );
        } finally {
          setCompressingImg(false);
        }
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setReceiptUrl(url);
        setUploadPct(null);
        setScreenshotNotice('Screenshot uploaded successfully.');
      }
    );
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    const parsedAmount = Math.round(Number(amountUGX) || 0);
    if (parsedAmount < 1000 || parsedAmount > 50000000) {
      setSubmitError('Please enter a valid payment amount between UGX 1,000 and UGX 50,000,000.');
      return;
    }

    const trimmedReceiptInput = receiptUrl.trim();
    const cleanReceiptUrl = sanitizeSafeReceiptUrl(trimmedReceiptInput, 250000);
    if (trimmedReceiptInput && !cleanReceiptUrl) {
      setSubmitError('Please upload a valid screenshot image or paste an https:// receipt link.');
      return;
    }

    let cleanRef = sanitizeString(referenceCode, 80);
    if (!cleanRef) {
      if (cleanReceiptUrl) {
        cleanRef = `${paymentMethod === 'Airtel Money' ? 'AIRTEL' : 'PROOF'}-SCREENSHOT-${Date.now()
          .toString()
          .slice(-5)}`;
      } else {
        setSubmitError(
          'Please upload a screenshot as proof of payment or enter your Airtel Money / MoMo Transaction ID.'
        );
        return;
      }
    }

    setSubmitting(true);
    const id = generateDocId('payreq');
    const path = `feePaymentRequests/${id}`;
    const termLabel = sanitizeString(
      `${academicSettings.termName} ${academicSettings.academicYear}`,
      60
    );

    try {
      await setDoc(doc(db, 'feePaymentRequests', id), {
        id,
        studentId: studentProfile.uid,
        studentName: sanitizeString(studentProfile.fullName, 120),
        classLevel: studentProfile.classLevel,
        term: termLabel,
        amountUGX: parsedAmount,
        paymentMethod,
        referenceCode: cleanRef,
        payerPhone: sanitizeString(payerPhone, 40),
        receiptUrl: cleanReceiptUrl,
        adminNote: '',
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await logPlatformActivity({
        actorId: studentProfile.uid,
        actorName: studentProfile.fullName,
        actorRole: 'student',
        action: 'Submitted Fee Payment',
        details: `${studentProfile.classLevel}: ${formatUGX(parsedAmount)} via ${paymentMethod} (${cleanRef})`,
      });

      setAmountUGX('');
      setReferenceCode('');
      setPayerPhone('');
      setReceiptUrl('');
      setScreenshotNotice(null);
      setShowPayPanel(false);
      setSubmitSuccess(
        'Payment proof submitted! The bursar will verify your Airtel Money / MoMo screenshot shortly.'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
            <h1 className="font-display text-2xl font-bold text-heading">School Fees</h1>
            <p className="text-xs text-muted">
              {academicSettings.termName} {academicSettings.academicYear} ·{' '}
              {studentProfile.classLevel}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => (showPayPanel ? setShowPayPanel(false) : openPayPanel())}
          className="inline-flex items-center gap-2 rounded-xl bg-btn-primary px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-btn-primary-hover"
        >
          <CreditCard className="h-4 w-4 text-accent-gold" />
          <span>{showPayPanel ? 'Close Payment Form' : 'Pay School Fees'}</span>
        </button>
      </div>

      {/* Airtel Money Payment Instructions Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-200 dark:border-rose-800/70 bg-gradient-to-r from-rose-50 via-white to-amber-50/70 dark:from-rose-950/60 dark:via-surface dark:to-amber-950/40 p-4 sm:p-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-600 text-white shrink-0">
            <Phone className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-rose-700 dark:text-rose-400">
              Airtel Money School Fees Payment
            </div>
            <div className="mt-0.5 font-display text-lg font-extrabold text-heading tabular-nums">
              {airtelNumber}
            </div>
            <p className="text-xs text-body">
              Send fees via Airtel Money to <strong>{airtelNumber}</strong>, then tap{' '}
              <strong>Pay School Fees</strong> and upload your payment screenshot.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyNumber}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-input bg-surface px-3.5 py-2 text-xs font-semibold text-heading hover:bg-surface-muted transition-colors"
          >
            {copiedPhone ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-muted" />
                <span>Copy {airtelNumber}</span>
              </>
            )}
          </button>
          {!showPayPanel && (
            <button
              type="button"
              onClick={openPayPanel}
              className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
            >
              Upload Proof
            </button>
          )}
        </div>
      </div>

      {isUnpaidMuted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-theme bg-surface-muted px-4 py-3 text-xs font-medium text-body">
          <div className="flex items-center gap-2.5">
            <VolumeX className="h-4 w-4 text-muted shrink-0" />
            <span>
              Unpaid status is currently muted. Pay via Airtel Money ({airtelNumber}) and upload your
              screenshot to unlock live lessons and class chat.
            </span>
          </div>
          {!showPayPanel && (
            <button
              type="button"
              onClick={openPayPanel}
              className="rounded-lg bg-btn-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-btn-primary-hover"
            >
              Pay Now
            </button>
          )}
        </div>
      )}

      {submitSuccess && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/50 px-4 py-3 text-xs font-medium text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{submitSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setSubmitSuccess(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:opacity-80"
            aria-label="Dismiss message"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border-theme bg-surface p-5">
          <div className="text-xs font-medium text-muted">
            Determined Tuition ({studentProfile.classLevel})
          </div>
          <div className="mt-1.5 font-display text-xl font-bold text-heading tabular-nums">
            {formatUGX(expectedTermFee)}
          </div>
        </div>
        <div className="rounded-2xl border border-border-theme bg-surface p-5">
          <div className="text-xs font-medium text-muted">Total Paid</div>
          <div className="mt-1.5 font-display text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {formatUGX(totalPaid)}
          </div>
        </div>
        <div className="rounded-2xl border border-border-theme bg-surface-subtle p-5 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-faint">
              {balance > 0 ? 'Unpaid Balance (Muted)' : 'Account Cleared'}
            </div>
            <div
              className={`mt-1.5 font-display text-xl font-bold tabular-nums ${
                balance > 0 ? 'text-faint' : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {formatUGX(balance)}
            </div>
          </div>
          {balance > 0 && !showPayPanel && (
            <button
              type="button"
              onClick={openPayPanel}
              className="shrink-0 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-700"
            >
              Pay Balance
            </button>
          )}
        </div>
      </div>

      {/* Inline Student Payment Submission Form */}
      {showPayPanel && (
        <form
          onSubmit={handleSubmitPayment}
          className="rounded-2xl border border-sky-200 dark:border-sky-800/70 bg-surface p-6 shadow-xs space-y-5"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border-subtle pb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-heading">
                Pay School Fees & Upload Screenshot
              </h2>
              <p className="mt-0.5 text-xs text-body">
                Send fees on <strong>Airtel Money to {airtelNumber}</strong> (or MTN MoMo / Bank
                Deposit), then upload a screenshot of your confirmation message below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPayPanel(false)}
              className="rounded-lg p-1.5 text-faint hover:bg-surface-muted hover:text-body"
              aria-label="Close payment form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {submitError && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300">
              {submitError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-body">
                  Amount Paid (UGX)
                </label>
                {balance > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmountUGX(String(balance))}
                    className="text-[11px] font-semibold text-accent-sky-text hover:underline"
                  >
                    Fill Balance ({formatUGX(balance)})
                  </button>
                )}
              </div>
              <input
                type="number"
                required
                min={1000}
                max={50000000}
                value={amountUGX}
                onChange={(e) => setAmountUGX(e.target.value)}
                placeholder="e.g. 250000"
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2.5 font-mono text-sm focus:border-accent-sky focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as FeePaymentRequest['paymentMethod'])
                }
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2.5 text-sm focus:border-accent-sky focus:outline-none"
              >
                <option value="Airtel Money">Airtel Money ({airtelNumber})</option>
                <option value="MTN MoMo">MTN MoMo</option>
                <option value="Bank Deposit">Bank Deposit</option>
                <option value="Cash Receipt">Cash Receipt</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">
                Transaction ID / Reference {receiptUrl ? '(Optional with Screenshot)' : ''}
              </label>
              <input
                type="text"
                maxLength={80}
                value={referenceCode}
                onChange={(e) => setReferenceCode(e.target.value)}
                placeholder="e.g. AIRTEL-MP260411 or SMS ID"
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2.5 font-mono text-sm focus:border-accent-sky focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">
                Your Phone Number Used to Pay
              </label>
              <input
                type="text"
                maxLength={40}
                value={payerPhone}
                onChange={(e) => setPayerPhone(e.target.value)}
                placeholder="e.g. 075..."
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2.5 text-sm focus:border-accent-sky focus:outline-none"
              />
            </div>
          </div>

          {/* Screenshot Upload Box */}
          <div className="rounded-2xl border-2 border-dashed border-sky-200 dark:border-sky-800/70 bg-accent-sky-soft p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-heading">
                  Upload Screenshot as Proof of Payment
                </div>
                <p className="text-[11px] text-muted">
                  Attach your Airtel Money / MoMo SMS or app receipt screenshot (PNG, JPG, WebP).
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-btn-primary px-4 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors">
                <ImageIcon className="h-4 w-4 text-accent-gold" />
                <span>{receiptUrl ? 'Change Screenshot' : 'Choose Screenshot'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshotSelected}
                  className="hidden"
                />
              </label>
            </div>

            {(uploadPct !== null || compressingImg) && (
              <div className="flex items-center gap-2 text-xs font-semibold text-accent-sky-text">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>
                  {compressingImg
                    ? 'Preparing screenshot proof...'
                    : `Uploading screenshot: ${uploadPct}%`}
                </span>
              </div>
            )}

            {screenshotNotice && (
              <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {screenshotNotice}
              </div>
            )}

            {sanitizeSafeReceiptUrl(receiptUrl) && (
              <div className="flex items-start gap-3 rounded-xl border border-border-theme bg-surface p-3">
                <img
                  src={sanitizeSafeReceiptUrl(receiptUrl)}
                  alt="Uploaded payment proof preview"
                  className="h-24 w-24 rounded-lg object-cover border border-border-theme"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-heading">
                    Payment Screenshot Ready
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Visible to the school bursar for verification.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptUrl('');
                      setScreenshotNotice(null);
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Remove Screenshot</span>
                  </button>
                </div>
              </div>
            )}

            <input
              type="url"
              maxLength={1000}
              value={receiptUrl.startsWith('data:') ? '' : receiptUrl}
              onChange={(e) => setReceiptUrl(e.target.value)}
              placeholder="Or paste an https:// link to your payment screenshot (optional)"
              className="w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-xs focus:border-accent-sky focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => setShowPayPanel(false)}
              className="rounded-xl border border-border-theme px-4 py-2.5 text-xs font-semibold text-body hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploadPct !== null || compressingImg}
              className="inline-flex items-center gap-2 rounded-xl bg-btn-primary px-5 py-2.5 text-xs font-semibold text-white hover:bg-btn-primary-hover disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4 text-accent-gold" />
              )}
              <span>Submit Payment Proof</span>
            </button>
          </div>
        </form>
      )}

      {/* Submitted Student Payment Requests */}
      {paymentRequests.length > 0 && (
        <div className="rounded-2xl border border-border-theme bg-surface overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-4 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-heading">
              Submitted Payment Proofs ({paymentRequests.length})
            </h2>
            <Clock className="h-4 w-4 text-faint" />
          </div>
          <div className="divide-y divide-border-subtle">
            {paymentRequests.map((req) => {
              const safeReceipt = sanitizeSafeReceiptUrl(req.receiptUrl);
              return (
                <div
                  key={req.id}
                  className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-heading">
                      <span>
                        {req.paymentMethod} · {formatUGX(req.amountUGX)}
                      </span>
                      {req.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                          <Clock className="h-3.5 w-3.5" />
                          Pending Verification
                        </span>
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
                    <div className="mt-0.5 text-xs text-muted font-mono">
                      Ref: {req.referenceCode}
                      {req.payerPhone ? ` · Phone: ${req.payerPhone}` : ''} ·{' '}
                      {formatTimestamp(req.createdAt)}
                    </div>
                    {req.adminNote && (
                      <div className="mt-1 text-xs text-body">
                        Bursar note: {req.adminNote}
                      </div>
                    )}
                  </div>
                  {safeReceipt && (
                    <button
                      type="button"
                      onClick={() => setPreviewScreenshot(safeReceipt)}
                      className="inline-flex items-center gap-2 rounded-xl border border-border-theme bg-surface-subtle px-3 py-1.5 text-xs font-semibold text-heading hover:bg-surface-muted shrink-0"
                    >
                      <img
                        src={safeReceipt}
                        alt="Proof thumbnail"
                        className="h-6 w-6 rounded object-cover"
                      />
                      <span>View Screenshot</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Official Verified Payment History */}
      <div className="rounded-2xl border border-border-theme bg-surface overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-4 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-heading">
            Verified Payment Receipts
          </h2>
          <Receipt className="h-4 w-4 text-faint" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-accent-sky" />
          </div>
        ) : paymentReceipts.length === 0 ? (
          <div className="p-8 text-center">
            <Receipt className="mx-auto h-7 w-7 text-faint" />
            <p className="mt-2 text-sm text-muted">
              No verified payment receipts posted yet for {studentProfile.fullName}.
            </p>
            <p className="mt-1 text-xs text-faint">
              Send Airtel Money to {airtelNumber} and tap Pay School Fees above to upload your
              screenshot.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {paymentReceipts.map((rec) => (
              <div
                key={rec.id}
                className="flex flex-col justify-between gap-2 px-5 py-4 sm:flex-row sm:items-center"
              >
                <div>
                  <div className="text-sm font-semibold text-heading">
                    {rec.term} · {rec.paymentMethod}
                  </div>
                  <div className="mt-0.5 text-xs text-muted font-mono">
                    Ref: {rec.referenceCode} · Date: {rec.paidAt}
                  </div>
                </div>
                <div className="font-display text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatUGX(rec.amountPaidUGX)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inline Full-Size Screenshot Preview Modal */}
      {previewScreenshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-surface p-4 shadow-xl border border-border-theme space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-heading">
                Payment Proof Screenshot
              </h3>
              <button
                type="button"
                onClick={() => setPreviewScreenshot(null)}
                className="rounded-lg p-1.5 text-faint hover:bg-surface-muted hover:text-heading"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img
              src={previewScreenshot}
              alt="Payment proof screenshot"
              className="max-h-[70vh] w-full rounded-xl object-contain bg-surface-muted"
            />
          </div>
        </div>
      )}
    </div>
  );
};
