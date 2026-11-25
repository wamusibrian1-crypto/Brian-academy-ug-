import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
  Assessment,
  AssessmentSubmission,
  ChatMessage,
  FeePaymentRequest,
  formatUGX,
  StudyMaterial,
} from '../types/academy';
import { formatTimestamp } from '../lib/validation';
import type { AdminSection } from '../components/admin/AdminShell';

export interface StaffNotificationItem {
  id: string;
  type: 'material' | 'assessment' | 'submission' | 'message' | 'payment';
  title: string;
  body: string;
  targetSection: AdminSection;
  openChatTab?: boolean;
  createdAtSec: number;
  timestampLabel: string;
}

function getTsSeconds(ts: unknown): number {
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return Number((ts as { seconds?: number }).seconds) || 0;
  }
  return 0;
}

export function useStaffNotifications() {
  const { role, adminProfile, teacherProfile } = useAuth();
  const isStaff = role === 'admin' || role === 'teacher';
  const isAdmin = role === 'admin';
  const staffUid = adminProfile?.uid || teacherProfile?.uid || '';

  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [submissions, setSubmissions] = useState<AssessmentSubmission[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<FeePaymentRequest[]>([]);

  const storageKey = isStaff && staffUid ? `baug_staff_notifs_${staffUid}` : '';
  const [seenIds, setSeenIds] = useState<Record<string, boolean>>({});
  const [latestAlert, setLatestAlert] = useState<StaffNotificationItem | null>(null);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? window.Notification.permission
      : 'denied'
  );

  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialLoadedRef = useRef(false);

  useEffect(() => {
    if (!storageKey) {
      setSeenIds({});
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        const map: Record<string, boolean> = {};
        for (const id of parsed) map[id] = true;
        setSeenIds(map);
      } else {
        setSeenIds({});
      }
    } catch {
      setSeenIds({});
    }
    knownIdsRef.current = new Set();
    initialLoadedRef.current = false;
  }, [storageKey]);

  const persistSeen = useCallback(
    (nextMap: Record<string, boolean>) => {
      if (!storageKey) return;
      try {
        const keys = Object.keys(nextMap).slice(-300);
        localStorage.setItem(storageKey, JSON.stringify(keys));
      } catch {
        // ignore quota errors
      }
    },
    [storageKey]
  );

  useEffect(() => {
    if (!isStaff || !staffUid) return;

    const unsubMat = onSnapshot(
      collection(db, 'materials'),
      (snap) => setMaterials(snap.docs.map((d) => d.data() as StudyMaterial)),
      () => {}
    );
    const unsubAssess = onSnapshot(
      collection(db, 'assessments'),
      (snap) => setAssessments(snap.docs.map((d) => d.data() as Assessment)),
      () => {}
    );
    const unsubSub = onSnapshot(
      collection(db, 'submissions'),
      (snap) => setSubmissions(snap.docs.map((d) => d.data() as AssessmentSubmission)),
      () => {}
    );
    const unsubChat = onSnapshot(
      collection(db, 'chatMessages'),
      (snap) => setChatMessages(snap.docs.map((d) => d.data() as ChatMessage)),
      () => {}
    );

    let unsubPay = () => {};
    if (isAdmin) {
      unsubPay = onSnapshot(
        collection(db, 'feePaymentRequests'),
        (snap) => setPaymentRequests(snap.docs.map((d) => d.data() as FeePaymentRequest)),
        () => {}
      );
    }

    const timer = window.setTimeout(() => {
      initialLoadedRef.current = true;
    }, 1500);

    return () => {
      window.clearTimeout(timer);
      unsubMat();
      unsubAssess();
      unsubSub();
      unsubChat();
      unsubPay();
    };
  }, [isStaff, isAdmin, staffUid]);

  const notifications = useMemo<StaffNotificationItem[]>(() => {
    if (!isStaff || !staffUid) return [];
    const items: StaffNotificationItem[] = [];

    for (const m of materials) {
      if (m.uploadedBy !== staffUid) {
        items.push({
          id: `staff_mat_${m.id}`,
          type: 'material',
          title: `New Upload (${m.materialType.toUpperCase()}): ${m.title}`,
          body: `${m.classLevel === 'ALL' ? 'All Classes' : m.classLevel} · ${m.subject} by ${m.uploaderName}`,
          targetSection: 'classes',
          createdAtSec: getTsSeconds(m.createdAt),
          timestampLabel: formatTimestamp(m.createdAt),
        });
      }
    }

    for (const a of assessments) {
      if (a.createdBy !== staffUid) {
        items.push({
          id: `staff_assess_${a.id}`,
          type: 'assessment',
          title: `New ${a.kind === 'homework' ? 'Homework' : 'Test'} Upload: ${a.title}`,
          body: `${a.classLevel} ${a.subject} by ${a.creatorName}`,
          targetSection: 'examinations',
          createdAtSec: getTsSeconds(a.createdAt),
          timestampLabel: formatTimestamp(a.createdAt),
        });
      }
    }

    for (const s of submissions) {
      items.push({
        id: `staff_sub_${s.id}`,
        type: 'submission',
        title: `Student Upload: ${s.assessmentTitle}`,
        body: `${s.studentName} (${s.classLevel}) submitted ${s.subject}`,
        targetSection: 'examinations',
        createdAtSec: getTsSeconds(s.submittedAt),
        timestampLabel: formatTimestamp(s.submittedAt),
      });
    }

    for (const m of chatMessages) {
      if (m.senderId !== staffUid) {
        const roomLabel =
          m.channelId === 'institution_all' ? 'Institution Chat' : `${m.classLevel} ${m.subject}`;
        items.push({
          id: `staff_msg_${m.id}`,
          type: 'message',
          title: `New Chat (${roomLabel})`,
          body: `${m.senderName}: ${m.text.slice(0, 90)}${m.text.length > 90 ? '…' : ''}`,
          targetSection: 'reports',
          openChatTab: true,
          createdAtSec: getTsSeconds(m.createdAt),
          timestampLabel: formatTimestamp(m.createdAt),
        });
      }
    }

    if (isAdmin) {
      for (const p of paymentRequests) {
        if (p.status === 'pending') {
          items.push({
            id: `staff_pay_${p.id}`,
            type: 'payment',
            title: `Payment Proof Uploaded: ${p.studentName}`,
            body: `${p.classLevel} · ${formatUGX(p.amountUGX)} via ${p.paymentMethod}`,
            targetSection: 'fees',
            createdAtSec: getTsSeconds(p.createdAt),
            timestampLabel: formatTimestamp(p.createdAt),
          });
        }
      }
    }

    items.sort((a, b) => b.createdAtSec - a.createdAtSec);
    return items.slice(0, 35);
  }, [isStaff, isAdmin, staffUid, materials, assessments, submissions, chatMessages, paymentRequests]);

  useEffect(() => {
    if (!isStaff || !staffUid) return;

    const currentKnown = knownIdsRef.current;
    if (!initialLoadedRef.current) {
      for (const n of notifications) currentKnown.add(n.id);
      return;
    }

    let newestArrival: StaffNotificationItem | null = null;
    for (const n of notifications) {
      if (!currentKnown.has(n.id)) {
        currentKnown.add(n.id);
        if (!seenIds[n.id]) {
          if (!newestArrival) newestArrival = n;
          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            window.Notification.permission === 'granted'
          ) {
            try {
              new window.Notification(n.title, {
                body: n.body,
                icon: '/pwa-192x192.png',
                tag: n.id,
              });
            } catch {
              // ignore browser Notification constructor errors
            }
          }
        }
      }
    }

    if (newestArrival) {
      setLatestAlert(newestArrival);
    }
  }, [notifications, seenIds, isStaff, staffUid]);

  useEffect(() => {
    if (!latestAlert) return;
    const t = window.setTimeout(() => setLatestAlert(null), 6000);
    return () => window.clearTimeout(t);
  }, [latestAlert]);

  const unreadItems = useMemo(
    () => notifications.filter((n) => !seenIds[n.id]),
    [notifications, seenIds]
  );

  const markAsRead = useCallback(
    (id: string) => {
      setSeenIds((prev) => {
        if (prev[id]) return prev;
        const next = { ...prev, [id]: true };
        persistSeen(next);
        return next;
      });
    },
    [persistSeen]
  );

  const markAllRead = useCallback(() => {
    setSeenIds((prev) => {
      const next = { ...prev };
      for (const n of notifications) next[n.id] = true;
      persistSeen(next);
      return next;
    });
  }, [notifications, persistSeen]);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const res = await window.Notification.requestPermission();
      setBrowserPermission(res);
    } catch {
      // ignore permission rejection
    }
  }, []);

  return {
    notifications,
    unreadCount: unreadItems.length,
    seenIds,
    latestAlert,
    dismissLatestAlert: () => setLatestAlert(null),
    markAsRead,
    markAllRead,
    browserPermission,
    requestBrowserPermission,
    supportsBrowserNotifications:
      typeof window !== 'undefined' && 'Notification' in window,
  };
}
