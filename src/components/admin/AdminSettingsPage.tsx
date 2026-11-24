import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileUp,
  Globe,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
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
  AdminInvite,
  AdminProfile,
  AdvertPhoto,
  CLASS_LEVELS,
  ClassLevel,
  DEFAULT_UNEB_A_LEVEL_BANDS,
  DEFAULT_UNEB_O_LEVEL_BANDS,
  GradeBand,
  GradingSystemType,
} from '../../types/academy';
import {
  generateDocId,
  getLiveAppUrl,
  sanitizeSafeImageUrl,
  sanitizeString,
} from '../../lib/validation';
import { ThemeToggle } from '../ThemeToggle';

export const AdminSettingsPage: React.FC = () => {
  const { adminProfile, academicSettings } = useAuth();
  const isOwner = adminProfile?.role === 'owner';

  const [termName, setTermName] = useState(academicSettings.termName);
  const [academicYear, setAcademicYear] = useState(academicSettings.academicYear);
  const [passMark, setPassMark] = useState(academicSettings.passMark);
  const [gradingSystem, setGradingSystem] = useState<GradingSystemType>(
    academicSettings.gradingSystem
  );
  const [gradeBands, setGradeBands] = useState<GradeBand[]>(academicSettings.gradeBands);
  const [schoolMotto, setSchoolMotto] = useState(academicSettings.schoolMotto);
  const [supportPhone, setSupportPhone] = useState(academicSettings.supportPhone);
  const [supportEmail, setSupportEmail] = useState(academicSettings.supportEmail);
  const [feeStructure, setFeeStructure] = useState<Record<ClassLevel, number>>(
    academicSettings.feeStructure
  );
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  // Owner-only Admin invites
  const [adminInvites, setAdminInvites] = useState<AdminInvite[]>([]);
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviting, setInviting] = useState(false);

  // First-page Advert Photos
  const [adverts, setAdverts] = useState<AdvertPhoto[]>([]);
  const [advertTitle, setAdvertTitle] = useState('');
  const [advertCaption, setAdvertCaption] = useState('');
  const [advertImageUrl, setAdvertImageUrl] = useState('');
  const [advertUploadPct, setAdvertUploadPct] = useState<number | null>(null);
  const [advertStorageNotice, setAdvertStorageNotice] = useState<string | null>(null);
  const [savingAdvert, setSavingAdvert] = useState(false);
  const [copiedLiveUrl, setCopiedLiveUrl] = useState(false);

  useEffect(() => {
    setTermName(academicSettings.termName);
    setAcademicYear(academicSettings.academicYear);
    setPassMark(academicSettings.passMark);
    setGradingSystem(academicSettings.gradingSystem);
    setGradeBands(academicSettings.gradeBands);
    setSchoolMotto(academicSettings.schoolMotto);
    setSupportPhone(academicSettings.supportPhone);
    setSupportEmail(academicSettings.supportEmail);
    setFeeStructure(academicSettings.feeStructure);
  }, [academicSettings]);

  useEffect(() => {
    const unsubAdmins = onSnapshot(
      collection(db, 'admins'),
      (snap) => setAdmins(snap.docs.map((d) => d.data() as AdminProfile)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'admins')
    );

    const unsubAdverts = onSnapshot(
      collection(db, 'advertPhotos'),
      (snap) => setAdverts(snap.docs.map((d) => d.data() as AdvertPhoto)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'advertPhotos')
    );

    let unsubInvites = () => {};
    if (isOwner) {
      unsubInvites = onSnapshot(
        collection(db, 'adminInvites'),
        (snap) => setAdminInvites(snap.docs.map((d) => d.data() as AdminInvite)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'adminInvites')
      );
    }

    return () => {
      unsubAdmins();
      unsubAdverts();
      unsubInvites();
    };
  }, [isOwner]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setSaving(true);
    setSavedNotice(false);
    try {
      await setDoc(doc(db, 'settings', 'academic'), {
        termName: sanitizeString(termName, 60),
        academicYear: sanitizeString(academicYear, 20),
        passMark: Math.min(100, Math.max(0, Number(passMark) || 50)),
        gradingSystem,
        gradeBands: gradeBands.slice(0, 12),
        schoolMotto: sanitizeString(schoolMotto, 160),
        supportPhone: sanitizeString(supportPhone, 40),
        supportEmail: sanitizeString(supportEmail, 120),
        feeStructure,
        muteUnpaid: Boolean(academicSettings.muteUnpaid),
        updatedBy: adminProfile.uid,
        updatedAt: serverTimestamp(),
      });
      setSavedNotice(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/academic');
    } finally {
      setSaving(false);
    }
  };

  const handleInviteAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile || !isOwner) return;
    const cleanEmail = inviteEmail.trim().toLowerCase();
    if (!cleanEmail) return;
    setInviting(true);
    try {
      await setDoc(doc(db, 'adminInvites', cleanEmail), {
        email: cleanEmail,
        fullName: sanitizeString(inviteName, 120),
        active: true,
        createdBy: adminProfile.uid,
        createdAt: serverTimestamp(),
      });
      setInviteEmail('');
      setInviteName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `adminInvites/${cleanEmail}`);
    } finally {
      setInviting(false);
    }
  };

  const handleAdvertFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAdvertStorageNotice(null);
    const storageRef = ref(
      storage,
      `adverts/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    );
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      'state_changed',
      (snap) => {
        setAdvertUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      (err) => {
        setAdvertUploadPct(null);
        setAdvertStorageNotice(
          `Firebase Storage upload requires Storage rules enabled in Firebase Console (${err.code}). You can paste any https:// image URL below.`
        );
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setAdvertImageUrl(url);
        setAdvertUploadPct(null);
      }
    );
  };

  const handleAddAdvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    const safeUrl = sanitizeSafeImageUrl(advertImageUrl, 1000);
    if (!safeUrl) {
      setAdvertStorageNotice('Please provide a valid image URL (https://...) or upload a photo.');
      return;
    }
    setSavingAdvert(true);
    const id = generateDocId('adv');
    try {
      await setDoc(doc(db, 'advertPhotos', id), {
        id,
        title: sanitizeString(advertTitle, 120),
        caption: sanitizeString(advertCaption, 300),
        imageUrl: safeUrl,
        active: true,
        createdBy: adminProfile.uid,
        createdAt: serverTimestamp(),
      });
      setAdvertTitle('');
      setAdvertCaption('');
      setAdvertImageUrl('');
      setAdvertStorageNotice(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `advertPhotos/${id}`);
    } finally {
      setSavingAdvert(false);
    }
  };

  const handleToggleAdvert = async (adv: AdvertPhoto) => {
    try {
      await updateDoc(doc(db, 'advertPhotos', adv.id), {
        active: !adv.active,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `advertPhotos/${adv.id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-heading">Platform Settings</h1>
          <p className="mt-1 text-sm text-body">
            Configure Ugandan grading scales, assessment pass thresholds, class tuition schedules, appearance theme, and owner-controlled administrator access.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(getLiveAppUrl());
                setCopiedLiveUrl(true);
                window.setTimeout(() => setCopiedLiveUrl(false), 2500);
              } catch {
                // ignore clipboard errors
              }
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-sky-200 dark:border-sky-800/70 bg-accent-sky-soft px-4 py-2.5 text-xs font-bold text-heading hover:opacity-90 transition-opacity"
          >
            {copiedLiveUrl ? (
              <>
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Live Link Copied</span>
              </>
            ) : (
              <>
                <Globe className="h-4 w-4 text-accent-sky" />
                <span>Copy Live App Link</span>
                <Copy className="h-3.5 w-3.5 text-muted" />
              </>
            )}
          </button>
          <a
            href={getLiveAppUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-btn-primary px-4 py-2.5 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors"
          >
            <span>Open Live App</span>
            <ExternalLink className="h-3.5 w-3.5 text-accent-gold" />
          </a>
        </div>
      </div>

      {/* Display & Dark Mode Toggle in Settings */}
      <ThemeToggle />

      <form onSubmit={handleSaveSettings} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* General & Term */}
          <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4">
            <h2 className="font-display text-lg font-bold text-heading">
              Term & Academy Profile
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-body">Term Name</label>
                <input
                  type="text"
                  required
                  value={termName}
                  onChange={(e) => setTermName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Academic Year</label>
                <input
                  type="text"
                  required
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">School Motto</label>
              <input
                type="text"
                value={schoolMotto}
                onChange={(e) => setSchoolMotto(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-body">Support Phone</label>
                <input
                  type="text"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Support Email</label>
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Tuition Fee Structure per Class */}
          <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4">
            <h2 className="font-display text-lg font-bold text-heading">
              Term Fee Structure (UGX)
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CLASS_LEVELS.map((c) => (
                <div key={c.code}>
                  <label className="block text-xs font-semibold text-body">{c.code}</label>
                  <input
                    type="number"
                    min={0}
                    value={feeStructure[c.code] ?? 0}
                    onChange={(e) =>
                      setFeeStructure((prev) => ({
                        ...prev,
                        [c.code]: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 font-mono text-xs focus:border-accent-sky focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Ugandan Grading Scale */}
        <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-heading">
                Ugandan Grading Configuration
              </h2>
              <p className="text-xs text-muted">
                Customize UNEB O-Level (D1–F9) or A-Level (A–F) scales and assessment pass mark.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={gradingSystem}
                onChange={(e) => {
                  const sys = e.target.value as GradingSystemType;
                  setGradingSystem(sys);
                  if (sys === 'UNEB_O_LEVEL') setGradeBands(DEFAULT_UNEB_O_LEVEL_BANDS);
                  if (sys === 'UNEB_A_LEVEL') setGradeBands(DEFAULT_UNEB_A_LEVEL_BANDS);
                }}
                className="rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-xs font-semibold focus:border-accent-sky focus:outline-none"
              >
                <option value="UNEB_O_LEVEL">UNEB O-Level (D1 – F9)</option>
                <option value="UNEB_A_LEVEL">UNEB A-Level (A – F)</option>
                <option value="CUSTOM">Custom Scale</option>
              </select>
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-body">Pass %:</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={passMark}
                  onChange={(e) => setPassMark(Number(e.target.value))}
                  className="w-16 rounded-xl border border-border-input bg-input-bg text-heading px-2.5 py-2 font-mono text-xs focus:border-accent-sky focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {gradeBands.map((band, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-xl border border-border-theme bg-surface-subtle p-2.5"
              >
                <input
                  type="text"
                  value={band.grade}
                  onChange={(e) => {
                    const v = e.target.value;
                    setGradeBands((prev) =>
                      prev.map((b, i) => (i === idx ? { ...b, grade: v } : b))
                    );
                  }}
                  className="w-14 rounded-lg border border-border-input bg-input-bg px-2 py-1 font-mono text-xs font-bold text-heading"
                />
                <input
                  type="number"
                  value={band.minScore}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setGradeBands((prev) =>
                      prev.map((b, i) => (i === idx ? { ...b, minScore: v } : b))
                    );
                  }}
                  className="w-14 rounded-lg border border-border-input bg-input-bg text-heading px-2 py-1 font-mono text-xs"
                />
                <span className="text-xs text-faint">–</span>
                <input
                  type="number"
                  value={band.maxScore}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setGradeBands((prev) =>
                      prev.map((b, i) => (i === idx ? { ...b, maxScore: v } : b))
                    );
                  }}
                  className="w-14 rounded-lg border border-border-input bg-input-bg text-heading px-2 py-1 font-mono text-xs"
                />
                <input
                  type="text"
                  value={band.label}
                  onChange={(e) => {
                    const v = e.target.value;
                    setGradeBands((prev) =>
                      prev.map((b, i) => (i === idx ? { ...b, label: v } : b))
                    );
                  }}
                  className="flex-1 min-w-0 rounded-lg border border-border-input bg-input-bg text-heading px-2 py-1 text-xs"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-btn-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-btn-primary-hover transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>Save Platform Settings</span>
            </button>
            {savedNotice && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                Settings saved
              </span>
            )}
          </div>
        </div>
      </form>

      {/* Owner-Controlled Administrator Permissions */}
      <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-accent-gold-text" />
          <h2 className="font-display text-lg font-bold text-heading">
            Administrator Access & Permissions
          </h2>
        </div>
        <p className="text-xs text-body">
          Only the verified Platform Owner can authorize new administrators.
        </p>

        {isOwner && (
          <form onSubmit={handleInviteAdmin} className="flex flex-wrap gap-3">
            <input
              type="text"
              required
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Administrator Full Name"
              className="flex-1 min-w-[180px] rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2 text-sm focus:border-accent-sky focus:outline-none"
            />
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="admin-email@example.com"
              className="flex-1 min-w-[200px] rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2 text-sm focus:border-accent-sky focus:outline-none"
            />
            <button
              type="submit"
              disabled={inviting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-btn-primary px-4 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors"
            >
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span>Authorize Admin</span>
            </button>
          </form>
        )}

        <div className="divide-y divide-border-subtle">
          {admins.map((adm) => (
            <div key={adm.uid} className="py-3 flex items-center justify-between text-sm">
              <div>
                <span className="font-bold text-heading">{adm.fullName}</span> ·{' '}
                <span className="text-xs text-muted">{adm.email}</span>
              </div>
              <span className="text-xs font-semibold text-accent-gold-text uppercase">
                {adm.role}
              </span>
            </div>
          ))}
          {adminInvites.map((inv) => (
            <div key={inv.email} className="py-3 flex items-center justify-between text-sm">
              <div>
                <span className="font-semibold text-body">{inv.fullName}</span> ·{' '}
                <span className="text-xs text-muted">{inv.email} (Invited)</span>
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => deleteDoc(doc(db, 'adminInvites', inv.email))}
                  className="text-faint hover:text-rose-600 dark:hover:text-rose-400"
                  aria-label="Revoke admin invite"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* First-Page Advert Photos Management */}
      <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-accent-sky" />
          <h2 className="font-display text-lg font-bold text-heading">
            First-Page Advert Photos
          </h2>
        </div>
        <p className="text-xs text-body">
          Publish promotional advert photos displayed on the first page of BRIAN ACADEMY UG.
        </p>

        <form onSubmit={handleAddAdvert} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            type="text"
            required
            maxLength={120}
            value={advertTitle}
            onChange={(e) => setAdvertTitle(e.target.value)}
            placeholder="Advert Headline (e.g. 2026 Admissions Open)"
            className="rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2 text-sm focus:border-accent-sky focus:outline-none"
          />
          <input
            type="text"
            maxLength={300}
            value={advertCaption}
            onChange={(e) => setAdvertCaption(e.target.value)}
            placeholder="Short caption (optional)"
            className="rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2 text-sm focus:border-accent-sky focus:outline-none"
          />
          <div className="sm:col-span-2 flex flex-wrap gap-3 items-center">
            <input
              type="text"
              required
              value={advertImageUrl}
              onChange={(e) => setAdvertImageUrl(e.target.value)}
              placeholder="Image URL (https://...) or upload photo"
              className="flex-1 min-w-[220px] rounded-xl border border-border-input bg-input-bg text-heading px-3.5 py-2 text-sm focus:border-accent-sky focus:outline-none"
            />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border-input bg-surface-subtle px-3.5 py-2 text-xs font-semibold text-heading hover:bg-surface-muted transition-colors">
              <FileUp className="h-4 w-4 text-accent-sky" />
              <span>{advertUploadPct !== null ? `${advertUploadPct}%` : 'Upload Photo'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleAdvertFileSelected}
                className="hidden"
              />
            </label>
            <button
              type="submit"
              disabled={savingAdvert}
              className="inline-flex items-center gap-1.5 rounded-xl bg-btn-primary px-4 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors"
            >
              {savingAdvert ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span>Publish Advert</span>
            </button>
          </div>
          {advertStorageNotice && (
            <p className="sm:col-span-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 p-2.5 text-xs text-amber-900 dark:text-amber-300">
              {advertStorageNotice}
            </p>
          )}
        </form>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {adverts.map((adv) => (
            <div key={adv.id} className="overflow-hidden rounded-xl border border-border-theme bg-surface-subtle">
              <img
                src={sanitizeSafeImageUrl(adv.imageUrl)}
                alt={adv.title}
                referrerPolicy="no-referrer"
                className="h-32 w-full object-cover bg-surface-muted"
              />
              <div className="p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-heading truncate">{adv.title}</div>
                  <div className="text-[11px] text-muted truncate">{adv.caption}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleAdvert(adv)}
                    className="rounded-lg p-1.5 text-body hover:bg-surface"
                    title={adv.active ? 'Hide from first page' : 'Show on first page'}
                    aria-label={adv.active ? 'Hide advert' : 'Show advert'}
                  >
                    {adv.active ? (
                      <Eye className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteDoc(doc(db, 'advertPhotos', adv.id))}
                    className="rounded-lg p-1.5 text-faint hover:bg-surface hover:text-rose-600 dark:hover:text-rose-400"
                    aria-label="Delete advert"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
