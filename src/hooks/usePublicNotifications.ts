import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PublicNotification } from '../types/academy';
import { formatTimestamp } from '../lib/validation';

export interface PublicNotificationItem {
  id: string;
  kind: PublicNotification['kind'];
  title: string;
  summary: string;
  subject: string;
  classLevel: string;
  createdAtSec: number;
  timestampLabel: string;
}

const PUBLIC_SEEN_KEY = 'baug_public_seen_notifs_v1';

function getTsSeconds(ts: unknown): number {
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return Number((ts as { seconds?: number }).seconds) || 0;
  }
  return 0;
}

export function usePublicNotifications(enabled: boolean) {
  const [notices, setNotices] = useState<PublicNotification[]>([]);
  const [seenIds, setSeenIds] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(PUBLIC_SEEN_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as string[];
      const map: Record<string, boolean> = {};
      for (const id of parsed) map[id] = true;
      return map;
    } catch {
      return {};
    }
  });
  const [latestPopout, setLatestPopout] = useState<PublicNotificationItem | null>(null);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? window.Notification.permission
      : 'denied'
  );

  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialPoppedRef = useRef(false);

  const persistSeen = useCallback((nextMap: Record<string, boolean>) => {
    try {
      const keys = Object.keys(nextMap).slice(-200);
      localStorage.setItem(PUBLIC_SEEN_KEY, JSON.stringify(keys));
    } catch {
      // ignore storage quota errors
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLatestPopout(null);
      initialPoppedRef.current = false;
      knownIdsRef.current = new Set();
      return;
    }

    const q = query(collection(db, 'publicNotifications'), where('active', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotices(snap.docs.map((d) => d.data() as PublicNotification));
      },
      () => {
        setNotices([]);
      }
    );

    return () => unsub();
  }, [enabled]);

  const notifications = useMemo<PublicNotificationItem[]>(() => {
    const items = notices.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      summary: n.summary,
      subject: n.subject,
      classLevel: n.classLevel,
      createdAtSec: getTsSeconds(n.createdAt),
      timestampLabel: formatTimestamp(n.createdAt),
    }));
    items.sort((a, b) => b.createdAtSec - a.createdAtSec);
    return items.slice(0, 25);
  }, [notices]);

  useEffect(() => {
    if (!enabled || notifications.length === 0) return;

    const currentKnown = knownIdsRef.current;

    // On initial pre-login visit, pop out the newest unseen upload/chat alert automatically
    if (!initialPoppedRef.current) {
      initialPoppedRef.current = true;
      for (const n of notifications) currentKnown.add(n.id);
      const firstUnseen = notifications.find((n) => !seenIds[n.id]);
      if (firstUnseen) {
        setLatestPopout(firstUnseen);
      }
      return;
    }

    // Real-time pop-out whenever a new upload or chat arrives even when logged out
    let newestArrival: PublicNotificationItem | null = null;
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
              new window.Notification(`BRIAN ACADEMY UG · ${n.title}`, {
                body: n.summary,
                icon: '/pwa-192x192.png',
                tag: `pub_${n.id}`,
              });
            } catch {
              // ignore browser notification restrictions
            }
          }
        }
      }
    }

    if (newestArrival) {
      setLatestPopout(newestArrival);
    }
  }, [enabled, notifications, seenIds]);

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

  const dismissLatestPopout = useCallback(() => {
    if (latestPopout) {
      markAsRead(latestPopout.id);
    }
    setLatestPopout(null);
  }, [latestPopout, markAsRead]);

  const markAllRead = useCallback(() => {
    setSeenIds((prev) => {
      const next = { ...prev };
      for (const n of notifications) next[n.id] = true;
      persistSeen(next);
      return next;
    });
    setLatestPopout(null);
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
    latestPopout,
    dismissLatestPopout,
    markAsRead,
    markAllRead,
    browserPermission,
    requestBrowserPermission,
    supportsBrowserNotifications:
      typeof window !== 'undefined' && 'Notification' in window,
  };
}
