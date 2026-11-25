import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ClassLevel, PublicNotification } from '../types/academy';
import { generateDocId, sanitizeString } from './validation';

interface PublishPublicNoticeInput {
  kind: PublicNotification['kind'];
  title: string;
  summary: string;
  subject: string;
  classLevel: ClassLevel | 'ALL';
  createdBy: string;
}

export async function publishPublicNotice({
  kind,
  title,
  summary,
  subject,
  classLevel,
  createdBy,
}: PublishPublicNoticeInput): Promise<void> {
  if (!createdBy) return;
  const id = generateDocId('pub');
  try {
    await setDoc(doc(db, 'publicNotifications', id), {
      id,
      kind,
      title: sanitizeString(title, 140),
      summary: sanitizeString(summary, 240),
      subject: sanitizeString(subject || 'Academy', 40),
      classLevel,
      active: true,
      createdBy,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking alert broadcast
  }
}
