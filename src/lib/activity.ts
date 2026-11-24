import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { generateDocId, sanitizeString } from './validation';

export async function logPlatformActivity(params: {
  actorId: string;
  actorName: string;
  actorRole: 'student' | 'teacher' | 'admin';
  action: string;
  details: string;
}): Promise<void> {
  const id = generateDocId('log');
  const path = `activityLogs/${id}`;
  try {
    await setDoc(doc(db, 'activityLogs', id), {
      id,
      actorId: params.actorId,
      actorName: sanitizeString(params.actorName, 120) || 'User',
      actorRole: params.actorRole,
      action: sanitizeString(params.action, 160),
      details: sanitizeString(params.details, 400),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // Non-blocking audit log error handling via standard logger
    try {
      handleFirestoreError(err, OperationType.CREATE, path);
    } catch {
      // Do not crash user workflow if log write fails
    }
  }
}
