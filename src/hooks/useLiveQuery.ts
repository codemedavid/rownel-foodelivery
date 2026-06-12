import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface RealtimeSource {
  table: string;
  /** Optional realtime filter, e.g. `rider_id=eq.<uuid>` */
  filter?: string;
}

export interface UseLiveQueryOptions {
  /** Re-fetch on a fixed interval (ms). Used instead of realtime for public/anon views. */
  pollMs?: number;
  /** Subscribe to postgres_changes on these tables and re-fetch on any event. */
  realtime?: RealtimeSource[];
  /** When false, the query is skipped and data stays null. */
  enabled?: boolean;
}

let channelSeq = 0;

/**
 * Generic fetch + invalidate hook replacing Convex's reactive useQuery.
 *
 * Free-tier hygiene: realtime events only trigger a (debounced) refetch — no
 * payload fan-out — and polling defaults to off. Keep poll intervals >= 10s
 * and reserve `realtime` for authenticated dashboards.
 */
export function useLiveQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options: UseLiveQueryOptions = {}
) {
  const { pollMs, realtime, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const generationRef = useRef(0);

  const refetch = useCallback(async () => {
    const gen = ++generationRef.current;
    try {
      const result = await fetcherRef.current();
      if (gen === generationRef.current) {
        setData(result);
        setError(null);
        setLoading(false);
      }
    } catch (err) {
      if (gen === generationRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!enabled) {
      generationRef.current++;
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    refetch();

    let timer: ReturnType<typeof setInterval> | undefined;
    if (pollMs) timer = setInterval(refetch, pollMs);

    let channel: ReturnType<typeof supabase.channel> | undefined;
    if (realtime && realtime.length > 0) {
      // Debounce bursts of change events into one refetch.
      let pending: ReturnType<typeof setTimeout> | undefined;
      const invalidate = () => {
        if (pending) clearTimeout(pending);
        pending = setTimeout(refetch, 250);
      };
      channel = supabase.channel(`live-query-${++channelSeq}`);
      for (const src of realtime) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: src.table, ...(src.filter ? { filter: src.filter } : {}) },
          invalidate
        );
      }
      channel.subscribe();
    }

    return () => {
      generationRef.current++;
      if (timer) clearInterval(timer);
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pollMs, ...deps]);

  return { data, loading, error, refetch };
}
