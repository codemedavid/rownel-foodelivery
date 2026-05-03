import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConvexReactClient } from "convex/react";
import { supabase } from './supabase';

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  throw new Error('Missing VITE_CONVEX_URL environment variable');
}

export const convex = new ConvexReactClient(convexUrl);

// De-duplicate concurrent refresh requests. Convex may call fetchAccessToken
// from many places at once when a WebSocket reconnects; without this guard
// we'd spawn N parallel POSTs to /auth/v1/token and trip Supabase's 429.
let inflightRefresh: Promise<string | null> | null = null;
// Cache the last refreshed token briefly so a burst of force-refreshes in the
// same few seconds shares one network call (Supabase rate-limits /token).
let lastRefreshedToken: string | null = null;
let lastRefreshedAt = 0;
const REFRESH_COOLDOWN_MS = 5_000;

async function refreshSessionOnce(
  currentToken: string | null,
  options: { force?: boolean } = {}
): Promise<string | null> {
  const now = Date.now();
  // Cooldown only applies to opportunistic refreshes. When the caller forces
  // a refresh (Convex told us the current token was rejected), we MUST hit
  // Supabase — returning the same token would loop forever.
  if (
    !options.force &&
    lastRefreshedToken &&
    now - lastRefreshedAt < REFRESH_COOLDOWN_MS
  ) {
    return lastRefreshedToken;
  }
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        // Don't return null on transient errors — Convex would treat that as
        // signed-out and tear down subscriptions. Hand back what we have.
        return currentToken;
      }
      const token = data.session?.access_token ?? null;
      lastRefreshedToken = token;
      lastRefreshedAt = Date.now();
      return token;
    } catch {
      return currentToken;
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

/** Auth hook that passes the Supabase session JWT to Convex for server-side verification. */
export function useSupabaseAuth() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const apply = (token: string | null) => {
      if (!mounted) return;
      tokenRef.current = token;
      // Update the cached token but NOT the timestamp — otherwise the cooldown
      // window would falsely cover this token and cause refreshSessionOnce to
      // return it (potentially stale) instead of hitting Supabase.
      lastRefreshedToken = token;
      setAccessToken(token);
      setIsLoading(false);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session?.access_token ?? null))
      .catch(() => apply(null));

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => apply(session?.access_token ?? null)
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Stable across renders so ConvexProviderWithAuth doesn't reconfigure on
  // every parent re-render. Reads the latest token via ref.
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (forceRefreshToken) {
        if (!tokenRef.current) return null;
        return refreshSessionOnce(tokenRef.current, { force: true });
      }
      return tokenRef.current;
    },
    []
  );

  return useMemo(
    () => ({ isLoading, isAuthenticated: !!accessToken, fetchAccessToken }),
    [isLoading, accessToken, fetchAccessToken]
  );
}
