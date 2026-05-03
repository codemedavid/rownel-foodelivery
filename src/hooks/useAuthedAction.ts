import { useCallback } from 'react';
import { useConvexAuth } from 'convex/react';

/**
 * Wraps a mutation/action handler so it short-circuits cleanly when Convex's
 * auth handshake hasn't completed yet. Use for click handlers that fire
 * Convex mutations — the alternative is an "Unauthorized" thrown mid-call.
 *
 *   const goOnline = useAuthedAction(async () => { await setOnline(...) })
 *   <button onClick={() => goOnline().catch(setError)} disabled={!ready}>
 *
 * Returns `{ run, ready }`. `run()` resolves to `{ ok: true, value }` on
 * success or `{ ok: false, reason: 'not-ready' | 'error', error? }`.
 */
export function useAuthedAction<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>
) {
  const { isAuthenticated: ready } = useConvexAuth();

  const run = useCallback(
    async (...args: TArgs) => {
      if (!ready) {
        return { ok: false as const, reason: 'not-ready' as const };
      }
      try {
        const value = await fn(...args);
        return { ok: true as const, value };
      } catch (error) {
        return { ok: false as const, reason: 'error' as const, error };
      }
    },
    [ready, fn]
  );

  return { run, ready };
}
