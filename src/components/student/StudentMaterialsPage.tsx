import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Presentation,
  X,
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { MATERIAL_TYPES, MaterialType, StudyMaterial, SUBJECTS, SubjectCode } from '../../types/academy';
import { formatTimestamp, sanitizeSafeUrl } from '../../lib/validation';

interface StudentMaterialsPageProps {
  onBack: () => void;
}

export const StudentMaterialsPage: React.FC<StudentMaterialsPageProps> = ({ onBack }) => {
  const { studentProfile } = useAuth();
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [subjectFilter, setSubjectFilter] = useState<'ALL' | SubjectCode>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | MaterialType>('ALL');
  const [selectedMaterial, setSelectedMaterial] = useState<StudyMaterial | null>(null);

  useEffect(() => {
    if (!studentProfile) return;
    const q = query(
      collection(db, 'materials'),
      where('classLevel', '==', studentProfile.classLevel),
      where('published', '==', true)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMaterials(snap.docs.map((d) => d.data() as StudyMaterial));
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'materials')
    );
    return () => unsub();
  }, [studentProfile]);

  if (!studentProfile) return null;

  const filtered = materials.filter((m) => {
    if (subjectFilter !== 'ALL' && m.subject !== subjectFilter) return false;
    if (typeFilter !== 'ALL' && m.materialType !== typeFilter) return false;
    return true;
  });

  const renderTypeIcon = (type: MaterialType) => {
    switch (type) {
      case 'video':
        return <Film className="h-5 w-5 text-accent-sky" />;
      case 'image':
        return <ImageIcon className="h-5 w-5 text-accent-gold-text" />;
      case 'presentation':
        return <Presentation className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />;
      default:
        return <FileText className="h-5 w-5 text-heading" />;
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
            Study Material · {studentProfile.classLevel}
          </h1>
          <p className="text-xs text-muted">
            PDF notes, documents, images, presentations, revision packs, and video lessons.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-surface-muted p-1">
          <button
            type="button"
            onClick={() => setSubjectFilter('ALL')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              subjectFilter === 'ALL' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
            }`}
          >
            All Subjects
          </button>
          {SUBJECTS.map((s) => (
            <button
              key={s.code}
              type="button"
              onClick={() => setSubjectFilter(s.code)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                subjectFilter === s.code ? 'bg-surface text-heading shadow-xs' : 'text-muted'
              }`}
            >
              {s.code}
            </button>
          ))}
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'ALL' | MaterialType)}
          className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
        >
          <option value="ALL">All Material Types</option>
          {MATERIAL_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-accent-sky" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border-theme bg-surface p-8 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-faint" />
          <h2 className="mt-3 font-display text-base font-bold text-heading">
            No Study Materials Found
          </h2>
          <p className="mt-1 text-sm text-muted">
            Materials uploaded by your {studentProfile.classLevel} teachers will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((mat) => {
            const typeLabel =
              MATERIAL_TYPES.find((t) => t.value === mat.materialType)?.label || mat.materialType;
            return (
              <div
                key={mat.id}
                className="flex flex-col justify-between rounded-2xl border border-border-theme bg-surface p-5 shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-muted">
                      {renderTypeIcon(mat.materialType)}
                    </div>
                    <span className="text-xs font-semibold text-accent-sky-text">
                      {mat.subject} · {typeLabel}
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-base font-bold text-heading">
                    {mat.title}
                  </h3>
                  <p className="mt-1 text-xs text-body line-clamp-2">{mat.description}</p>
                  <p className="mt-3 text-[11px] text-faint">
                    By {mat.uploaderName} · {formatTimestamp(mat.createdAt)}
                  </p>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMaterial(mat)}
                    className="flex-1 rounded-xl bg-btn-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors"
                  >
                    Open Material
                  </button>
                  {sanitizeSafeUrl(mat.fileUrl) && (
                    <a
                      href={sanitizeSafeUrl(mat.fileUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border-theme text-body hover:bg-surface-muted"
                      aria-label="Open external resource"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Material Reader Modal */}
      {selectedMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-border-theme bg-surface shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-border-subtle p-5">
              <div>
                <p className="text-xs font-semibold text-accent-sky-text">
                  {selectedMaterial.classLevel} · {selectedMaterial.subject} ·{' '}
                  {MATERIAL_TYPES.find((t) => t.value === selectedMaterial.materialType)?.label}
                </p>
                <h2 className="mt-1 font-display text-lg font-bold text-heading">
                  {selectedMaterial.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMaterial(null)}
                className="rounded-lg p-1.5 text-faint hover:bg-surface-muted hover:text-heading"
                aria-label="Close material viewer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-4">
              {selectedMaterial.description && (
                <p className="text-sm text-body">{selectedMaterial.description}</p>
              )}

              {selectedMaterial.materialType === 'image' && sanitizeSafeUrl(selectedMaterial.fileUrl) && (
                <img
                  src={sanitizeSafeUrl(selectedMaterial.fileUrl)}
                  alt={selectedMaterial.title}
                  referrerPolicy="no-referrer"
                  className="max-h-96 w-full rounded-xl border border-border-theme object-contain bg-surface-subtle"
                />
              )}

              {selectedMaterial.inlineContent && (
                <div className="rounded-xl border border-border-theme bg-surface-subtle p-4">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-heading">
                    {selectedMaterial.inlineContent}
                  </pre>
                </div>
              )}

              {sanitizeSafeUrl(selectedMaterial.fileUrl) && (
                <div className="rounded-xl border border-sky-100 dark:border-sky-800/70 bg-accent-sky-soft p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-heading">Attached Resource File</div>
                    <div className="text-xs text-body">
                      {selectedMaterial.fileName || 'Open linked lesson file or video'}
                    </div>
                  </div>
                  <a
                    href={sanitizeSafeUrl(selectedMaterial.fileUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-btn-primary px-4 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors"
                  >
                    <span>Open / Download</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
