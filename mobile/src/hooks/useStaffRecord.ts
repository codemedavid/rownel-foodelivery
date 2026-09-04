import { useCallback, useEffect, useRef, useState } from 'react';
import { adminStaffApi } from '../lib/adminStaffApi';
import type { StaffRecord } from '../lib/adminTypes';

/** Loads the signed-in user's staff row (RLS: "Staff read own record"). */
export const useStaffRecord = (userId: string | null | undefined) => {
  const [staffRecord, setStaffRecord] = useState<StaffRecord | null>(null);
  const [isLoading, setIsLoading] = useState(!!userId);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    if (!userId) {
      setStaffRecord(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const record = await adminStaffApi.getMine(userId);
      if (seq === requestSeq.current) setStaffRecord(record);
    } catch (err) {
      if (__DEV__) console.warn('Staff record lookup failed:', err);
      if (seq === requestSeq.current) setStaffRecord(null);
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { staffRecord, isLoading, refetch: load };
};
