export const LIVE_APP_URL =
  'https://ais-pre-f3ktn43wdcwn37b6kxbrzg-59362664961.europe-west1.run.app';

export function getLiveAppUrl(): string {
  if (typeof window === 'undefined') return LIVE_APP_URL;
  const origin = window.location.origin;
  if (
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.includes('ais-dev-')
  ) {
    return LIVE_APP_URL;
  }
  return origin;
}

export function generateDocId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'doc';
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${cleanPrefix}_${ts}_${rand}`;
}

export function sanitizeString(val: string, maxLength: number): string {
  return (val || '').trim().slice(0, maxLength);
}

export function isChunkedFileUrl(url: string): boolean {
  return /^chunked:\/\/[a-zA-Z0-9_-]{1,128}$/.test((url || '').trim());
}

export function isValidSafeUrl(url: string): boolean {
  if (!url || !url.trim()) return true;
  const trimmed = url.trim();
  if (isChunkedFileUrl(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

const SAFE_BASE64_MIME_REGEX =
  /^data:(application\/pdf|image\/(png|jpeg|jpg|webp|gif)|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation|spreadsheetml\.sheet)|application\/vnd\.ms-(powerpoint|excel)|text\/(plain|csv)|application\/(zip|x-zip-compressed|rtf|octet-stream)|video\/(mp4|webm|quicktime));base64,[A-Za-z0-9+/=]+$/;

export function sanitizeSafeUrl(url: string, maxLength = 900000): string {
  const trimmed = (url || '').trim().slice(0, maxLength);
  if (!trimmed) return '';
  if (SAFE_BASE64_MIME_REGEX.test(trimmed)) {
    return trimmed;
  }
  return isValidSafeUrl(trimmed) ? trimmed : '';
}

export function sanitizeSafeImageUrl(url: string, maxLength = 900000): string {
  const trimmed = (url || '').trim();
  if (!trimmed || trimmed.length > maxLength) return '';
  if (trimmed.startsWith('/src/assets/')) return trimmed;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed;
  }
  return isValidSafeUrl(trimmed) ? trimmed : '';
}

export function sanitizeSafeReceiptUrl(url: string, maxLength = 900000): string {
  const trimmed = (url || '').trim();
  if (!trimmed || trimmed.length > maxLength) return '';
  if (
    /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(trimmed) ||
    /^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(trimmed)
  ) {
    return trimmed;
  }
  return isValidSafeUrl(trimmed) ? trimmed : '';
}

export function sanitizeSafeMaterialUrl(url: string, maxLength = 900000): string {
  const trimmed = (url || '').trim();
  if (!trimmed || trimmed.length > maxLength) return '';
  if (SAFE_BASE64_MIME_REGEX.test(trimmed)) {
    return trimmed;
  }
  return isValidSafeUrl(trimmed) ? trimmed : '';
}

export function getEmbeddablePdfUrl(url: string): string {
  const safe = sanitizeSafeMaterialUrl(url);
  if (!safe) return '';
  const driveMatch = safe.match(/https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  }
  return safe;
}

export function detectFileFormat(fileName = '', mimeType = '', fallbackType = ''): string {
  const lowerName = (fileName || '').toLowerCase();
  const extMatch = lowerName.match(/\.([a-z0-9]{2,6})$/);
  if (extMatch) {
    return extMatch[1].toUpperCase().slice(0, 12);
  }
  const lowerMime = (mimeType || '').toLowerCase();
  if (lowerMime.includes('pdf')) return 'PDF';
  if (lowerMime.includes('wordprocessingml') || lowerMime.includes('msword')) return 'DOCX';
  if (lowerMime.includes('presentationml') || lowerMime.includes('powerpoint')) return 'PPTX';
  if (lowerMime.includes('spreadsheetml') || lowerMime.includes('excel')) return 'XLSX';
  if (lowerMime.startsWith('image/')) return lowerMime.split('/')[1]?.toUpperCase().slice(0, 10) || 'IMAGE';
  if (lowerMime.startsWith('video/')) return 'VIDEO';
  if (fallbackType) return fallbackType.toUpperCase().slice(0, 12);
  return 'FILE';
}

export function detectMaterialTypeFromFile(
  fileName = '',
  mimeType = ''
): 'pdf' | 'word' | 'powerpoint' | 'excel' | 'image' | 'video' | 'other' {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf';
  if (
    lowerMime.includes('msword') ||
    lowerMime.includes('wordprocessingml') ||
    lowerName.endsWith('.doc') ||
    lowerName.endsWith('.docx')
  ) {
    return 'word';
  }
  if (
    lowerMime.includes('powerpoint') ||
    lowerMime.includes('presentationml') ||
    lowerName.endsWith('.ppt') ||
    lowerName.endsWith('.pptx')
  ) {
    return 'powerpoint';
  }
  if (
    lowerMime.includes('excel') ||
    lowerMime.includes('spreadsheetml') ||
    lowerName.endsWith('.xls') ||
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.csv')
  ) {
    return 'excel';
  }
  if (
    lowerMime.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp)$/.test(lowerName)
  ) {
    return 'image';
  }
  if (
    lowerMime.startsWith('video/') ||
    /\.(mp4|webm|mov|mkv)$/.test(lowerName)
  ) {
    return 'video';
  }
  return 'other';
}

export function detectAttachmentCategory(
  fileName = '',
  url = '',
  mimeType = ''
): '' | 'pdf' | 'photo' | 'doc' | 'other' {
  const lowerName = fileName.toLowerCase();
  const lowerUrl = url.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  if (!lowerName && !lowerUrl && !lowerMime) return '';
  if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf') || lowerUrl.startsWith('data:application/pdf') || lowerUrl.includes('.pdf')) {
    return 'pdf';
  }
  if (
    lowerMime.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif)$/.test(lowerName) ||
    lowerUrl.startsWith('data:image/')
  ) {
    return 'photo';
  }
  if (
    /\.(docx?|pptx?|xlsx?|txt|rtf)$/.test(lowerName) ||
    lowerMime.includes('word') ||
    lowerMime.includes('presentation') ||
    lowerMime.includes('spreadsheet')
  ) {
    return 'doc';
  }
  return 'other';
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function compressImageToDataUrl(
  file: File,
  maxDimension = 1400,
  quality = 0.84,
  maxChars = 720000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height, 1));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length > maxChars) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        }
        if (dataUrl.length > maxChars) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.45);
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export function isValidIdFormat(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

export function formatTimestamp(ts: unknown): string {
  if (!ts) return 'Just now';
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toLocaleString('en-UG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }
  if (typeof ts === 'string') {
    const parsed = new Date(ts);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' });
    }
    return ts;
  }
  return 'Recently';
}
