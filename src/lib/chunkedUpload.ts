import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from './firebase';
import {
  compressImageToDataUrl,
  generateDocId,
  isChunkedFileUrl,
  sanitizeSafeUrl,
  sanitizeString,
} from './validation';

export type UploadScope = 'material' | 'assessment' | 'submission' | 'fee' | 'advert';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB per PDF or Photo
const CHUNK_CHAR_SIZE = 580000; // ~580 KB per Firestore chunk doc (safe inside 1 MiB limit)
const MAX_INLINE_CHARS = 720000;

export interface UploadFileOptions {
  file: File;
  storagePath: string;
  scope: UploadScope;
  ownerUid: string;
  onProgress?: (pct: number) => void;
}

export interface UploadFileResult {
  url: string;
  mode: 'storage' | 'inline' | 'chunked';
  fileName: string;
  sizeBytes: number;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function tryFirebaseStorageUpload(
  file: File,
  storagePath: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, file);
    let settled = false;
    let receivedBytes = false;

    // Fast fallback if Storage bucket/rules stall without progress
    const stallTimer = window.setTimeout(() => {
      if (!settled && !receivedBytes) {
        settled = true;
        try {
          task.cancel();
        } catch {
          // ignore cancel errors
        }
        reject(new Error('storage/timeout'));
      }
    }, 4500);

    task.on(
      'state_changed',
      (snap) => {
        if (snap.bytesTransferred > 0) {
          receivedBytes = true;
        }
        if (snap.totalBytes > 0) {
          onProgress?.(Math.min(99, Math.round((snap.bytesTransferred / snap.totalBytes) * 100)));
        }
      },
      (err) => {
        if (!settled) {
          settled = true;
          window.clearTimeout(stallTimer);
          reject(err);
        }
      },
      async () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(stallTimer);
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            onProgress?.(100);
            resolve(url);
          } catch (urlErr) {
            reject(urlErr);
          }
        }
      }
    );
  });
}

async function uploadToFirestoreChunks(
  dataUrl: string,
  file: File,
  scope: UploadScope,
  ownerUid: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const fileId = generateDocId('file');
  const totalChars = dataUrl.length;
  const chunkCount = Math.max(1, Math.ceil(totalChars / CHUNK_CHAR_SIZE));

  if (chunkCount > 60) {
    throw new Error('File is too large for portal upload. Please keep PDFs and photos under 20 MB.');
  }

  onProgress?.(5);
  await setDoc(doc(db, 'fileUploads', fileId), {
    id: fileId,
    fileName: sanitizeString(file.name || 'uploaded_file', 200),
    mimeType: sanitizeString(file.type || 'application/octet-stream', 120),
    sizeBytes: Math.max(1, Math.round(file.size)),
    chunkCount,
    scope,
    uploadedBy: ownerUid,
    createdAt: serverTimestamp(),
  });

  for (let i = 0; i < chunkCount; i++) {
    const start = i * CHUNK_CHAR_SIZE;
    const slice = dataUrl.slice(start, start + CHUNK_CHAR_SIZE);
    const chunkId = `chunk_${i}`;
    await setDoc(doc(db, 'fileUploads', fileId, 'chunks', chunkId), {
      id: chunkId,
      fileId,
      index: i,
      data: slice,
      createdAt: serverTimestamp(),
    });
    const pct = Math.min(99, Math.round(((i + 1) / chunkCount) * 95) + 5);
    onProgress?.(pct);
  }

  onProgress?.(100);
  return `chunked://${fileId}`;
}

export async function uploadFileWithFallback({
  file,
  storagePath,
  scope,
  ownerUid,
  onProgress,
}: UploadFileOptions): Promise<UploadFileResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Selected file exceeds 20 MB limit. Please choose a smaller PDF or photo.');
  }

  // 1. Try Firebase Storage first
  try {
    const storageUrl = await tryFirebaseStorageUpload(file, storagePath, onProgress);
    return {
      url: storageUrl,
      mode: 'storage',
      fileName: file.name,
      sizeBytes: file.size,
    };
  } catch {
    // Fall through to inline/chunked Firestore storage so uploads always succeed
  }

  // 2. For images, compress cleanly while preserving readability
  if (file.type.startsWith('image/')) {
    onProgress?.(25);
    const compressedDataUrl = await compressImageToDataUrl(file, 1600, 0.86, MAX_INLINE_CHARS);
    if (compressedDataUrl.length <= MAX_INLINE_CHARS) {
      onProgress?.(100);
      return {
        url: compressedDataUrl,
        mode: 'inline',
        fileName: file.name,
        sizeBytes: file.size,
      };
    }
    const chunkedUri = await uploadToFirestoreChunks(
      compressedDataUrl,
      file,
      scope,
      ownerUid,
      onProgress
    );
    return {
      url: chunkedUri,
      mode: 'chunked',
      fileName: file.name,
      sizeBytes: file.size,
    };
  }

  // 3. For PDFs & other documents: inline if <= 520 KB, otherwise multi-chunk up to 20 MB
  onProgress?.(15);
  const dataUrl = await readFileAsDataUrl(file);
  if (dataUrl.length <= MAX_INLINE_CHARS && file.type === 'application/pdf') {
    onProgress?.(100);
    return {
      url: dataUrl,
      mode: 'inline',
      fileName: file.name,
      sizeBytes: file.size,
    };
  }

  const chunkedUri = await uploadToFirestoreChunks(dataUrl, file, scope, ownerUid, onProgress);
  return {
    url: chunkedUri,
    mode: 'chunked',
    fileName: file.name,
    sizeBytes: file.size,
  };
}

const resolvedUrlCache = new Map<string, string>();
const inFlightResolutions = new Map<string, Promise<string>>();

function dataUrlToBlobUrl(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return dataUrl;
  const header = dataUrl.slice(0, commaIdx);
  const base64Part = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/data:([^;]+);base64/i);
  const mimeType = mimeMatch?.[1] || 'application/octet-stream';

  const binaryStr = atob(base64Part);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

export async function resolveFileUrl(rawUrl: string): Promise<string> {
  const safe = sanitizeSafeUrl(rawUrl || '', 900000);
  if (!safe) return '';
  if (!isChunkedFileUrl(safe)) {
    // Convert inline data URLs (PDF, DOCX, PPTX, XLSX, etc.) to Blob URLs so browser preview/download works cleanly
    if (safe.startsWith('data:') && !safe.startsWith('data:image/')) {
      const cached = resolvedUrlCache.get(safe);
      if (cached) return cached;
      try {
        const blobUrl = dataUrlToBlobUrl(safe);
        resolvedUrlCache.set(safe, blobUrl);
        return blobUrl;
      } catch {
        return safe;
      }
    }
    return safe;
  }

  const cached = resolvedUrlCache.get(safe);
  if (cached) return cached;

  const existingPromise = inFlightResolutions.get(safe);
  if (existingPromise) return existingPromise;

  const fileId = safe.replace('chunked://', '').trim();
  const job = (async () => {
    try {
      const metaSnap = await getDoc(doc(db, 'fileUploads', fileId));
      if (!metaSnap.exists()) return '';
      const chunksSnap = await getDocs(collection(db, 'fileUploads', fileId, 'chunks'));
      const chunks = chunksSnap.docs
        .map((d) => d.data() as { index: number; data: string })
        .sort((a, b) => a.index - b.index);
      const assembledDataUrl = chunks.map((c) => c.data).join('');
      if (!assembledDataUrl) return '';
      const blobUrl = assembledDataUrl.startsWith('data:')
        ? dataUrlToBlobUrl(assembledDataUrl)
        : assembledDataUrl;
      resolvedUrlCache.set(safe, blobUrl);
      return blobUrl;
    } catch {
      return '';
    } finally {
      inFlightResolutions.delete(safe);
    }
  })();

  inFlightResolutions.set(safe, job);
  return job;
}

export async function triggerFileDownload(rawUrl: string, fileName?: string): Promise<boolean> {
  const resolved = await resolveFileUrl(rawUrl);
  if (!resolved) return false;
  const link = document.createElement('a');
  link.href = resolved;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  if (resolved.startsWith('blob:') || resolved.startsWith('data:')) {
    link.download = fileName || 'academy-document';
  }
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
}

export function useResolvedFileUrl(rawUrl?: string | null): {
  resolvedUrl: string;
  resolving: boolean;
} {
  const safeInput = sanitizeSafeUrl(rawUrl || '', 900000);
  const needsAsyncResolve =
    isChunkedFileUrl(safeInput) ||
    (safeInput.startsWith('data:') && !safeInput.startsWith('data:image/'));

  const [resolvedUrl, setResolvedUrl] = useState<string>(() => {
    if (!safeInput) return '';
    if (resolvedUrlCache.has(safeInput)) return resolvedUrlCache.get(safeInput) || '';
    if (!needsAsyncResolve) {
      return safeInput;
    }
    return '';
  });
  const [resolving, setResolving] = useState<boolean>(() => {
    if (!safeInput) return false;
    if (resolvedUrlCache.has(safeInput)) return false;
    return needsAsyncResolve;
  });

  useEffect(() => {
    let active = true;
    if (!safeInput) {
      setResolvedUrl('');
      setResolving(false);
      return;
    }
    if (resolvedUrlCache.has(safeInput)) {
      setResolvedUrl(resolvedUrlCache.get(safeInput) || '');
      setResolving(false);
      return;
    }
    if (!needsAsyncResolve) {
      setResolvedUrl(safeInput);
      setResolving(false);
      return;
    }

    setResolving(true);
    void resolveFileUrl(safeInput).then((url) => {
      if (active) {
        setResolvedUrl(url);
        setResolving(false);
      }
    });

    return () => {
      active = false;
    };
  }, [safeInput, needsAsyncResolve]);

  return { resolvedUrl, resolving };
}
