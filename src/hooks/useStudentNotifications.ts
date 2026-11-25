import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
  Assessment,
  AssessmentSubmission,
  ChatMessage,
  StudyMaterial,
  SupportTicket,
} from '../types/academy';
import { formatTimestamp } from '../lib/validation';
import type { StudentFeature } from '../components/student/StudentShell';

export interface StudentNotificationItem {
  id: string;
  type: 'material' | 'homework' | 'test' | 'message' | 'support';
  title: string;
  body: string;
  targetFeature: Exclude<StudentFeature, null>;
  createdAtSec: number;
  timestampLabel: string;
}

function getTsSeconds(ts: unknown): number {
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return Number((ts as { seconds?: number }).seconds) || 0;
  }
  return 0;
}

export function useStudentNotifications() {
  const { studentProfile } = useAuth();
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [institutionMsgs, setInstitutionMsgs] = useState<ChatMessage[]>([]);
  const [channelMsgs, setChannelMsgs] = useState<ChatMessage[]>([]);
  const [directMsgs, setDirectMsgs] = useState<ChatMessage[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [mySubmissions, setMySubmissions] = useState<AssessmentSubmission[]>([]);

  const storageKey = studentProfile ? `baug_seen_notifs_${studentProfile.uid}` : '';

  const [seenIds, setSeenIds] = useState<Record<string, boolean>>({});
  const [latestAlert, setLatestAlert] = useState<StudentNotificationItem | null>(null);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? window.Notification.permission
      : 'denied'
  );

  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialLoadedRef = useRef(false);

  // Load persisted seen notification IDs
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
        // ignore storage quota errors
      }
    },
    [storageKey]
  );

  // Subscribe to ALL published study materials/PDFs, assessments, institution/class/direct chat, and support replies
  useEffect(() => {
    if (!studentProfile) return;

    const qMaterials = query(collection(db, 'materials'), where('published', '==', true));
    const unsubMaterials = onSnapshot(
      qMaterials,
      (snap) => setMaterials(snap.docs.map((d) => d.data() as StudyMaterial)),
      () => {}
    );

    const qAssess = query(
      collection(db, 'assessments'),
      where('classLevel', '==', studentProfile.classLevel),
      where('published', '==', true)
    );
    const unsubAssess = onSnapshot(
      qAssess,
      (snap) => setAssessments(snap.docs.map((d) => d.data() as Assessment)),
      () => {}
    );

    const qInstitution = query(
      collection(db, 'chatMessages'),
      where('classLevel', '==', 'ALL'),
      where('recipientStudentId', '==', '')
    );
    const unsubInstitution = onSnapshot(
      qInstitution,
      (snap) => setInstitutionMsgs(snap.docs.map((d) => d.data() as ChatMessage)),
      () => {}
    );

    const qChannel = query(
      collection(db, 'chatMessages'),
      where('classLevel', '==', studentProfile.classLevel),
      where('recipientStudentId', '==', '')
    );
    const unsubChannel = onSnapshot(
      qChannel,
      (snap) => setChannelMsgs(snap.docs.map((d) => d.data() as ChatMessage)),
      () => {}
    );

    const qDirect = query(
      collection(db, 'chatMessages'),
      where('classLevel', '==', studentProfile.classLevel),
      where('recipientStudentId', '==', studentProfile.uid)
    );
    const unsubDirect = onSnapshot(
      qDirect,
      (snap) => setDirectMsgs(snap.docs.map((d) => d.data() as ChatMessage)),
      () => {}
    );

    const qTickets = query(
      collection(db, 'supportTickets'),
      where('studentId', '==', studentProfile.uid)
    );
    const unsubTickets = onSnapshot(
      qTickets,
      (snap) => setTickets(snap.docs.map((d) => d.data() as SupportTicket)),
      () => {}
    );

    const qSubmissions = query(
      collection(db, 'submissions'),
      where('studentId', '==', studentProfile.uid)
    );
    const unsubSubmissions = onSnapshot(
      qSubmissions,
      (snap) => setMySubmissions(snap.docs.map((d) => d.data() as AssessmentSubmission)),
      () => {}
    );

    const timer = window.setTimeout(() => {
      initialLoadedRef.current = true;
    }, 1500);

    return () => {
      window.clearTimeout(timer);
      unsubMaterials();
      unsubAssess();
      unsubInstitution();
      unsubChannel();
      unsubDirect();
      unsubTickets();
      unsubSubmissions();
    };
  }, [studentProfile]);

  const notifications = useMemo<StudentNotificationItem[]>(() => {
    if (!studentProfile) return [];
    const items: StudentNotificationItem[] = [];

    for (const m of materials) {
      items.push({
        id: `mat_${m.id}`,
        type: 'material',
        title: `New Upload (${m.materialType.toUpperCase()}): ${m.title}`,
        body: `${m.classLevel === 'ALL' ? 'All Classes' : m.classLevel} · ${m.subject} uploaded by ${m.uploaderName}`,
        targetFeature: 'study-material',
        createdAtSec: getTsSeconds(m.createdAt),
        timestampLabel: formatTimestamp(m.createdAt),
      });
    }

    for (const a of assessments) {
      items.push({
        id: `assess_${a.id}`,
        type: a.kind === 'homework' ? 'homework' : 'test',
        title: `New ${a.kind === 'homework' ? 'Homework' : 'Test'} Upload: ${a.title}`,
        body: `${a.subject} · Due ${a.dueDate || 'Check schedule'} · ${a.totalMarks} marks`,
        targetFeature: a.kind === 'homework' ? 'homework' : 'test',
        createdAtSec: getTsSeconds(a.createdAt),
        timestampLabel: formatTimestamp(a.createdAt),
      });
    }

    const allMessages = [...institutionMsgs, ...channelMsgs, ...directMsgs];
    const uniqueMsgs = new Map<string, ChatMessage>();
    for (const msg of allMessages) {
      if (msg.senderId !== studentProfile.uid) {
        uniqueMsgs.set(msg.id, msg);
      }
    }

    for (const m of uniqueMsgs.values()) {
      const roleTag =
        m.senderRole === 'admin'
          ? 'Administrator'
          : m.senderRole === 'teacher'
            ? 'Teacher'
            : 'Student';
      const roomLabel =
        m.channelId === 'institution_all' ? 'Institution Chat' : m.subject;
      items.push({
        id: `msg_${m.id}`,
        type: 'message',
        title: `New Chat (${roomLabel}) · ${roleTag}`,
        body: `${m.senderName}: ${m.text.slice(0, 90)}${m.text.length > 90 ? '…' : ''}`,
        targetFeature: 'chat',
        createdAtSec: getTsSeconds(m.createdAt),
        timestampLabel: formatTimestamp(m.createdAt),
      });
    }

    for (const t of tickets) {
      if (t.adminReply && t.adminReply.trim()) {
        items.push({
          id: `tkt_${t.id}`,
          type: 'support',
          title: `Admin Reply: ${t.subject}`,
          body: t.adminReply.slice(0, 100),
          targetFeature: 'help',
          createdAtSec: getTsSeconds(t.updatedAt),
          timestampLabel: formatTimestamp(t.updatedAt),
        });
      }
    }

    for (const s of mySubmissions) {
      const updatedSec = getTsSeconds(s.updatedAt);
      if (s.status === 'published' || s.status === 'graded') {
        items.push({
          id: `sub_${s.id}_${s.status}_${updatedSec}`,
          type: s.kind === 'homework' ? 'homework' : 'test',
          title: `Work Marked: ${s.assessmentTitle}`,
          body: `${s.subject} · Score: ${s.totalScore}/${s.maxMarks} (${s.grade || 'Graded'})${
            s.teacherRemarks ? ` · ${s.teacherRemarks.slice(0, 60)}` : ''
          }`,
          targetFeature: s.kind === 'homework' ? 'homework' : 'test',
          createdAtSec: updatedSec,
          timestampLabel: formatTimestamp(s.updatedAt),
        });
      } else if (s.status === 'returned') {
        items.push({
          id: `sub_${s.id}_returned_${updatedSec}`,
          type: s.kind === 'homework' ? 'homework' : 'test',
          title: `Returned for Correction: ${s.assessmentTitle}`,
          body: `${s.subject} · ${
            s.corrections || s.teacherRemarks || 'Please review teacher guidance and resubmit.'
          }`,
          targetFeature: s.kind === 'homework' ? 'homework' : 'test',
          createdAtSec: updatedSec,
          timestampLabel: formatTimestamp(s.updatedAt),
        });
      }
    }

    items.sort((a, b) => b.createdAtSec - a.createdAtSec);
    return items.slice(0, 40);
  }, [
    studentProfile,
    materials,
    assessments,
    institutionMsgs,
    channelMsgs,
    directMsgs,
    tickets,
    mySubmissions,
  ]);

  // Fire local browser Notification + live in-app toast for newly arriving uploads & chats
  useEffect(() => {
    if (!studentProfile) return;

    const currentKnown = knownIdsRef.current;
    if (!initialLoadedRef.current) {
      for (const n of notifications) currentKnown.add(n.id);
      return;
    }

    let newestArrival: StudentNotificationItem | null = null;
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
              // Ignore browser Notification constructor restrictions
            }
          }
        }
      }
    }

    if (newestArrival) {
      setLatestAlert(newestArrival);
    }
  }, [notifications, seenIds, studentProfile]);

  useEffect(() => {
    if (!latestAlert) return;
    const t = window.setTimeout(() => setLatestAlert(null), 6000);
    return () => window.clearTimeout(t);
  }, [latestAlert]);

  const unreadItems = useMemo(
    () => notifications.filter((n) => !seenIds[n.id]),
    [notifications, seenIds]
  );

  const unreadByFeature = useMemo(() => {
    const counts: Partial<Record<Exclude<StudentFeature, null>, number>> = {};
    for (const item of unreadItems) {
      counts[item.targetFeature] = (counts[item.targetFeature] || 0) + 1;
    }
    return counts;
  }, [unreadItems]);

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

  const markFeatureRead = useCallback(
    (feature: Exclude<StudentFeature, null>) => {
      setSeenIds((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const n of notifications) {
          if (n.targetFeature === feature && !next[n.id]) {
            next[n.id] = true;
            changed = true;
          }
        }
        if (changed) persistSeen(next);
        return changed ? next : prev;
      });
    },
    [notifications, persistSeen]
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
      // Ignore permission rejection
    }
  }, []);

  return {
    notifications,
    unreadCount: unreadItems.length,
    unreadByFeature,
    seenIds,
    latestAlert,
    dismissLatestAlert: () => setLatestAlert(null),
    markAsRead,
    markFeatureRead,
    markAllRead,
    browserPermission,
    requestBrowserPermission,
    supportsBrowserNotifications:
      typeof window !== 'undefined' && 'Notification' in window,
  };
}
