import React, { useEffect, useState } from 'react';
import {
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Minimize2,
  Presentation,
  X,
} from 'lucide-react';
import { MATERIAL_TYPES, StudyMaterial } from '../../types/academy';
import {
  detectFileFormat,
  formatFileSize,
  formatTimestamp,
  getEmbeddablePdfUrl,
  sanitizeSafeMaterialUrl,
} from '../../lib/validation';
import { triggerFileDownload, useResolvedFileUrl } from '../../lib/chunkedUpload';

interface PdfDocumentModalProps {
  material: StudyMaterial | null;
  onClose: () => void;
}

export const PdfDocumentModal: React.FC<PdfDocumentModalProps> = ({ material, onClose }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { resolvedUrl, resolving } = useResolvedFileUrl(material?.fileUrl);

  useEffect(() => {
    setIsFullscreen(false);
  }, [material?.id]);

  useEffect(() => {
    if (!material) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [material, isFullscreen, onClose]);

  if (!material) return null;

  const rawSafeUrl = sanitizeSafeMaterialUrl(material.fileUrl, 900000);
  const effectiveUrl = resolvedUrl || (rawSafeUrl.startsWith('chunked://') ? '' : rawSafeUrl);
  const embedUrl = effectiveUrl.startsWith('blob:')
    ? effectiveUrl
    : getEmbeddablePdfUrl(effectiveUrl);

  const fileFormat =
    material.fileFormat || detectFileFormat(material.fileName, '', material.materialType);
  const lowerUrl = (material.fileUrl || '').toLowerCase();
  const lowerName = (material.fileName || '').toLowerCase();
  const isPdf =
    material.materialType === 'pdf' ||
    fileFormat === 'PDF' ||
    lowerUrl.startsWith('data:application/pdf') ||
    lowerUrl.includes('.pdf') ||
    lowerName.endsWith('.pdf');
  const isImage =
    material.materialType === 'image' ||
    lowerUrl.startsWith('data:image/') ||
    /\.(png|jpe?g|webp|gif)$/.test(lowerName);
  const isVideo =
    material.materialType === 'video' || /\.(mp4|webm|mov)$/.test(lowerName);

  const typeLabel =
    MATERIAL_TYPES.find((t) => t.value === material.materialType)?.label || material.materialType;
  const viewCount = material.views ?? 0;
  const sizeLabel = formatFileSize(material.fileSizeBytes);

  const renderOfficeIcon = () => {
    if (material.materialType === 'excel' || fileFormat.startsWith('XLS') || fileFormat === 'CSV') {
      return <FileSpreadsheet className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />;
    }
    if (
      material.materialType === 'powerpoint' ||
      material.materialType === 'presentation' ||
      fileFormat.startsWith('PPT')
    ) {
      return <Presentation className="h-10 w-10 text-amber-600 dark:text-amber-400" />;
    }
    if (isVideo) {
      return <Film className="h-10 w-10 text-indigo-600 dark:text-indigo-400" />;
    }
    if (isImage) {
      return <ImageIcon className="h-10 w-10 text-accent-sky" />;
    }
    return <FileText className="h-10 w-10 text-[#0284C7]" />;
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs ${
        isFullscreen ? 'p-0' : 'p-2 sm:p-4'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={material.title}
    >
      <div
        className={`flex flex-col border border-border-theme bg-surface shadow-2xl overflow-hidden transition-all ${
          isFullscreen
            ? 'h-screen w-screen rounded-none'
            : 'h-[92vh] w-full max-w-5xl rounded-2xl'
        }`}
      >
        {/* Top Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-surface-subtle px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-accent-sky-text">
              <span>
                {material.classLevel === 'ALL' ? 'All Classes' : material.classLevel} ·{' '}
                {material.subject} · {typeLabel} ({fileFormat})
              </span>
              {sizeLabel && <span className="text-muted">· {sizeLabel}</span>}
              <span className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted border border-border-theme tabular-nums">
                <Eye className="h-3 w-3 text-accent-sky" />
                <span>Views: {viewCount}</span>
              </span>
            </div>
            <h2 className="mt-0.5 truncate font-display text-base sm:text-lg font-bold text-heading">
              {material.title}
            </h2>
            <p className="text-[11px] text-muted truncate">
              {material.fileName ? `${material.fileName} · ` : ''}
              {material.topic ? `Topic: ${material.topic} · ` : ''}
              {material.chapter ? `Chapter: ${material.chapter} · ` : ''}
              By {material.uploaderName} · {formatTimestamp(material.createdAt)}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {rawSafeUrl && (
              <button
                type="button"
                onClick={() =>
                  void triggerFileDownload(
                    rawSafeUrl,
                    material.fileName || `${material.title}.${fileFormat.toLowerCase()}`
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-btn-primary px-3 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-accent-gold" />
                <span className="hidden sm:inline">Download / Open</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-theme bg-surface text-body hover:bg-surface-muted transition-colors"
              aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-theme bg-surface text-body hover:bg-surface-muted hover:text-heading transition-colors"
              aria-label="Close document viewer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Document Viewport */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-canvas/40">
          {material.description && <p className="text-sm text-body">{material.description}</p>}

          {resolving && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border-theme bg-surface p-12 text-xs text-muted">
              <Loader2 className="h-6 w-6 animate-spin text-accent-sky" />
              <span>Preparing document for viewing...</span>
            </div>
          )}

          {!resolving && isImage && effectiveUrl && (
            <div className="flex justify-center rounded-xl border border-border-theme bg-surface p-2">
              <img
                src={effectiveUrl}
                alt={material.title}
                referrerPolicy="no-referrer"
                className="max-h-[72vh] w-full rounded-lg object-contain"
              />
            </div>
          )}

          {!resolving && isPdf && embedUrl ? (
            <div className="flex flex-col overflow-hidden rounded-xl border border-border-theme bg-white shadow-inner h-[68vh] min-h-[420px]">
              <iframe
                src={embedUrl}
                title={material.title}
                className="h-full w-full flex-1"
              />
            </div>
          ) : !resolving && !isImage && effectiveUrl ? (
            <div className="rounded-2xl border border-sky-200 dark:border-sky-800/70 bg-surface p-6 text-center space-y-3 shadow-xs">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-sky-soft">
                {renderOfficeIcon()}
              </div>
              <div>
                <div className="font-display text-base font-bold text-heading">
                  {material.fileName || material.title}
                </div>
                <div className="mt-1 text-xs text-muted">
                  Format: {fileFormat}
                  {sizeLabel ? ` · Size: ${sizeLabel}` : ''} · Ready to download or open on your device
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <a
                  href={effectiveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={material.fileName || `${material.title}.${fileFormat.toLowerCase()}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-btn-primary px-4 py-2.5 text-xs font-semibold text-white hover:bg-btn-primary-hover transition-colors"
                >
                  <Download className="h-4 w-4 text-accent-gold" />
                  <span>Download {fileFormat} Document</span>
                </a>
                {effectiveUrl.startsWith('http') && (
                  <a
                    href={effectiveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-border-theme bg-surface-subtle px-4 py-2.5 text-xs font-semibold text-heading hover:bg-surface-muted transition-colors"
                  >
                    <span>Open External Link</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          ) : !resolving && !material.inlineContent && !effectiveUrl ? (
            <div className="rounded-xl border border-border-theme bg-surface p-8 text-center">
              <FileText className="mx-auto h-8 w-8 text-faint" />
              <p className="mt-2 text-sm text-muted">
                No document file or preview notes attached to this material yet.
              </p>
            </div>
          ) : null}

          {material.inlineContent && (
            <div className="rounded-xl border border-border-theme bg-surface p-4 sm:p-5">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                Lesson Notes
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-heading">
                {material.inlineContent}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
