import { useEffect, useState } from 'react';

/**
 * A clock that ticks. Anything showing "x ago" or comparing against a staleness
 * window needs one — `Date.now()` read during render freezes at that render.
 */
export const useNow = (intervalMs: number): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
};
