import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { FeeRecord } from '../types/academy';

export function useStudentFeeMute(): { isMutedUnpaid: boolean; checkingMute: boolean } {
  const { studentProfile, academicSettings } = useAuth();
  const [records, setRecords] = useState<FeeRecord[]>([]);
  const [checkingMute, setCheckingMute] = useState(false);

  const muteEnabled = Boolean(academicSettings.muteUnpaid);

  useEffect(() => {
    if (!studentProfile || !muteEnabled) {
      setRecords([]);
      setCheckingMute(false);
      return;
    }
    setCheckingMute(true);
    const q = query(
      collection(db, 'feeRecords'),
      where('studentId', '==', studentProfile.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRecords(snap.docs.map((d) => d.data() as FeeRecord));
        setCheckingMute(false);
      },
      () => {
        setCheckingMute(false);
      }
    );
    return () => unsub();
  }, [studentProfile, muteEnabled]);

  if (!studentProfile || !muteEnabled) {
    return { isMutedUnpaid: false, checkingMute: false };
  }

  const customInvoice = records.find(
    (r) => r.paymentMethod === 'Term Invoice' && r.totalTermFeeUGX > 0
  );
  const latestWithFee = records.find((r) => r.totalTermFeeUGX > 0);
  const expectedTermFee =
    customInvoice?.totalTermFeeUGX ??
    latestWithFee?.totalTermFeeUGX ??
    academicSettings.feeStructure?.[studentProfile.classLevel] ??
    450000;

  const totalPaid = records.reduce((sum, r) => sum + (r.amountPaidUGX || 0), 0);
  const balance = Math.max(0, expectedTermFee - totalPaid);

  return { isMutedUnpaid: balance > 0, checkingMute };
}
