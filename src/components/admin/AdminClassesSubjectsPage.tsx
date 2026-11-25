import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Edit3,
  Eye,
  File,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Loader2,
  Play,
  Plus,
  Presentation,
  Search,
  Square,
  Trash2,
  Upload,
  Users,
  Video,
  X,
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
  Course,
  LiveAttendance,
  LiveClass,
  MaterialFolder,
  MaterialType,
  MaterialView,
  StudyMaterial,
  SUBJECT_LIBRARIES,
  SUBJECTS,
  SubjectCode,
} from '../../types/academy';
import {
  detectFileFormat,
  detectMaterialTypeFromFile,
  formatTimestamp,
  generateDocId,
  sanitizeSafeMaterialUrl,
  sanitizeSafeUrl,
  sanitizeString,
} from '../../lib/validation';
import { uploadFileWithFallback } from '../../lib/chunkedUpload';
import { logPlatformActivity } from '../../lib/activity';
import { publishPublicNotice } from '../../lib/publicNotifications';
import { DocumentLibraryCard } from '../DocumentLibraryCard';
import { PdfDocumentModal } from '../student/PdfDocumentModal';

type UploadPreset = {
  type: MaterialType;
  label: string;
  accept: string;
};

const UPLOAD_PRESETS: UploadPreset[] = [
  { type: 'pdf', label: 'Upload PDF', accept: '.pdf,application/pdf' },
  {
    type: 'word',
    label: 'Upload Word document',
    accept:
      '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  {
    type: 'powerpoint',
    label: 'Upload PowerPoint',
    accept:
      '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  {
    type: 'excel',
    label: 'Upload Excel document',
    accept:
      '.xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv',
  },
  { type: 'image', label: 'Upload image', accept: 'image/*' },
  {
    type: 'other',
    label: 'Upload other supported files',
    accept: '.txt,.rtf,.zip,.mp4,.webm,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*,*/*',
  },
];

export const AdminClassesSubjectsPage: React.FC = () => {
  const { role, adminProfile, teacherProfile } = useAuth();
  const isAdmin = role === 'admin';
  const staffUid = adminProfile?.uid || teacherProfile?.uid || '';
  const staffName = adminProfile?.fullName || teacherProfile?.fullName || 'Staff';

  const allowedSubjects = useMemo<SubjectCode[]>(() => {
    if (isAdmin || !teacherProfile || teacherProfile.subjects.length === 0) {
      return SUBJECTS.map((s) => s.code);
    }
    return teacherProfile.subjects;
  }, [isAdmin, teacherProfile]);

  const allowedClasses = useMemo<ClassLevel[]>(() => {
    if (isAdmin || !teacherProfile || teacherProfile.classes.length === 0) {
      return CLASS_LEVELS.map((c) => c.code);
    }
    return teacherProfile.classes;
  }, [isAdmin, teacherProfile]);

  const [tab, setTab] = useState<'materials' | 'courses' | 'live'>('materials');
  const [courses, setCourses] = useState<Course[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [folders, setFolders] = useState<MaterialFolder[]>([]);
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const [loading, setLoading] = useState(true);

  // Document Library Navigation & Filters
  const [activeSubject, setActiveSubject] = useState<SubjectCode>(allowedSubjects[0] || 'MTC');
  const [currentFolderId, setCurrentFolderId] = useState<string>('');
  const [classFilter, setClassFilter] = useState<'ALL_VIEW' | 'ALL' | ClassLevel>('ALL_VIEW');
  const [topicFilter, setTopicFilter] = useState('');
  const [chapterFilter, setChapterFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Floating (+) Upload Menu & Staging Modal
  const [fabOpen, setFabOpen] = useState(false);
  const [uploadPreset, setUploadPreset] = useState<UploadPreset>(UPLOAD_PRESETS[0]);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [matTitle, setMatTitle] = useState('');
  const [matDesc, setMatDesc] = useState('');
  const [matClass, setMatClass] = useState<ClassLevel | 'ALL'>(
    isAdmin ? 'ALL' : allowedClasses[0] || 'S1'
  );
  const [matTopic, setMatTopic] = useState('');
  const [matChapter, setMatChapter] = useState('');
  const [matInline, setMatInline] = useState('');
  const [matExternalUrl, setMatExternalUrl] = useState('');
  const [matPublished, setMatPublished] = useState(true);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savingMat, setSavingMat] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replacingMaterial, setReplacingMaterial] = useState<StudyMaterial | null>(null);

  // Create Folder Modal
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderClass, setNewFolderClass] = useState<ClassLevel | 'ALL'>('ALL');
  const [savingFolder, setSavingFolder] = useState(false);

  // Rename / Edit / Move Folder Modals
  const [editingMaterial, setEditingMaterial] = useState<StudyMaterial | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editClass, setEditClass] = useState<ClassLevel | 'ALL'>('ALL');
  const [editTopic, setEditTopic] = useState('');
  const [editChapter, setEditChapter] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editFolderId, setEditFolderId] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Document Preview & Viewer Analytics
  const [previewMaterial, setPreviewMaterial] = useState<StudyMaterial | null>(null);
  const [viewsByMaterial, setViewsByMaterial] = useState<Record<string, MaterialView[]>>({});
  const [analyticsMaterial, setAnalyticsMaterial] = useState<StudyMaterial | null>(null);

  // Course creation state (Admin only)
  const [courseClass, setCourseClass] = useState<ClassLevel>('S1');
  const [courseSubject, setCourseSubject] = useState<SubjectCode>('MTC');
  const [courseTitle, setCourseTitle] = useState('');
  const [courseDesc, setCourseDesc] = useState('');
  const [courseTopicsText, setCourseTopicsText] = useState('');
  const [savingCourse, setSavingCourse] = useState(false);

  // Live Class schedule state
  const [liveTitle, setLiveTitle] = useState('');
  const [liveClass, setLiveClass] = useState<ClassLevel>(allowedClasses[0] || 'S1');
  const [liveSubject, setLiveSubject] = useState<SubjectCode>(allowedSubjects[0] || 'MTC');
  const [liveDate, setLiveDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [liveDuration, setLiveDuration] = useState(60);
  const [liveMeetingUrl, setLiveMeetingUrl] = useState('');
  const [liveNotes, setLiveNotes] = useState('');
  const [liveMatTitle, setLiveMatTitle] = useState('');
  const [liveMatUrl, setLiveMatUrl] = useState('');
  const [savingLive, setSavingLive] = useState(false);
  const [attendanceLessonId, setAttendanceLessonId] = useState<string | null>(null);
  const [attendanceList, setAttendanceList] = useState<LiveAttendance[]>([]);

  useEffect(() => {
    if (!allowedSubjects.includes(activeSubject) && allowedSubjects.length > 0) {
      setActiveSubject(allowedSubjects[0]);
      setCurrentFolderId('');
    }
  }, [allowedSubjects, activeSubject]);

  useEffect(() => {
    const unsubC = onSnapshot(
      collection(db, 'courses'),
      (snap) => {
        setCourses(snap.docs.map((d) => d.data() as Course));
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'courses')
    );
    const unsubM = onSnapshot(
      collection(db, 'materials'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as StudyMaterial);
        list.sort((a, b) => {
          const ta = (a.createdAt as { seconds?: number })?.seconds ?? 0;
          const tb = (b.createdAt as { seconds?: number })?.seconds ?? 0;
          return tb - ta;
        });
        setMaterials(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'materials')
    );
    const unsubF = onSnapshot(
      collection(db, 'materialFolders'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as MaterialFolder);
        list.sort((a, b) => a.name.localeCompare(b.name));
        setFolders(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'materialFolders')
    );
    const unsubL = onSnapshot(
      collection(db, 'liveClasses'),
      (snap) => setLiveClasses(snap.docs.map((d) => d.data() as LiveClass)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'liveClasses')
    );
    return () => {
      unsubC();
      unsubM();
      unsubF();
      unsubL();
    };
  }, []);

  useEffect(() => {
    if (!attendanceLessonId) {
      setAttendanceList([]);
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'liveClasses', attendanceLessonId, 'attendance'),
      (snap) => setAttendanceList(snap.docs.map((d) => d.data() as LiveAttendance)),
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `liveClasses/${attendanceLessonId}/attendance`)
    );
    return () => unsub();
  }, [attendanceLessonId]);

  // Listen to viewer records only when analytics drawer is open or for active subject materials
  const subjectMaterialIdsKey = materials
    .filter((m) => m.subject === activeSubject)
    .map((m) => m.id)
    .sort()
    .join(',');

  useEffect(() => {
    if (!subjectMaterialIdsKey) return;
    const ids = subjectMaterialIdsKey.split(',');
    const unsubs = ids.map((matId) =>
      onSnapshot(
        collection(db, 'materials', matId, 'views'),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as MaterialView);
          list.sort((a, b) => {
            const ta = (a.viewedAt as { seconds?: number })?.seconds ?? 0;
            const tb = (b.viewedAt as { seconds?: number })?.seconds ?? 0;
            return tb - ta;
          });
          setViewsByMaterial((prev) => ({ ...prev, [matId]: list }));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `materials/${matId}/views`)
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [subjectMaterialIdsKey]);

  const subjectFolders = useMemo(
    () => folders.filter((f) => f.subject === activeSubject),
    [folders, activeSubject]
  );

  const breadcrumbs = useMemo(() => {
    const chain: MaterialFolder[] = [];
    let cursor = currentFolderId;
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor);
      const found = subjectFolders.find((f) => f.id === cursor);
      if (!found) break;
      chain.unshift(found);
      cursor = found.parentFolderId;
    }
    return chain;
  }, [subjectFolders, currentFolderId]);

  const visibleSubfolders = useMemo(
    () =>
      subjectFolders.filter((f) => {
        if ((f.parentFolderId || '') !== currentFolderId) return false;
        if (classFilter !== 'ALL_VIEW' && f.classLevel !== classFilter && f.classLevel !== 'ALL') {
          return false;
        }
        return true;
      }),
    [subjectFolders, currentFolderId, classFilter]
  );

  const visibleMaterials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const tq = topicFilter.trim().toLowerCase();
    const cq = chapterFilter.trim().toLowerCase();
    const isSearching = Boolean(q || tq || cq);

    return materials.filter((m) => {
      if (m.subject !== activeSubject) return false;
      if (!isSearching && (m.folderId || '') !== currentFolderId) return false;
      if (classFilter !== 'ALL_VIEW' && m.classLevel !== classFilter) return false;
      if (tq && !(m.topic || '').toLowerCase().includes(tq)) return false;
      if (cq && !(m.chapter || '').toLowerCase().includes(cq)) return false;
      if (q) {
        const hay = `${m.title} ${m.fileName} ${m.description} ${m.topic || ''} ${m.chapter || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    materials,
    activeSubject,
    currentFolderId,
    classFilter,
    topicFilter,
    chapterFilter,
    searchQuery,
  ]);

  const triggerPresetUpload = (preset: UploadPreset) => {
    setUploadPreset(preset);
    setFabOpen(false);
    window.setTimeout(() => {
      if (fileInputRef.current) {
        fileInputRef.current.accept = preset.accept;
        fileInputRef.current.click();
      }
    }, 30);
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (picked.length === 0) return;
    setStagedFiles(picked);
    if (picked.length === 1) {
      setMatTitle(picked[0].name.replace(/\.[^/.]+$/, ''));
    } else {
      setMatTitle('');
    }
    setMatDesc('');
    setMatTopic('');
    setMatChapter('');
    setMatInline('');
    setMatExternalUrl('');
    setMatPublished(true);
    setUploadError(null);
    setUploadProgressText(null);
    setUploadModalOpen(true);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffUid) return;
    setUploadError(null);

    if (stagedFiles.length === 0 && !matExternalUrl.trim() && !matInline.trim()) {
      setUploadError('Select at least one file, paste a resource URL, or write lesson notes.');
      return;
    }

    setSavingMat(true);
    try {
      if (stagedFiles.length > 0) {
        for (let i = 0; i < stagedFiles.length; i++) {
          const file = stagedFiles[i];
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const id = generateDocId('mat');
          const resolvedType: MaterialType =
            uploadPreset.type !== 'other'
              ? uploadPreset.type
              : detectMaterialTypeFromFile(file.name, file.type);
          const docTitle =
            stagedFiles.length === 1 && matTitle.trim()
              ? sanitizeString(matTitle, 160)
              : sanitizeString(file.name.replace(/\.[^/.]+$/, '') || file.name, 160);

          setUploadProgressText(
            `Uploading ${i + 1} of ${stagedFiles.length}: ${file.name}...`
          );

          const result = await uploadFileWithFallback({
            file,
            storagePath: `materials/${activeSubject}/${matClass}/${Date.now()}_${safeName}`,
            scope: 'material',
            ownerUid: staffUid,
            onProgress: (pct) =>
              setUploadProgressText(
                `Uploading ${i + 1} of ${stagedFiles.length} (${pct}%): ${file.name}`
              ),
          });

          const fileFormat = detectFileFormat(file.name, file.type, resolvedType);

          await setDoc(doc(db, 'materials', id), {
            id,
            title: docTitle,
            description: sanitizeString(matDesc, 1500),
            classLevel: matClass,
            subject: activeSubject,
            materialType: resolvedType,
            fileUrl: sanitizeSafeMaterialUrl(result.url, 900000),
            inlineContent: sanitizeString(matInline, 20000),
            fileName: sanitizeString(file.name, 200),
            folderId: currentFolderId,
            topic: sanitizeString(matTopic, 160),
            chapter: sanitizeString(matChapter, 120),
            fileFormat,
            fileSizeBytes: result.sizeBytes,
            uploadedBy: staffUid,
            uploaderName: staffName,
            published: matPublished,
            views: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          await logPlatformActivity({
            actorId: staffUid,
            actorName: staffName,
            actorRole: isAdmin ? 'admin' : 'teacher',
            action: 'Uploaded Study Material',
            details: `${matClass} ${activeSubject} (${fileFormat}): ${docTitle}`,
          });

          if (matPublished) {
            await publishPublicNotice({
              kind: 'material',
              title: `New ${fileFormat} Uploaded: ${docTitle}`,
              summary: `${matClass === 'ALL' ? 'All Classes' : matClass} · ${activeSubject} learning material added.`,
              subject: activeSubject,
              classLevel: matClass,
              createdBy: staffUid,
            });
          }
        }
      } else {
        const id = generateDocId('mat');
        const cleanTitle = sanitizeString(matTitle || 'Study Material', 160);
        const safeUrl = sanitizeSafeMaterialUrl(matExternalUrl, 900000);
        const fileFormat = safeUrl ? detectFileFormat(safeUrl, '', uploadPreset.type) : 'NOTES';

        await setDoc(doc(db, 'materials', id), {
          id,
          title: cleanTitle,
          description: sanitizeString(matDesc, 1500),
          classLevel: matClass,
          subject: activeSubject,
          materialType: uploadPreset.type,
          fileUrl: safeUrl,
          inlineContent: sanitizeString(matInline, 20000),
          fileName: '',
          folderId: currentFolderId,
          topic: sanitizeString(matTopic, 160),
          chapter: sanitizeString(matChapter, 120),
          fileFormat,
          fileSizeBytes: 0,
          uploadedBy: staffUid,
          uploaderName: staffName,
          published: matPublished,
          views: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await logPlatformActivity({
          actorId: staffUid,
          actorName: staffName,
          actorRole: isAdmin ? 'admin' : 'teacher',
          action: 'Published Study Material',
          details: `${matClass} ${activeSubject}: ${cleanTitle}`,
        });

        if (matPublished) {
          await publishPublicNotice({
            kind: 'material',
            title: `New Study Material: ${cleanTitle}`,
            summary: `${matClass === 'ALL' ? 'All Classes' : matClass} · ${activeSubject} notes published.`,
            subject: activeSubject,
            classLevel: matClass,
            createdBy: staffUid,
          });
        }
      }

      setUploadModalOpen(false);
      setStagedFiles([]);
      setUploadProgressText(null);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Failed to upload learning material.'
      );
      handleFirestoreError(err, OperationType.CREATE, 'materials');
    } finally {
      setSavingMat(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = sanitizeString(newFolderName, 120);
    if (!cleanName || !staffUid) return;
    setSavingFolder(true);
    const id = generateDocId('fld');
    try {
      await setDoc(doc(db, 'materialFolders', id), {
        id,
        name: cleanName,
        subject: activeSubject,
        parentFolderId: currentFolderId,
        classLevel: newFolderClass,
        createdBy: staffUid,
        creatorName: staffName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logPlatformActivity({
        actorId: staffUid,
        actorName: staffName,
        actorRole: isAdmin ? 'admin' : 'teacher',
        action: 'Created Material Folder',
        details: `${activeSubject} (${newFolderClass}): ${cleanName}`,
      });
      setNewFolderName('');
      setFolderModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `materialFolders/${id}`);
    } finally {
      setSavingFolder(false);
    }
  };

  const handleDeleteFolder = async (folder: MaterialFolder) => {
    try {
      await deleteDoc(doc(db, 'materialFolders', folder.id));
      if (currentFolderId === folder.id) {
        setCurrentFolderId(folder.parentFolderId || '');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `materialFolders/${folder.id}`);
    }
  };

  const openEditModal = (mat: StudyMaterial) => {
    setEditingMaterial(mat);
    setEditTitle(mat.title);
    setEditClass(mat.classLevel);
    setEditTopic(mat.topic || '');
    setEditChapter(mat.chapter || '');
    setEditDesc(mat.description || '');
    setEditFolderId(mat.folderId || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;
    setSavingEdit(true);
    try {
      await updateDoc(doc(db, 'materials', editingMaterial.id), {
        title: sanitizeString(editTitle, 160) || editingMaterial.title,
        classLevel: editClass,
        topic: sanitizeString(editTopic, 160),
        chapter: sanitizeString(editChapter, 120),
        description: sanitizeString(editDesc, 1500),
        folderId: editFolderId,
        updatedAt: serverTimestamp(),
      });
      await logPlatformActivity({
        actorId: staffUid,
        actorName: staffName,
        actorRole: isAdmin ? 'admin' : 'teacher',
        action: 'Updated Material Metadata',
        details: `${editingMaterial.subject}: ${editTitle}`,
      });
      setEditingMaterial(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `materials/${editingMaterial.id}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleTriggerReplace = (mat: StudyMaterial) => {
    setReplacingMaterial(mat);
    window.setTimeout(() => {
      replaceInputRef.current?.click();
    }, 30);
  };

  const handleReplaceFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !replacingMaterial) return;
    const targetMat = replacingMaterial;
    setReplacingMaterial(null);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    try {
      const result = await uploadFileWithFallback({
        file,
        storagePath: `materials/${targetMat.subject}/${targetMat.classLevel}/${Date.now()}_${safeName}`,
        scope: 'material',
        ownerUid: staffUid,
      });
      const detectedType = detectMaterialTypeFromFile(file.name, file.type);
      const formatLabel = detectFileFormat(file.name, file.type, detectedType);
      await updateDoc(doc(db, 'materials', targetMat.id), {
        fileUrl: sanitizeSafeMaterialUrl(result.url, 900000),
        fileName: sanitizeString(file.name, 200),
        materialType: detectedType,
        fileFormat: formatLabel,
        fileSizeBytes: result.sizeBytes,
        updatedAt: serverTimestamp(),
      });
      await logPlatformActivity({
        actorId: staffUid,
        actorName: staffName,
        actorRole: isAdmin ? 'admin' : 'teacher',
        action: 'Replaced Document File',
        details: `${targetMat.subject}: ${targetMat.title} -> ${file.name}`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `materials/${targetMat.id}`);
    }
  };

  const handleTogglePublish = async (mat: StudyMaterial) => {
    try {
      await updateDoc(doc(db, 'materials', mat.id), {
        published: !mat.published,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `materials/${mat.id}`);
    }
  };

  const handleDeleteMaterial = async (mat: StudyMaterial) => {
    try {
      await deleteDoc(doc(db, 'materials', mat.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `materials/${mat.id}`);
    }
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSavingCourse(true);
    const id = generateDocId('course');
    const topics = courseTopicsText
      .split('\n')
      .map((t) => sanitizeString(t, 120))
      .filter(Boolean)
      .slice(0, 20);
    try {
      await setDoc(doc(db, 'courses', id), {
        id,
        classLevel: courseClass,
        subject: courseSubject,
        title: sanitizeString(courseTitle, 140),
        description: sanitizeString(courseDesc, 1000),
        teacherId: staffUid,
        teacherName: staffName,
        topics,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCourseTitle('');
      setCourseDesc('');
      setCourseTopicsText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `courses/${id}`);
    } finally {
      setSavingCourse(false);
    }
  };

  const handleCreateLiveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLive(true);
    const id = generateDocId('live');
    try {
      await setDoc(doc(db, 'liveClasses', id), {
        id,
        title: sanitizeString(liveTitle, 160),
        classLevel: liveClass,
        subject: liveSubject,
        teacherId: staffUid,
        teacherName: staffName,
        scheduledAt: liveDate,
        durationMinutes: Number(liveDuration) || 60,
        meetingUrl: sanitizeSafeUrl(liveMeetingUrl, 500),
        sharedNotes: sanitizeString(liveNotes, 4000),
        attachedMaterialTitle: sanitizeString(liveMatTitle, 160),
        attachedMaterialUrl: sanitizeSafeUrl(liveMatUrl, 500),
        status: 'scheduled',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logPlatformActivity({
        actorId: staffUid,
        actorName: staffName,
        actorRole: isAdmin ? 'admin' : 'teacher',
        action: 'Scheduled Live Class',
        details: `${liveClass} ${liveSubject}: ${liveTitle}`,
      });
      setLiveTitle('');
      setLiveMeetingUrl('');
      setLiveNotes('');
      setLiveMatTitle('');
      setLiveMatUrl('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `liveClasses/${id}`);
    } finally {
      setSavingLive(false);
    }
  };

  const handleUpdateLiveStatus = async (lesson: LiveClass, status: LiveClass['status']) => {
    try {
      await updateDoc(doc(db, 'liveClasses', lesson.id), {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `liveClasses/${lesson.id}`);
    }
  };

  const visibleLibraries = SUBJECT_LIBRARIES.filter((lib) =>
    allowedSubjects.includes(lib.code)
  );
  const currentLibrary =
    SUBJECT_LIBRARIES.find((l) => l.code === activeSubject) || SUBJECT_LIBRARIES[0];

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="font-display text-2xl font-bold text-heading">
          Learning Materials, Classes & Live Classroom
        </h1>
        <p className="mt-1 text-sm text-muted">
          Organize subject libraries into folders, upload PDF, Word, PowerPoint, Excel & media documents, and manage S1–S6 classes.
        </p>
      </div>

      {/* Sub-navigation tabs */}
      <div className="inline-flex flex-wrap gap-1 rounded-xl bg-surface-muted p-1">
        <button
          type="button"
          onClick={() => setTab('materials')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            tab === 'materials' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
          }`}
        >
          Document Library
        </button>
        <button
          type="button"
          onClick={() => setTab('courses')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            tab === 'courses' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
          }`}
        >
          Classes & Subjects
        </button>
        <button
          type="button"
          onClick={() => setTab('live')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            tab === 'live' ? 'bg-surface text-heading shadow-xs' : 'text-muted'
          }`}
        >
          Live Classroom & Attendance
        </button>
      </div>

      {/* PART 1 & 2: EDUCATE-STYLE 4 SUBJECT DOCUMENT LIBRARIES */}
      {tab === 'materials' && (
        <div className="space-y-5">
          {/* Four Subject Libraries Switcher */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {visibleLibraries.map((lib) => {
              const active = activeSubject === lib.code;
              const count = materials.filter((m) => m.subject === lib.code).length;
              return (
                <button
                  key={lib.code}
                  type="button"
                  onClick={() => {
                    setActiveSubject(lib.code);
                    setCurrentFolderId('');
                  }}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    active
                      ? 'border-[#0284C7] bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/60 dark:to-surface shadow-sm ring-1 ring-[#0284C7]/30'
                      : 'border-border-theme bg-surface hover:border-sky-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#0284C7] dark:text-sky-400">
                      {lib.code}
                    </span>
                    <span className="text-xs font-bold text-muted tabular-nums">
                      {count} docs
                    </span>
                  </div>
                  <div className="mt-1 font-display text-sm sm:text-base font-bold text-heading">
                    {lib.libraryTitle}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted line-clamp-1">
                    {lib.shortDesc}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Library Toolbar: Breadcrumbs, Search & Organization Filters */}
          <div className="rounded-2xl border border-border-theme bg-surface p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Folder Breadcrumbs */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setCurrentFolderId('')}
                  className={`rounded-lg px-2.5 py-1.5 transition-colors ${
                    currentFolderId === ''
                      ? 'bg-[#0284C7] text-white'
                      : 'bg-surface-subtle text-heading hover:bg-surface-muted'
                  }`}
                >
                  {currentLibrary.libraryTitle}
                </button>
                {breadcrumbs.map((bc) => (
                  <React.Fragment key={bc.id}>
                    <ChevronRight className="h-3.5 w-3.5 text-faint" />
                    <button
                      type="button"
                      onClick={() => setCurrentFolderId(bc.id)}
                      className={`rounded-lg px-2.5 py-1.5 transition-colors ${
                        currentFolderId === bc.id
                          ? 'bg-[#0284C7] text-white'
                          : 'bg-surface-subtle text-heading hover:bg-surface-muted'
                      }`}
                    >
                      {bc.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUploadPreset(UPLOAD_PRESETS[0]);
                    setStagedFiles([]);
                    setMatTitle('');
                    setMatDesc('');
                    setMatTopic('');
                    setMatChapter('');
                    setMatInline('');
                    setMatExternalUrl('');
                    setUploadModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-btn-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-btn-primary-hover"
                >
                  <Upload className="h-3.5 w-3.5 text-[#FACC15]" />
                  <span>Upload Document</span>
                </button>
              </div>
            </div>

            {/* Filter Controls */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-faint" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search filename, title, topic..."
                  className="w-full rounded-xl border border-border-input bg-input-bg pl-9 pr-3 py-2 text-xs text-heading"
                />
              </div>

              <select
                value={classFilter}
                onChange={(e) =>
                  setClassFilter(e.target.value as 'ALL_VIEW' | 'ALL' | ClassLevel)
                }
                className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
              >
                <option value="ALL_VIEW">All Assigned Classes</option>
                <option value="ALL">Whole Academy (ALL)</option>
                {allowedClasses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                placeholder="Filter by Topic..."
                className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs text-heading"
              />

              <input
                type="text"
                value={chapterFilter}
                onChange={(e) => setChapterFilter(e.target.value)}
                placeholder="Filter by Chapter..."
                className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs text-heading"
              />
            </div>
          </div>

          {/* Subfolders Grid */}
          {visibleSubfolders.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-muted">
                Folders ({visibleSubfolders.length})
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {visibleSubfolders.map((folder) => {
                  const childDocs = materials.filter((m) => m.folderId === folder.id).length;
                  const canManageFolder =
                    isAdmin ||
                    folder.createdBy === staffUid ||
                    allowedSubjects.includes(folder.subject);
                  return (
                    <div
                      key={folder.id}
                      className="flex items-center justify-between gap-2 rounded-2xl border border-border-theme bg-surface p-3.5 shadow-xs hover:border-sky-300 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => setCurrentFolderId(folder.id)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100/80 dark:bg-amber-900/40 text-[#B8911E] dark:text-[#FACC15]">
                          <Folder className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-display text-xs sm:text-sm font-bold text-heading">
                            {folder.name}
                          </div>
                          <div className="text-[11px] text-muted">
                            {folder.classLevel === 'ALL' ? 'All' : folder.classLevel} · {childDocs} files
                          </div>
                        </div>
                      </button>
                      {canManageFolder && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteFolder(folder)}
                          className="rounded-lg p-1.5 text-faint hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600"
                          aria-label={`Delete folder ${folder.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Documents Grid */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-accent-sky" />
            </div>
          ) : visibleMaterials.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-theme bg-surface p-10 text-center">
              <BookOpen className="mx-auto h-9 w-9 text-faint" />
              <h3 className="mt-3 font-display text-base font-bold text-heading">
                No Documents in This Folder Yet
              </h3>
              <p className="mt-1 text-xs text-muted">
                Tap the floating + button at the bottom right to upload PDF, Word, PowerPoint, Excel, or image files into {currentLibrary.libraryTitle}.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleMaterials.map((mat) => {
                const viewsList = viewsByMaterial[mat.id] || [];
                const totalViews = Math.max(mat.views ?? 0, viewsList.length);
                const canManageMat =
                  isAdmin ||
                  mat.uploadedBy === staffUid ||
                  allowedSubjects.includes(mat.subject);

                return (
                  <DocumentLibraryCard
                    key={mat.id}
                    material={mat}
                    viewCountOverride={totalViews}
                    canManage={canManageMat}
                    onPreview={(m) => setPreviewMaterial(m)}
                    onRename={openEditModal}
                    onReplaceFile={handleTriggerReplace}
                    onMoveFolder={openEditModal}
                    onEditDetails={openEditModal}
                    onTogglePublish={(m) => void handleTogglePublish(m)}
                    onDelete={(m) => void handleDeleteMaterial(m)}
                    onToggleViewers={(m) =>
                      setAnalyticsMaterial(analyticsMaterial?.id === m.id ? null : m)
                    }
                  >
                    {analyticsMaterial?.id === mat.id && (
                      <div className="mt-3 rounded-xl border border-border-theme bg-surface-subtle p-3">
                        <div className="flex items-center justify-between text-xs font-bold text-heading">
                          <span className="inline-flex items-center gap-1">
                            <Eye className="h-3.5 w-3.5 text-accent-sky" />
                            <span>Document Viewers ({viewsList.length})</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setAnalyticsMaterial(null)}
                            className="text-faint hover:text-heading"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {viewsList.length === 0 ? (
                          <p className="mt-1 text-[11px] text-muted">
                            No students have opened this document yet.
                          </p>
                        ) : (
                          <div className="mt-2 divide-y divide-border-subtle max-h-36 overflow-y-auto">
                            {viewsList.map((v) => (
                              <div
                                key={v.viewerUid}
                                className="py-1 flex items-center justify-between text-[11px]"
                              >
                                <span className="font-medium text-heading">
                                  {v.viewerName} ({v.classLevel})
                                </span>
                                <span className="text-muted">{formatTimestamp(v.viewedAt)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </DocumentLibraryCard>
                );
              })}
            </div>
          )}

          {/* Prominent CREATE FOLDER Button at the bottom */}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => {
                setNewFolderName('');
                setNewFolderClass(isAdmin ? 'ALL' : allowedClasses[0] || 'S1');
                setFolderModalOpen(true);
              }}
              className="inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-2xl border-2 border-[#EAB308] bg-gradient-to-r from-[#0B1F3A] to-[#124299] px-7 py-3 text-sm font-bold text-white shadow-md hover:opacity-95 transition-opacity"
            >
              <FolderPlus className="h-5 w-5 text-[#FACC15]" />
              <span>CREATE FOLDER</span>
            </button>
          </div>

          {/* Hidden File Inputs */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFilesSelected}
            className="hidden"
          />
          <input
            ref={replaceInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*,*/*"
            onChange={handleReplaceFilePicked}
            className="hidden"
          />

          {/* Floating Circular PLUS (+) Button at Bottom Right */}
          <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2.5">
            {fabOpen && (
              <div className="w-64 rounded-2xl border border-border-theme bg-surface p-2 shadow-2xl space-y-1">
                <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                  Add to {currentLibrary.libraryTitle}
                </div>
                {UPLOAD_PRESETS.map((preset) => {
                  const IconComp =
                    preset.type === 'excel'
                      ? FileSpreadsheet
                      : preset.type === 'powerpoint'
                        ? Presentation
                        : preset.type === 'image'
                          ? ImageIcon
                          : preset.type === 'other'
                            ? File
                            : FileText;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => triggerPresetUpload(preset)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-heading hover:bg-accent-sky-soft transition-colors"
                    >
                      <IconComp className="h-4 w-4 text-[#0284C7] shrink-0" />
                      <span>{preset.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setFabOpen((prev) => !prev)}
              aria-label="Upload learning material"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#0284C7] to-[#124299] text-white shadow-xl ring-4 ring-[#EAB308]/50 hover:scale-105 active:scale-95 transition-transform"
            >
              <Plus className={`h-7 w-7 transition-transform ${fabOpen ? 'rotate-45' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: COURSES */}
      {tab === 'courses' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {isAdmin && (
            <form
              onSubmit={handleSaveCourse}
              className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4 lg:col-span-4"
            >
              <h2 className="font-display text-lg font-bold text-heading">
                Create Class Course
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-body">Class</label>
                  <select
                    value={courseClass}
                    onChange={(e) => setCourseClass(e.target.value as ClassLevel)}
                    className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-sm text-heading"
                  >
                    {CLASS_LEVELS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-body">Subject</label>
                  <select
                    value={courseSubject}
                    onChange={(e) => setCourseSubject(e.target.value as SubjectCode)}
                    className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-sm text-heading"
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Course Title</label>
                <input
                  type="text"
                  required
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                  placeholder="e.g. S4 Mathematics — O-Level Core"
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Description</label>
                <textarea
                  rows={2}
                  value={courseDesc}
                  onChange={(e) => setCourseDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">
                  Syllabus Topics (one per line)
                </label>
                <textarea
                  rows={4}
                  value={courseTopicsText}
                  onChange={(e) => setCourseTopicsText(e.target.value)}
                  placeholder="Quadratics&#10;Trigonometry&#10;Vectors"
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
                />
              </div>
              <button
                type="submit"
                disabled={savingCourse}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-btn-primary-hover"
              >
                {savingCourse ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                <span>Add Course</span>
              </button>
            </form>
          )}

          <div className={isAdmin ? 'lg:col-span-8' : 'lg:col-span-12'}>
            <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs">
              <h2 className="font-display text-base font-bold text-heading">
                Configured S1–S6 Courses ({courses.length})
              </h2>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-accent-sky" />
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {courses.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl border border-border-theme bg-surface-subtle p-4"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-accent-sky-text">
                          {c.classLevel} · {c.subject}
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => deleteDoc(doc(db, 'courses', c.id))}
                            className="text-faint hover:text-rose-600 dark:hover:text-rose-400"
                            aria-label="Delete course"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <h3 className="mt-1 font-display text-sm font-bold text-heading">
                        {c.title}
                      </h3>
                      <p className="mt-1 text-xs text-muted line-clamp-2">{c.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LIVE CLASSROOM */}
      {tab === 'live' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleCreateLiveClass}
            className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs space-y-4 lg:col-span-5"
          >
            <h2 className="font-display text-lg font-bold text-heading">
              Schedule Live Lesson
            </h2>
            <div>
              <label className="block text-xs font-semibold text-body">Lesson Title</label>
              <input
                type="text"
                required
                value={liveTitle}
                onChange={(e) => setLiveTitle(e.target.value)}
                placeholder="e.g. Organic Chemistry — Alkanes & Alkenes"
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-body">Class</label>
                <select
                  value={liveClass}
                  onChange={(e) => setLiveClass(e.target.value as ClassLevel)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-sm text-heading"
                >
                  {allowedClasses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Subject</label>
                <select
                  value={liveSubject}
                  onChange={(e) => setLiveSubject(e.target.value as SubjectCode)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-sm text-heading"
                >
                  {allowedSubjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-body">Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={liveDate}
                  onChange={(e) => setLiveDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-2.5 py-2 text-xs text-heading"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Duration (mins)</label>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={liveDuration}
                  onChange={(e) => setLiveDuration(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-sm text-heading"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">
                Video Meeting / Stream URL
              </label>
              <input
                type="url"
                value={liveMeetingUrl}
                onChange={(e) => setLiveMeetingUrl(e.target.value)}
                placeholder="https://meet.google.com/... or Jitsi / Zoom link"
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">
                Shared Lesson Notes
              </label>
              <textarea
                rows={3}
                value={liveNotes}
                onChange={(e) => setLiveNotes(e.target.value)}
                placeholder="Key objectives and class notes..."
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                value={liveMatTitle}
                onChange={(e) => setLiveMatTitle(e.target.value)}
                placeholder="Handout title (optional)"
                className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs text-heading"
              />
              <input
                type="url"
                value={liveMatUrl}
                onChange={(e) => setLiveMatUrl(e.target.value)}
                placeholder="Handout URL (optional)"
                className="rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs text-heading"
              />
            </div>

            <button
              type="submit"
              disabled={savingLive}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-btn-primary-hover"
            >
              {savingLive ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Video className="h-4 w-4" />
              )}
              <span>Schedule Live Class</span>
            </button>
          </form>

          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-2xl border border-border-theme bg-surface p-6 shadow-xs">
              <h2 className="font-display text-base font-bold text-heading">
                Live & Scheduled Classes ({liveClasses.length})
              </h2>
              <div className="mt-4 space-y-3">
                {liveClasses.length === 0 ? (
                  <p className="text-xs text-muted">No live classes scheduled yet.</p>
                ) : (
                  liveClasses.map((l) => (
                    <div
                      key={l.id}
                      className="rounded-xl border border-border-theme bg-surface-subtle p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-accent-sky-text">
                            {l.classLevel} · {l.subject} · {l.status.toUpperCase()}
                          </div>
                          <h3 className="font-display text-base font-bold text-heading">
                            {l.title}
                          </h3>
                          <p className="text-xs text-muted">
                            {formatTimestamp(l.scheduledAt)} · {l.durationMinutes} mins
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {l.status !== 'live' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateLiveStatus(l, 'live')}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              <Play className="h-3.5 w-3.5" />
                              <span>Start Live</span>
                            </button>
                          )}
                          {l.status === 'live' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateLiveStatus(l, 'ended')}
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                            >
                              <Square className="h-3.5 w-3.5" />
                              <span>End Class</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setAttendanceLessonId(attendanceLessonId === l.id ? null : l.id)
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-border-theme bg-surface px-3 py-1.5 text-xs font-semibold text-heading hover:bg-surface-muted"
                          >
                            <Users className="h-3.5 w-3.5" />
                            <span>Attendance</span>
                          </button>
                        </div>
                      </div>

                      {attendanceLessonId === l.id && (
                        <div className="mt-4 rounded-xl bg-surface p-3.5 border border-border-theme">
                          <div className="text-xs font-bold text-heading">
                            Student Attendance ({attendanceList.length})
                          </div>
                          {attendanceList.length === 0 ? (
                            <p className="mt-1 text-xs text-muted">
                              No students have joined this session yet.
                            </p>
                          ) : (
                            <div className="mt-2 divide-y divide-border-subtle">
                              {attendanceList.map((a) => (
                                <div
                                  key={a.studentUid}
                                  className="py-1.5 flex items-center justify-between text-xs"
                                >
                                  <span className="font-medium text-heading">
                                    {a.studentName} ({a.classLevel})
                                  </span>
                                  <span className="text-muted">
                                    {formatTimestamp(a.joinedAt)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload / Multi-File Staging Modal */}
      {uploadModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleUploadSubmit}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border-theme bg-surface p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div>
                <h2 className="font-display text-lg font-bold text-heading">
                  {uploadPreset.label}
                </h2>
                <p className="text-xs text-muted">
                  Destination: {currentLibrary.libraryTitle}
                  {breadcrumbs.length > 0
                    ? ` / ${breadcrumbs.map((b) => b.name).join(' / ')}`
                    : ' (Root)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1.5">
                Selected File(s) — Multi-file upload supported (up to 20 MB each)
              </label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sky-300 dark:border-sky-700 bg-accent-sky-soft px-4 py-3 text-xs font-bold text-heading hover:opacity-90">
                <Upload className="h-4 w-4 text-[#0284C7]" />
                <span>
                  {stagedFiles.length > 0
                    ? `${stagedFiles.length} file(s) selected — click to change`
                    : 'Choose File(s) from Device'}
                </span>
                <input
                  type="file"
                  multiple
                  accept={uploadPreset.accept}
                  onChange={(e) => {
                    const picked = Array.from(e.target.files || []);
                    if (picked.length > 0) {
                      setStagedFiles(picked);
                      if (picked.length === 1 && !matTitle) {
                        setMatTitle(picked[0].name.replace(/\.[^/.]+$/, ''));
                      }
                    }
                  }}
                  className="hidden"
                />
              </label>
              {stagedFiles.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  {stagedFiles.map((f, idx) => (
                    <li key={`${f.name}_${idx}`} className="truncate">
                      • {f.name} ({Math.max(1, Math.round(f.size / 1024))} KB)
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {stagedFiles.length <= 1 && (
              <div>
                <label className="block text-xs font-semibold text-body">Document Title</label>
                <input
                  type="text"
                  value={matTitle}
                  onChange={(e) => setMatTitle(e.target.value)}
                  placeholder="e.g. Linear Motion & Equations Notes"
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-body">Class</label>
                <select
                  value={matClass}
                  onChange={(e) => setMatClass(e.target.value as ClassLevel | 'ALL')}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-2.5 py-2 text-xs font-semibold text-heading"
                >
                  <option value="ALL">ALL Classes</option>
                  {allowedClasses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Topic</label>
                <input
                  type="text"
                  value={matTopic}
                  onChange={(e) => setMatTopic(e.target.value)}
                  placeholder="e.g. Kinematics"
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-2.5 py-2 text-xs text-heading"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Chapter</label>
                <input
                  type="text"
                  value={matChapter}
                  onChange={(e) => setMatChapter(e.target.value)}
                  placeholder="e.g. Chapter 2"
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-2.5 py-2 text-xs text-heading"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">Description</label>
              <textarea
                rows={2}
                value={matDesc}
                onChange={(e) => setMatDesc(e.target.value)}
                placeholder="Brief study instructions for students..."
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            {stagedFiles.length === 0 && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-body">
                    Or External Resource URL (https://...)
                  </label>
                  <input
                    type="url"
                    value={matExternalUrl}
                    onChange={(e) => setMatExternalUrl(e.target.value)}
                    placeholder="https://..."
                    className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-xs text-heading"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-body">
                    Inline Study Notes (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={matInline}
                    onChange={(e) => setMatInline(e.target.value)}
                    placeholder="Write study notes directly..."
                    className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-xs text-heading"
                  />
                </div>
              </>
            )}

            <label className="inline-flex items-center gap-2 text-xs font-semibold text-heading cursor-pointer">
              <input
                type="checkbox"
                checked={matPublished}
                onChange={(e) => setMatPublished(e.target.checked)}
                className="h-4 w-4 rounded border-border-input"
              />
              <span>Publish immediately to students</span>
            </label>

            {uploadProgressText && (
              <div className="rounded-xl bg-accent-sky-soft px-3 py-2 text-xs font-semibold text-accent-sky-text">
                {uploadProgressText}
              </div>
            )}
            {uploadError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                {uploadError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="rounded-xl border border-border-theme px-4 py-2 text-xs font-semibold text-body hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingMat}
                className="inline-flex items-center gap-2 rounded-xl bg-btn-primary px-5 py-2 text-xs font-bold text-white hover:bg-btn-primary-hover disabled:opacity-60"
              >
                {savingMat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span>
                  {stagedFiles.length > 1
                    ? `Upload ${stagedFiles.length} Documents`
                    : 'Save & Publish'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CREATE FOLDER Modal */}
      {folderModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleCreateFolder}
            className="w-full max-w-md rounded-2xl border border-border-theme bg-surface p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <h2 className="font-display text-lg font-bold text-heading">
                Create Folder in {currentLibrary.libraryTitle}
              </h2>
              <button
                type="button"
                onClick={() => setFolderModalOpen(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">Folder Name</label>
              <input
                type="text"
                required
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g. Term 2 Past Papers / Chapter 3 Waves"
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">Assigned Class</label>
              <select
                value={newFolderClass}
                onChange={(e) => setNewFolderClass(e.target.value as ClassLevel | 'ALL')}
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
              >
                <option value="ALL">All Classes</option>
                {allowedClasses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFolderModalOpen(false)}
                className="rounded-xl border border-border-theme px-4 py-2 text-xs font-semibold text-body hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingFolder}
                className="inline-flex items-center gap-1.5 rounded-xl bg-btn-primary px-5 py-2 text-xs font-bold text-white hover:bg-btn-primary-hover"
              >
                {savingFolder ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderPlus className="h-4 w-4 text-[#FACC15]" />
                )}
                <span>Create Folder</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rename / Move Folder / Edit Metadata Modal */}
      {editingMaterial && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-md rounded-2xl border border-border-theme bg-surface p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <h2 className="font-display text-lg font-bold text-heading inline-flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-accent-sky" />
                <span>Manage Document Details</span>
              </h2>
              <button
                type="button"
                onClick={() => setEditingMaterial(null)}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">Document Title</label>
              <input
                type="text"
                required
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-body">Class</label>
                <select
                  value={editClass}
                  onChange={(e) => setEditClass(e.target.value as ClassLevel | 'ALL')}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
                >
                  <option value="ALL">ALL Classes</option>
                  {allowedClasses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Folder Location</label>
                <select
                  value={editFolderId}
                  onChange={(e) => setEditFolderId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs font-semibold text-heading"
                >
                  <option value="">Root Library</option>
                  {folders
                    .filter((f) => f.subject === editingMaterial.subject)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-body">Topic</label>
                <input
                  type="text"
                  value={editTopic}
                  onChange={(e) => setEditTopic(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs text-heading"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-body">Chapter</label>
                <input
                  type="text"
                  value={editChapter}
                  onChange={(e) => setEditChapter(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3 py-2 text-xs text-heading"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body">Description</label>
              <textarea
                rows={2}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border-input bg-input-bg px-3.5 py-2 text-sm text-heading"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingMaterial(null)}
                className="rounded-xl border border-border-theme px-4 py-2 text-xs font-semibold text-body hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="inline-flex items-center gap-1.5 rounded-xl bg-btn-primary px-5 py-2 text-xs font-bold text-white hover:bg-btn-primary-hover"
              >
                {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Save Changes</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Document Preview Modal */}
      <PdfDocumentModal
        material={previewMaterial}
        onClose={() => setPreviewMaterial(null)}
      />
    </div>
  );
};
