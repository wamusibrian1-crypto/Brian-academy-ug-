import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  FileUp,
  Folder,
  FolderOpen,
  Home,
  Loader2,
  Search,
} from 'lucide-react';
import {
  collection,
  doc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  Assessment,
  AssessmentSubmission,
  CLASS_LEVELS,
  ClassLevel,
  MATERIAL_TYPES,
  MaterialFolder,
  MaterialType,
  StudyMaterial,
  SUBJECT_LIBRARIES,
  SubjectCode,
} from '../../types/academy';
import { sanitizeString } from '../../lib/validation';
import {
  formatDeadlineDisplay,
  getStatusBadgeClasses,
  getSubmissionDisplayStatus,
} from '../../lib/deadlineUtils';
import { DocumentLibraryCard } from '../DocumentLibraryCard';
import { PdfDocumentModal } from './PdfDocumentModal';
import { SubmitAnswersSection } from './SubmitAnswersSection';
import { MyAssignmentsResultsView } from './MyAssignmentsResultsView';

interface StudentMaterialsPageProps {
  onBack: () => void;
}

export const StudentMaterialsPage: React.FC<StudentMaterialsPageProps> = ({ onBack }) => {
  const { studentProfile } = useAuth();
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [folders, setFolders] = useState<MaterialFolder[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [submissions, setSubmissions] = useState<AssessmentSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const [pageTab, setPageTab] = useState<'library' | 'results'>('library');
  const [activeSubjectLib, setActiveSubjectLib] = useState<'ALL' | SubjectCode>('ALL');
  const [currentFolderId, setCurrentFolderId] = useState<string>('');
  const [classFilter, setClassFilter] = useState<'ALL_CLASSES' | 'MY_CLASS' | 'ALL' | ClassLevel>(
    'ALL_CLASSES'
  );
  const [topicFilter, setTopicFilter] = useState<string>('ALL');
  const [chapterFilter, setChapterFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | MaterialType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [expandedSubmitId, setExpandedSubmitId] = useState<string | null>(null);

  useEffect(() => {
    if (!studentProfile) return;

    const qMaterials = query(collection(db, 'materials'), where('published', '==', true));
    const unsubM = onSnapshot(
      qMaterials,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as StudyMaterial);
        list.sort((a, b) => {
          const ta = (a.createdAt as { seconds?: number })?.seconds ?? 0;
          const tb = (b.createdAt as { seconds?: number })?.seconds ?? 0;
          return tb - ta;
        });
        setMaterials(list);
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'materials')
    );

    const unsubFolders = onSnapshot(
      collection(db, 'materialFolders'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as MaterialFolder);
        list.sort((a, b) => a.name.localeCompare(b.name));
        setFolders(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'materialFolders')
    );

    const qAssess = query(
      collection(db, 'assessments'),
      where('classLevel', '==', studentProfile.classLevel),
      where('published', '==', true)
    );
    const unsubAssess = onSnapshot(
      qAssess,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Assessment);
        list.sort((a, b) => {
          const ta = (a.createdAt as { seconds?: number })?.seconds ?? 0;
          const tb = (b.createdAt as { seconds?: number })?.seconds ?? 0;
          return tb - ta;
        });
        setAssessments(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'assessments')
    );

    const qSubs = query(
      collection(db, 'submissions'),
      where('studentId', '==', studentProfile.uid)
    );
    const unsubSubs = onSnapshot(
      qSubs,
      (snap) => setSubmissions(snap.docs.map((d) => d.data() as AssessmentSubmission)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'submissions')
    );

    return () => {
      unsubM();
      unsubFolders();
      unsubAssess();
      unsubSubs();
    };
  }, [studentProfile]);

  const recordMaterialView = async (mat: StudyMaterial) => {
    if (!studentProfile) return;
    const matPath = `materials/${mat.id}`;
    const viewPath = `materials/${mat.id}/views/${studentProfile.uid}`;

    try {
      await updateDoc(doc(db, 'materials', mat.id), {
        views: increment(1),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, matPath);
    }

    try {
      await setDoc(doc(db, 'materials', mat.id, 'views', studentProfile.uid), {
        materialId: mat.id,
        viewerUid: studentProfile.uid,
        viewerName: sanitizeString(studentProfile.fullName, 120) || 'Student',
        viewerRole: 'student',
        classLevel: studentProfile.classLevel,
        viewedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, viewPath);
    }
  };

  const handleOpenMaterial = (mat: StudyMaterial) => {
    setSelectedMaterialId(mat.id);
    void recordMaterialView(mat);
  };

  // Breadcrumbs for current folder
  const folderBreadcrumbs = useMemo(() => {
    const trail: MaterialFolder[] = [];
    let cursorId = currentFolderId;
    const seen = new Set<string>();
    while (cursorId && !seen.has(cursorId)) {
      seen.add(cursorId);
      const found = folders.find((f) => f.id === cursorId);
      if (!found) break;
      trail.unshift(found);
      cursorId = found.parentFolderId || '';
    }
    return trail;
  }, [folders, currentFolderId]);

  const visibleFolders = useMemo(() => {
    if (!studentProfile) return [];
    return folders.filter((f) => {
      if (activeSubjectLib !== 'ALL' && f.subject !== activeSubjectLib) return false;
      if ((f.parentFolderId || '') !== currentFolderId) return false;
      if (
        classFilter === 'MY_CLASS' &&
        f.classLevel !== 'ALL' &&
        f.classLevel !== studentProfile.classLevel
      ) {
        return false;
      }
      return true;
    });
  }, [folders, activeSubjectLib, currentFolderId, classFilter, studentProfile]);

  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    for (const m of materials) {
      if (activeSubjectLib !== 'ALL' && m.subject !== activeSubjectLib) continue;
      if (m.topic) set.add(m.topic);
    }
    return Array.from(set).sort();
  }, [materials, activeSubjectLib]);

  const availableChapters = useMemo(() => {
    const set = new Set<string>();
    for (const m of materials) {
      if (activeSubjectLib !== 'ALL' && m.subject !== activeSubjectLib) continue;
      if (m.chapter) set.add(m.chapter);
    }
    return Array.from(set).sort();
  }, [materials, activeSubjectLib]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      topicFilter !== 'ALL' ||
      chapterFilter !== 'ALL' ||
      typeFilter !== 'ALL'
  );

  const filteredMaterials = useMemo(() => {
    if (!studentProfile) return [];
    const q = searchQuery.trim().toLowerCase();
    return materials.filter((m) => {
      if (activeSubjectLib !== 'ALL' && m.subject !== activeSubjectLib) return false;
      if (classFilter === 'MY_CLASS') {
        if (m.classLevel !== 'ALL' && m.classLevel !== studentProfile.classLevel) return false;
      } else if (classFilter !== 'ALL_CLASSES' && m.classLevel !== classFilter) {
        return false;
      }
      if (topicFilter !== 'ALL' && (m.topic || '') !== topicFilter) return false;
      if (chapterFilter !== 'ALL' && (m.chapter || '') !== chapterFilter) return false;
      if (typeFilter !== 'ALL' && m.materialType !== typeFilter) return false;

      if (!hasActiveFilters) {
        const matFolder = m.folderId || '';
        if (currentFolderId) {
          if (matFolder !== currentFolderId) return false;
        } else {
          // At root folder, show root-level files (or all if user clicked "All Libraries" and no folder open)
          if (activeSubjectLib !== 'ALL' && matFolder !== '') return false;
        }
      }

      if (q) {
        const hay = `${m.title} ${m.fileName} ${m.description} ${m.topic || ''} ${
          m.chapter || ''
        } ${m.uploaderName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    studentProfile,
    materials,
    activeSubjectLib,
    classFilter,
    topicFilter,
    chapterFilter,
    typeFilter,
    hasActiveFilters,
    currentFolderId,
    searchQuery,
  ]);

  // Match assignments directly below relevant learning materials
  const getLinkedAssessments = (mat: StudyMaterial): Assessment[] => {
    return assessments.filter((a) => {
      if (a.materialId && a.materialId === mat.id) return true;
      if (
        !a.materialId &&
        a.subject === mat.subject &&
        a.topic &&
        mat.topic &&
        a.topic.trim().toLowerCase() === mat.topic.trim().toLowerCase()
      ) {
        return true;
      }
      return false;
    });
  };

  // Assignments not linked to any currently visible material card
  const standaloneSubjectAssessments = useMemo(() => {
    const shownIds = new Set<string>();
    for (const m of filteredMaterials) {
      for (const a of getLinkedAssessments(m)) {
        shownIds.add(a.id);
      }
    }
    return assessments.filter((a) => {
      if (activeSubjectLib !== 'ALL' && a.subject !== activeSubjectLib) return false;
      return !shownIds.has(a.id);
    });
  }, [assessments, filteredMaterials, activeSubjectLib]);

  if (!studentProfile) return null;

  const selectedMaterial = materials.find((m) => m.id === selectedMaterialId) || null;
  const pendingAssignmentCount = assessments.filter(
    (a) => !submissions.some((s) => s.assessmentId === a.id)
  ).length;
  const returnedCount = submissions.filter((s) => s.status === 'returned').length;

  return (
    <div className="space-y-6">
      {/* Header + Page Switcher */}
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
            <h1 className="font-display text-2xl font-bold text-heading">
              Learning Materials & Assignments
            </h1>
            <p className="text-xs text-muted">
              Browse Mathematics, Physics, Chemistry & Biology folders, read PDFs and notes, and submit your answers directly below relevant materials.
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-xl bg-surface-muted p-1 gap-1">
          <button
            type="button"
            onClick={() => setPageTab('library')}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
              pageTab === 'library' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
            }`}
          >
            Learning Materials
          </button>
          <button
            type="button"
            onClick={() => setPageTab('results')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
              pageTab === 'results' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
            }`}
          >
            <span>MY ASSIGNMENTS AND RESULTS</span>
            {(pendingAssignmentCount > 0 || returnedCount > 0) && (
              <span className="rounded-full bg-[#EAB308] px-2 py-0.5 text-[10px] font-extrabold text-[#0B1F3A] tabular-nums">
                {pendingAssignmentCount + returnedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {pageTab === 'results' ? (
        <MyAssignmentsResultsView assessments={assessments} submissions={submissions} />
      ) : (
        <>
          {/* 4 Subject Libraries + All */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            <button
              type="button"
              onClick={() => {
                setActiveSubjectLib('ALL');
                setCurrentFolderId('');
              }}
              className={`rounded-2xl border p-3.5 text-left transition-all ${
                activeSubjectLib === 'ALL'
                  ? 'border-[#0284C7] bg-accent-sky-soft shadow-xs'
                  : 'border-border-theme bg-surface hover:bg-surface-subtle'
              }`}
            >
              <div className="text-xs font-bold text-heading">All Libraries</div>
              <div className="mt-0.5 text-[11px] text-muted tabular-nums">
                {materials.length} files
              </div>
            </button>
            {SUBJECT_LIBRARIES.map((lib) => {
              const count = materials.filter((m) => m.subject === lib.code).length;
              const active = activeSubjectLib === lib.code;
              return (
                <button
                  key={lib.code}
                  type="button"
                  onClick={() => {
                    setActiveSubjectLib(lib.code);
                    setCurrentFolderId('');
                    setTopicFilter('ALL');
                    setChapterFilter('ALL');
                  }}
                  className={`rounded-2xl border p-3.5 text-left transition-all ${
                    active
                      ? 'border-[#0284C7] bg-accent-sky-soft shadow-xs'
                      : 'border-border-theme bg-surface hover:bg-surface-subtle'
                  }`}
                >
                  <div className="text-xs font-bold text-heading truncate">
                    {lib.libraryTitle}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted tabular-nums">
                    {count} {count === 1 ? 'document' : 'documents'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Search & Topic / Chapter / Class Filters */}
          <div className="rounded-2xl border border-border-theme bg-surface p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-faint" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search documents, topics, chapters, or files..."
                  className="w-full rounded-xl border border-border-input bg-input-bg pl-9 pr-3 py-2 text-xs text-heading focus:border-accent-sky focus:outline-none"
                />
              </div>

              <select
                value={classFilter}
                onChange={(e) =>
                  setClassFilter(
                    e.target.value as 'ALL_CLASSES' | 'MY_CLASS' | 'ALL' | ClassLevel
                  )
                }
                className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
              >
                <option value="ALL_CLASSES">All Classes (Open to All)</option>
                <option value="MY_CLASS">My Class ({studentProfile.classLevel} + ALL)</option>
                <option value="ALL">Whole Academy (ALL)</option>
                {CLASS_LEVELS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>

              {availableTopics.length > 0 && (
                <select
                  value={topicFilter}
                  onChange={(e) => setTopicFilter(e.target.value)}
                  className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading max-w-[180px]"
                >
                  <option value="ALL">All Topics</option>
                  {availableTopics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}

              {availableChapters.length > 0 && (
                <select
                  value={chapterFilter}
                  onChange={(e) => setChapterFilter(e.target.value)}
                  className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading max-w-[180px]"
                >
                  <option value="ALL">All Chapters</option>
                  {availableChapters.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'ALL' | MaterialType)}
                className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
              >
                <option value="ALL">All Formats</option>
                {MATERIAL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Folder Breadcrumb Navigation */}
            {(currentFolderId || visibleFolders.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border-subtle pt-3 text-xs">
                <button
                  type="button"
                  onClick={() => setCurrentFolderId('')}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold ${
                    currentFolderId === ''
                      ? 'bg-accent-sky-soft text-accent-sky-text'
                      : 'text-muted hover:bg-surface-muted'
                  }`}
                >
                  <Home className="h-3.5 w-3.5" />
                  <span>
                    {activeSubjectLib === 'ALL'
                      ? 'Library Root'
                      : SUBJECT_LIBRARIES.find((l) => l.code === activeSubjectLib)?.libraryTitle}
                  </span>
                </button>
                {folderBreadcrumbs.map((fb) => (
                  <React.Fragment key={fb.id}>
                    <ChevronRight className="h-3.5 w-3.5 text-faint" />
                    <button
                      type="button"
                      onClick={() => setCurrentFolderId(fb.id)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold ${
                        fb.id === currentFolderId
                          ? 'bg-accent-sky-soft text-accent-sky-text'
                          : 'text-muted hover:bg-surface-muted'
                      }`}
                    >
                      <FolderOpen className="h-3.5 w-3.5 text-[#EAB308]" />
                      <span>{fb.name}</span>
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          {/* Folders Grid */}
          {visibleFolders.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {visibleFolders.map((folder) => {
                const folderFileCount = materials.filter(
                  (m) => (m.folderId || '') === folder.id
                ).length;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => {
                      setActiveSubjectLib(folder.subject);
                      setCurrentFolderId(folder.id);
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-border-theme bg-surface p-4 text-left hover:border-sky-300 dark:hover:border-sky-600 hover:shadow-sm transition-all"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/50 text-[#EAB308]">
                      <Folder className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-display text-sm font-bold text-heading">
                        {folder.name}
                      </div>
                      <div className="text-[11px] text-muted">
                        {folder.subject} · {folderFileCount} file{folderFileCount === 1 ? '' : 's'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Documents & Inline "SUBMIT YOUR ANSWERS" below relevant materials */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-accent-sky" />
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="rounded-2xl border border-border-theme bg-surface p-8 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-faint" />
              <h2 className="mt-3 font-display text-base font-bold text-heading">
                No Learning Materials Here Yet
              </h2>
              <p className="mt-1 text-sm text-muted">
                {currentFolderId
                  ? 'This folder has no published documents yet. Return to parent folder or check another subject.'
                  : 'Documents published by teachers in Mathematics, Physics, Chemistry, and Biology will appear here.'}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredMaterials.map((mat) => {
                  const linkedAssignments = getLinkedAssessments(mat);
                  return (
                    <DocumentLibraryCard
                      key={mat.id}
                      material={mat}
                      canManage={false}
                      onPreview={handleOpenMaterial}
                    >
                      {/* PART 4: "SUBMIT YOUR ANSWERS" directly below relevant learning material */}
                      {linkedAssignments.length > 0 && (
                        <div className="mt-3.5 border-t border-border-subtle pt-3 space-y-2.5">
                          {linkedAssignments.map((asmt) => {
                            const sub =
                              submissions.find((s) => s.assessmentId === asmt.id) || null;
                            const status = getSubmissionDisplayStatus(asmt, sub);
                            const isOpen = expandedSubmitId === `${mat.id}_${asmt.id}`;
                            return (
                              <div
                                key={asmt.id}
                                className="rounded-xl border border-sky-200 dark:border-sky-800/80 bg-accent-sky-soft/60 p-3 space-y-2"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0284C7] dark:text-sky-300">
                                      SUBMIT YOUR ANSWERS
                                    </div>
                                    <div className="text-xs font-bold text-heading truncate">
                                      {asmt.title}
                                    </div>
                                    <div className="text-[11px] text-muted">
                                      Due: {formatDeadlineDisplay(asmt)} · {asmt.totalMarks} Marks
                                    </div>
                                  </div>
                                  <span
                                    className={`shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-bold ${getStatusBadgeClasses(
                                      status
                                    )}`}
                                  >
                                    {status}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedSubmitId(
                                      isOpen ? null : `${mat.id}_${asmt.id}`
                                    )
                                  }
                                  className="inline-flex w-full min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-btn-primary px-3 py-2 text-xs font-bold text-white hover:bg-btn-primary-hover transition-colors"
                                >
                                  <FileUp className="h-3.5 w-3.5 text-[#FACC15]" />
                                  <span>
                                    {isOpen
                                      ? 'Hide Answer Submission'
                                      : sub
                                        ? 'View / Replace Answers'
                                        : 'SUBMIT YOUR ANSWERS'}
                                  </span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </DocumentLibraryCard>
                  );
                })}
              </div>

              {/* Expanded inline "SUBMIT YOUR ANSWERS" panel for the selected material's assignment */}
              {expandedSubmitId &&
                (() => {
                  const foundAsmt = assessments.find((a) =>
                    expandedSubmitId.endsWith(`_${a.id}`)
                  );
                  if (!foundAsmt) return null;
                  const existingSub =
                    submissions.find((s) => s.assessmentId === foundAsmt.id) || null;
                  return (
                    <div className="scroll-mt-20">
                      <SubmitAnswersSection
                        assessment={foundAsmt}
                        existingSubmission={existingSub}
                      />
                    </div>
                  );
                })()}
            </div>
          )}

          {/* Published Class Assignments for this Subject Library */}
          {standaloneSubjectAssessments.length > 0 && (
            <section className="space-y-4 pt-2 border-t border-border-theme">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-accent-gold" />
                  <div>
                    <h2 className="font-display text-base font-bold text-heading">
                      Published {activeSubjectLib === 'ALL' ? studentProfile.classLevel : activeSubjectLib} Assignments
                    </h2>
                    <p className="text-xs text-muted">
                      Submit PDF, DOC, DOCX, JPG, JPEG, PNG answer files or typed responses below.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {standaloneSubjectAssessments.slice(0, 6).map((asmt) => {
                  const sub = submissions.find((s) => s.assessmentId === asmt.id) || null;
                  return (
                    <SubmitAnswersSection
                      key={asmt.id}
                      assessment={asmt}
                      existingSubmission={sub}
                    />
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {/* Dedicated Full-Screen Document Viewer Modal */}
      <PdfDocumentModal
        material={selectedMaterial}
        onClose={() => setSelectedMaterialId(null)}
      />
    </div>
  );
};
