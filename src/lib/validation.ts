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

export function isValidSafeUrl(url: string): boolean {
  if (!url || !url.trim()) return true;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function sanitizeSafeUrl(url: string, maxLength = 500): string {
  const trimmed = (url || '').trim().slice(0, maxLength);
  if (!trimmed) return '';
  return isValidSafeUrl(trimmed) ? trimmed : '';
}

export function sanitizeSafeImageUrl(url: string, maxLength = 1000): string {
  const trimmed = (url || '').trim().slice(0, maxLength);
  if (!trimmed) return '';
  if (trimmed.startsWith('/src/assets/')) return trimmed;
  return isValidSafeUrl(trimmed) ? trimmed : '';
}

export function sanitizeSafeReceiptUrl(url: string, maxLength = 250000): string {
  const trimmed = (url || '').trim().slice(0, maxLength);
  if (!trimmed) return '';
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed;
  }
  return isValidSafeUrl(trimmed) ? trimmed : '';
}

export async function compressImageToDataUrl(
  file: File,
  maxDimension = 840,
  quality = 0.68
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read screenshot file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported screenshot image format.'));
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
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length > 240000) {
          resolve(canvas.toDataURL('image/jpeg', 0.45));
        } else {
          resolve(dataUrl);
        }
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
