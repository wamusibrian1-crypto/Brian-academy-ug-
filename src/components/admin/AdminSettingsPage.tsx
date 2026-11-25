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
  LayoutTemplate,
  Loader2,
  Plus,
  RotateCcw,
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
  DEFAULT_HOMEPAGE_CONFIG,
  DEFAULT_UNEB_A_LEVEL_BANDS,
  DEFAULT_UNEB_O_LEVEL_BANDS,
  GradeBand,
  GradingSystemType,
  HomepageConfig,
} from '../../types/academy';
import {
  compressImageToDataUrl,
  generateDocId,
  getLiveAppUrl,
  sanitizeSafeImageUrl,
  sanitizeString,
} from '../../lib/validation';
import { ThemeToggle } from '../ThemeToggle';

export const AdminSettingsPage: React.FC = () => {
  const { adminProfile, academicSettings, homepageConfig } = useAuth();
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

  // Adjustable Front Page (HomepageConfig) state
  const [frontDraft, setFrontDraft] = useState<HomepageConfig>(homepageConfig);
  const [savingFront, setSavingFront] = useState(false);
  const [savedFrontNotice, setSavedFrontNotice] = useState(false);

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
    setFrontDraft(homepageConfig);
  }, [homepageConfig]);

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
      async () => {
        setAdvertUploadPct(null);
        try {
          const compressed = await compressImageToDataUrl(file, 1400, 0.84, 720000);
          setAdvertImageUrl(compressed);
          setAdvertStorageNotice('Advert photo prepared cleanly and ready to publish.');
        } catch {
          setAdvertStorageNotice(
            'Could not prepare advert photo. Please try another image or paste an https:// image URL.'
          );
        }
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
    const safeUrl = sanitizeSafeImageUrl(advertImageUrl, 900000);
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

  const handleSaveFrontPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setSavingFront(true);
    setSavedFrontNotice(false);
    try {
      await setDoc(doc(db, 'homepageConfig', 'main'), {
        heroEyebrow: sanitizeString(frontDraft.heroEyebrow || 'Official Learning Portal', 100),
        heroTitle: sanitizeString(frontDraft.heroTitle || 'BRIAN ACADEMY UG', 140),
        heroSubtitle: sanitizeString(frontDraft.heroSubtitle || '', 500),
        motto: sanitizeString(frontDraft.motto || 'LEARN. DISCOVER. EXCEL.', 160),
        advertsEnabled: Boolean(frontDraft.advertsEnabled),
        appDownloadEnabled: Boolean(frontDraft.appDownloadEnabled),
        appDownloadTitle: sanitizeString(
          frontDraft.appDownloadTitle || 'Download the BRIAN ACADEMY UG App',
          140
        ),
        appDownloadDescription: sanitizeString(frontDraft.appDownloadDescription || '', 800),
        androidApkUrl: sanitizeString(frontDraft.androidApkUrl || '', 500),
        admissionsEnabled: Boolean(frontDraft.admissionsEnabled),
        admissionsTitle: sanitizeString(
          frontDraft.admissionsTitle || 'Admissions Open — Senior One to Senior Six (S1 – S6)',
          160
        ),
        admissionsSummary: sanitizeString(frontDraft.admissionsSummary || '', 1200),
        admissionsRequirements: sanitizeString(frontDraft.admissionsRequirements || '', 2000),
        aboutBadge: sanitizeString(frontDraft.aboutBadge || 'ABOUT BRIAN ACADEMY UG', 100),
        aboutTitle: sanitizeString(
          frontDraft.aboutTitle ||
            'Dedicated Secondary Science & Mathematics Education for Senior One to Senior Six',
          200
        ),
        aboutDescription: sanitizeString(frontDraft.aboutDescription || '', 1500),
        contactEmail: sanitizeString(
          frontDraft.contactEmail || 'wamusibrian5@gmail.com',
          120
        ),
        contactPhone: sanitizeString(frontDraft.contactPhone || '256753336009', 40),
        updatedBy: adminProfile.uid,
        updatedAt: serverTimestamp(),
      });
      setSavedFrontNotice(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'homepageConfig/main');
    } finally {
      setSavingFront(false);
    }
  };

  const handleResetFrontPageDefaults = () => {
    setFrontDraft(DEFAULT_HOMEPAGE_CONFIG);
    setSavedFrontNotice(false);
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
              required={!advertImageUrl}
              value={advertImageUrl.startsWith('data:') ? '' : advertImageUrl}
              onChange={(e) => setAdvertImageUrl(e.target.value)}
              placeholder={
                advertImageUrl.startsWith('data:')
                  ? 'Uploaded photo ready (or paste a different image URL)'
                  : 'Image URL (https://...) or upload photo'
              }
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

      {/* Adjustable Front Page Customization (Live Website) */}
      <form
        onSubmit={handleSaveFrontPage}
        className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-4">
          <div>
            <div className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5 text-accent-sky" />
              <h2 className="font-display text-lg font-bold text-heading">
                Front Page Customization (Live Website)
              </h2>
            </div>
            <p className="mt-1 text-xs text-body">
              Adjust hero headlines, Admissions details, App Download links, About Us copy, contact info, and visible sections on the public front page.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetFrontPageDefaults}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-theme bg-surface-subtle px-3 py-2 text-xs font-semibold text-body hover:bg-surface-muted transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Load Defaults</span>
          </button>
        </div>

        {/* Section Visibility Toggles */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border-theme bg-surface-subtle p-3.5 cursor-pointer">
            <span className="text-xs font-semibold text-heading">Show Advert Carousel</span>
            <input
              type="checkbox"
              checked={frontDraft.advertsEnabled}
              onChange={(e) =>
                setFrontDraft((prev) => ({ ...prev, advertsEnabled: e.target.checked }))
              }
              className="h-4 w-4 rounded border-border-input accent-[#124299]"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border-theme bg-surface-subtle p-3.5 cursor-pointer">
            <span className="text-xs font-semibold text-heading">Show App Download Section</span>
            <input
              type="checkbox"
              checked={frontDraft.appDownloadEnabled}
              onChange={(e) =>
                setFrontDraft((prev) => ({ ...prev, appDownloadEnabled: e.target.checked }))
              }
              className="h-4 w-4 rounded border-border-input accent-[#124299]"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border-theme bg-surface-subtle p-3.5 cursor-pointer">
            <span className="text-xs font-semibold text-heading">Show Admissions Section</span>
            <input
              type="checkbox"
              checked={frontDraft.admissionsEnabled}
              onChange={(e) =>
                setFrontDraft((prev) => ({ ...prev, admissionsEnabled: e.target.checked }))
              }
              className="h-4 w-4 rounded border-border-input accent-[#124299]"
            />
          </label>
        </div>

        {/* Hero & Contacts */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-body">Hero Eyebrow</label>
            <input
              type="text"
              required
              maxLength={100}
              value={frontDraft.heroEyebrow}
              onChange={(e) =>
                setFrontDraft((prev) => ({ ...prev, heroEyebrow: e.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-body">Main Academy Title</label>
            <input
              type="text"
              required
              maxLength={140}
              value={frontDraft.heroTitle}
              onChange={(e) =>
                setFrontDraft((prev) => ({ ...prev, heroTitle: e.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-body">Front Page Motto</label>
            <input
              type="text"
              required
              maxLength={160}
              value={frontDraft.motto}
              onChange={(e) =>
                setFrontDraft((prev) => ({ ...prev, motto: e.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold text-body">Hero Subtitle</label>
            <input
              type="text"
              maxLength={500}
              value={frontDraft.heroSubtitle}
              onChange={(e) =>
                setFrontDraft((prev) => ({ ...prev, heroSubtitle: e.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-body">Public Contact Email</label>
            <input
              type="email"
              required
              maxLength={120}
              value={frontDraft.contactEmail}
              onChange={(e) =>
                setFrontDraft((prev) => ({ ...prev, contactEmail: e.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-body">Public Phone / Airtel Money</label>
            <input
              type="text"
              required
              maxLength={40}
              value={frontDraft.contactPhone}
              onChange={(e) =>
                setFrontDraft((prev) => ({ ...prev, contactPhone: e.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 font-mono text-sm focus:border-accent-sky focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-body">
              Optional Android APK Download URL (https://...)
            </label>
            <input
              type="url"
              maxLength={500}
              value={frontDraft.androidApkUrl}
              onChange={(e) =>
                setFrontDraft((prev) => ({ ...prev, androidApkUrl: e.target.value }))
              }
              placeholder="https://... (optional direct APK link)"
              className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
            />
          </div>
        </div>

        {/* App Download & Admissions Copy */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 pt-1">
          <div className="space-y-3 rounded-2xl border border-border-theme bg-surface-subtle p-4">
            <h3 className="font-display text-sm font-bold text-heading">App Download Section</h3>
            <div>
              <label className="block text-xs font-semibold text-body">Heading</label>
              <input
                type="text"
                required
                maxLength={140}
                value={frontDraft.appDownloadTitle}
                onChange={(e) =>
                  setFrontDraft((prev) => ({ ...prev, appDownloadTitle: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-body">Description</label>
              <textarea
                rows={3}
                maxLength={800}
                value={frontDraft.appDownloadDescription}
                onChange={(e) =>
                  setFrontDraft((prev) => ({ ...prev, appDownloadDescription: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-border-theme bg-surface-subtle p-4">
            <h3 className="font-display text-sm font-bold text-heading">Admissions Section</h3>
            <div>
              <label className="block text-xs font-semibold text-body">Admissions Headline</label>
              <input
                type="text"
                required
                maxLength={160}
                value={frontDraft.admissionsTitle}
                onChange={(e) =>
                  setFrontDraft((prev) => ({ ...prev, admissionsTitle: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-body">Admissions Overview</label>
              <textarea
                rows={2}
                maxLength={1200}
                value={frontDraft.admissionsSummary}
                onChange={(e) =>
                  setFrontDraft((prev) => ({ ...prev, admissionsSummary: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-body">
                Steps / Requirements (one step per line)
              </label>
              <textarea
                rows={3}
                maxLength={2000}
                value={frontDraft.admissionsRequirements}
                onChange={(e) =>
                  setFrontDraft((prev) => ({ ...prev, admissionsRequirements: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-xs focus:border-accent-sky focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* About Us Copy */}
        <div className="space-y-3 rounded-2xl border border-border-theme bg-surface-subtle p-4">
          <h3 className="font-display text-sm font-bold text-heading">About Us Section</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-body">Section Badge</label>
              <input
                type="text"
                required
                maxLength={100}
                value={frontDraft.aboutBadge}
                onChange={(e) =>
                  setFrontDraft((prev) => ({ ...prev, aboutBadge: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-body">About Headline</label>
              <input
                type="text"
                required
                maxLength={200}
                value={frontDraft.aboutTitle}
                onChange={(e) =>
                  setFrontDraft((prev) => ({ ...prev, aboutTitle: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-body">About Description</label>
            <textarea
              rows={3}
              maxLength={1500}
              value={frontDraft.aboutDescription}
              onChange={(e) =>
                setFrontDraft((prev) => ({ ...prev, aboutDescription: e.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-border-input bg-input-bg text-heading px-3 py-2 text-sm focus:border-accent-sky focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={savingFront}
            className="inline-flex items-center gap-2 rounded-xl bg-btn-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-btn-primary-hover disabled:opacity-60 transition-colors"
          >
            {savingFront ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4 text-accent-gold" />
            )}
            <span>Publish Front Page Changes</span>
          </button>
          {savedFrontNotice && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <Check className="h-4 w-4" />
              Front page updated live
            </span>
          )}
        </div>
      </form>
    </div>
  );
};
