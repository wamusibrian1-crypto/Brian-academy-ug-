import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Edit3,
  Eye,
  EyeOff,
  File,
  FileSpreadsheet,
  FileText,
  Film,
  FolderInput,
  Image as ImageIcon,
  MoreVertical,
  Presentation,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { MATERIAL_TYPES, MaterialType, StudyMaterial } from '../types/academy';
import { detectFileFormat, formatFileSize, formatTimestamp } from '../lib/validation';
import { triggerFileDownload } from '../lib/chunkedUpload';

interface DocumentLibraryCardProps {
  material: StudyMaterial;
  viewCountOverride?: number;
  canManage?: boolean;
  onPreview: (mat: StudyMaterial) => void;
  onRename?: (mat: StudyMaterial) => void;
  onReplaceFile?: (mat: StudyMaterial) => void;
  onMoveFolder?: (mat: StudyMaterial) => void;
  onEditDetails?: (mat: StudyMaterial) => void;
  onTogglePublish?: (mat: StudyMaterial) => void;
  onDelete?: (mat: StudyMaterial) => void;
  onToggleViewers?: (mat: StudyMaterial) => void;
  children?: React.ReactNode;
}

export function getDocumentIconStyle(type: MaterialType, format: string): {
  bg: string;
  color: string;
  Icon: React.ComponentType<{ className?: string }>;
} {
  const fmt = format.toUpperCase();
  if (type === 'pdf' || fmt === 'PDF') {
    return {
      bg: 'bg-rose-50 dark:bg-rose-950/50 border-rose-200/70 dark:border-rose-800/60',
      color: 'text-rose-600 dark:text-rose-400',
      Icon: FileText,
    };
  }
  if (type === 'word' || fmt === 'DOC' || fmt === 'DOCX') {
    return {
      bg: 'bg-sky-50 dark:bg-sky-950/50 border-sky-200/70 dark:border-sky-800/60',
      color: 'text-[#0284C7] dark:text-sky-400',
      Icon: FileText,
    };
  }
  if (type === 'powerpoint' || type === 'presentation' || fmt === 'PPT' || fmt === 'PPTX') {
    return {
      bg: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200/70 dark:border-amber-800/60',
      color: 'text-[#B8911E] dark:text-[#FACC15]',
      Icon: Presentation,
    };
  }
  if (type === 'excel' || fmt === 'XLS' || fmt === 'XLSX' || fmt === 'CSV') {
    return {
      bg: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200/70 dark:border-emerald-800/60',
      color: 'text-emerald-700 dark:text-emerald-400',
      Icon: FileSpreadsheet,
    };
  }
  if (type === 'image' || ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF'].includes(fmt)) {
    return {
      bg: 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-200/70 dark:border-cyan-800/60',
      color: 'text-cyan-700 dark:text-cyan-300',
      Icon: ImageIcon,
    };
  }
  if (type === 'video' || ['MP4', 'WEBM', 'MOV'].includes(fmt)) {
    return {
      bg: 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200/70 dark:border-indigo-800/60',
      color: 'text-indigo-700 dark:text-indigo-300',
      Icon: Film,
    };
  }
  return {
    bg: 'bg-surface-subtle border-border-theme',
    color: 'text-heading',
    Icon: File,
  };
}

export const DocumentLibraryCard: React.FC<DocumentLibraryCardProps> = ({
  material,
  viewCountOverride,
  canManage = false,
  onPreview,
  onRename,
  onReplaceFile,
  onMoveFolder,
  onEditDetails,
  onTogglePublish,
  onDelete,
  onToggleViewers,
  children,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const fileFormat =
    material.fileFormat || detectFileFormat(material.fileName, '', material.materialType);
  const { bg, color, Icon } = getDocumentIconStyle(material.materialType, fileFormat);
  const sizeLabel = formatFileSize(material.fileSizeBytes);
  const views = viewCountOverride ?? material.views ?? 0;
  const typeLabel =
    MATERIAL_TYPES.find((t) => t.value === material.materialType)?.label || material.materialType;

  return (
    <div className="relative flex flex-col justify-between rounded-2xl border border-border-theme bg-surface p-4 shadow-xs hover:border-sky-300 dark:hover:border-sky-600/70 hover:shadow-md transition-all">
      <div>
        <div className="flex items-start justify-between gap-2.5">
          <button
            type="button"
            onClick={() => onPreview(material)}
            className="flex items-start gap-3 min-w-0 flex-1 text-left group"
          >
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${bg} ${color} transition-transform group-hover:scale-105`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-sm font-bold text-heading leading-snug line-clamp-2 group-hover:text-accent-sky-text transition-colors">
                {material.title}
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-muted truncate">
                {material.fileName || typeLabel}
              </div>
            </div>
          </button>

          {/* 3-dot Options Menu */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-muted hover:text-heading transition-colors"
              aria-label={`Options for ${material.title}`}
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-10 z-30 w-52 rounded-xl border border-border-theme bg-surface py-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onPreview(material);
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-heading hover:bg-surface-muted"
                >
                  <Eye className="h-3.5 w-3.5 text-accent-sky" />
                  <span>Preview / Open</span>
                </button>

                {material.fileUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void triggerFileDownload(
                        material.fileUrl,
                        material.fileName || `${material.title}.${fileFormat.toLowerCase()}`
                      );
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-heading hover:bg-surface-muted"
                  >
                    <Download className="h-3.5 w-3.5 text-accent-sky" />
                    <span>Download File</span>
                  </button>
                )}

                {canManage && onToggleViewers && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onToggleViewers(material);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-heading hover:bg-surface-muted"
                  >
                    <Eye className="h-3.5 w-3.5 text-accent-gold" />
                    <span>View Analytics ({views})</span>
                  </button>
                )}

                {canManage && onRename && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onRename(material);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-heading hover:bg-surface-muted"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-muted" />
                    <span>Rename Document</span>
                  </button>
                )}

                {canManage && onReplaceFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onReplaceFile(material);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-heading hover:bg-surface-muted"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-muted" />
                    <span>Replace File</span>
                  </button>
                )}

                {canManage && onMoveFolder && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onMoveFolder(material);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-heading hover:bg-surface-muted"
                  >
                    <FolderInput className="h-3.5 w-3.5 text-muted" />
                    <span>Move to Folder</span>
                  </button>
                )}

                {canManage && onEditDetails && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onEditDetails(material);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-heading hover:bg-surface-muted"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-muted" />
                    <span>Class / Topic / Chapter</span>
                  </button>
                )}

                {canManage && onTogglePublish && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onTogglePublish(material);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-heading hover:bg-surface-muted"
                  >
                    {material.published ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5 text-amber-600" />
                        <span>Unpublish</span>
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Publish to Students</span>
                      </>
                    )}
                  </button>
                )}

                {canManage && onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(material);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete Document</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Clean Metadata Strip */}
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-accent-sky-text">
          <span>{material.classLevel === 'ALL' ? 'All Classes' : material.classLevel}</span>
          <span className="text-faint">·</span>
          <span className="uppercase">{fileFormat}</span>
          {sizeLabel && (
            <>
              <span className="text-faint">·</span>
              <span className="text-muted tabular-nums">{sizeLabel}</span>
            </>
          )}
          {!material.published && (
            <>
              <span className="text-faint">·</span>
              <span className="text-amber-700 dark:text-amber-300">Unpublished</span>
            </>
          )}
        </div>

        {(material.topic || material.chapter) && (
          <div className="mt-1.5 text-[11px] text-muted truncate">
            {material.chapter ? `Ch: ${material.chapter}` : ''}
            {material.chapter && material.topic ? ' · ' : ''}
            {material.topic ? `Topic: ${material.topic}` : ''}
          </div>
        )}

        {material.description && (
          <p className="mt-1.5 text-xs text-body line-clamp-2">{material.description}</p>
        )}
      </div>

      {/* Footer Row: Date + Views */}
      <div className="mt-3.5 pt-2.5 border-t border-border-subtle flex items-center justify-between gap-2 text-[11px] text-muted">
        <span className="truncate">{formatTimestamp(material.createdAt)}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-heading tabular-nums shrink-0">
          <Eye className="h-3.5 w-3.5 text-accent-sky" />
          <span>{views}</span>
        </span>
      </div>

      {children}
    </div>
  );
};
