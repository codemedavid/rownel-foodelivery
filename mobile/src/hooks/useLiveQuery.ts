import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase';

export interface RealtimeSource {
  table: string;
  /** Optional postgres_changes filter, e.g. `merchant_id=eq.<uuid>`. */
  filter?: string;
}

export interface UseLiveQueryOptions {
  /** Re-fetch on a fixed interval (ms). Fallback for when realtime drops. */
  pollMs?: number;
  /** Subscribe to postgres_changes on these tables and re-fetch on any event. */
  realtime?: RealtimeSource[];
  /** When false, the query is skipped and data stays null. */
  enabled?: boolean;
}

export const LIVE_QUERY_DEBOUNCE_MS = 250;

let channelSeq = 0;

/**
 * Fetch + invalidate hook (port of the web useLiveQuery). Realtime events only
 * trigger a debounced refetch; returning to the foreground refetches and
 * re-subscribes so a suspended socket never leaves stale data on screen.
 */
export function useLiveQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options: UseLiveQueryOptions = {}
) {
  const { pollMs, realtime, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [resubscribeKey, setResubscribeKey] = useState(0);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const generationRef = useRef(0);

  const refetch = useCallback(async () => {
    const gen = ++generationRef.current;
    try {
      const result = await fetcherRef.current();
      if (gen !== generationRef.current) return;
      setData(result);
      setError(null);
      setIsLoading(false);
    } catch (err) {
      if (gen !== generationRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') setResubscribeKey((k) => k + 1);
    });
    return () => sub.remove();
  }, []);

  const realtimeKey = JSON.stringify(realtime ?? []);

  useEffect(() => {
    if (!enabled) {
      generationRef.current++;
      setData(null);
      setIsLoading(false);
      return;
    }
    refetch();

    const timer = pollMs ? setInterval(refetch, pollMs) : undefined;

    let channel: ReturnType<typeof supabase.channel> | undefined;
    let pending: ReturnType<typeof setTimeout> | undefined;
    if (realtime && realtime.length > 0) {
      const invalidate = () => {
        if (pending) clearTimeout(pending);
        pending = setTimeout(refetch, LIVE_QUERY_DEBOUNCE_MS);
      };
      channel = supabase.channel(`live-query-${++channelSeq}`);
      for (const src of realtime) {
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: src.table,
            ...(src.filter ? { filter: src.filter } : {}),
          },
          invalidate
        );
      }
      channel.subscribe();
    }

    return () => {
      generationRef.current++;
      if (timer) clearInterval(timer);
      if (pending) clearTimeout(pending);
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pollMs, realtimeKey, resubscribeKey, refetch, ...deps]);

  return { data, isLoading, error, refetch };
}
