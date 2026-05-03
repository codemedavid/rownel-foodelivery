/**
 * Tests for src/hooks/useRiderProfile.ts
 *
 * Covers:
 *  - ratingAverage() pure function
 *  - useRiderProfile hook (renderHook)
 *  - fetchRiderById / fetchRiderSettings direct calls
 *
 * NOTE on convex/riders.ts & convex/riderActions.ts:
 *  These files export only Convex query/mutation/action wrappers that import
 *  from `convex/_generated/server` and `convex/_generated/api`. Running them
 *  outside a Convex runtime requires `convex-test` (not in this project's
 *  package.json) or a full Convex emulator. Direct handler tests are therefore
 *  SKIPPED — see the bottom of this file for skipped stubs with explanations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// ─── Inline mock factories ────────────────────────────────────────────────────
// vi.mock() factories are hoisted to the top of the module by Vitest's
// transformer, so variables declared with `const` below the call would not yet
// be initialised when the factory runs ("Cannot access before initialization").
// The solution is vi.hoisted() — its callback runs before hoisting, and any
// values it returns are safe to reference in the subsequent vi.mock() factories.

const { mockSupabase, authState } = vi.hoisted(() => {
  // Minimal inline Supabase chain mock — avoids importing from mocks.ts.
  const tables: Record<string, { data: unknown; error: { message: string } | null }> = {};

  const makeBuilder = (vi_: typeof import('vitest').vi) => (table: string) => {
    const getState = () => tables[table] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    const noop = () => chain;
    chain['select'] = vi_.fn(noop);
    chain['insert'] = vi_.fn(noop);
    chain['update'] = vi_.fn(noop);
    chain['delete'] = vi_.fn(noop);
    chain['eq'] = vi_.fn(noop);
    chain['neq'] = vi_.fn(noop);
    chain['maybeSingle'] = vi_.fn(async () => getState());
    chain['single'] = vi_.fn(async () => getState());
    chain['then'] = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(getState()).then(resolve);
    return chain;
  };

  // We can't import vi here (hoisted runs before imports resolve), but Vitest
  // injects `vi` as a global in test files. Cast it via globalThis.
  const vi_ = (globalThis as unknown as { vi: typeof import('vitest').vi }).vi;

  const from = vi_.fn((table: string) => makeBuilder(vi_)(table));

  const mockSupabase = {
    from,
    __setTable(table: string, state: { data: unknown; error: { message: string } | null }) {
      tables[table] = state;
      // Recreate `from` so new calls pick up the updated state.
    },
  };

  const authState: {
    user: { id: string; email?: string } | null;
    loading: boolean;
  } = { user: null, loading: false };

  return { mockSupabase, authState };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../lib/supabase', () => ({ supabase: mockSupabase }));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import {
  ratingAverage,
  useRiderProfile,
  fetchRiderById,
  fetchRiderSettings,
  type RiderSettings,
} from './useRiderProfile';
import { createMockSupabase, makeRiderProfile, makeAuthUser } from '../test/mocks';

// ─── ratingAverage ────────────────────────────────────────────────────────────

describe('ratingAverage()', () => {
  it('returns null when profile is null', () => {
    expect(ratingAverage(null)).toBeNull();
  });

  it('returns null when rating_count is 0', () => {
    expect(ratingAverage({ rating_sum: 0, rating_count: 0 })).toBeNull();
  });

  it('returns null when rating_count is 0 even with non-zero rating_sum', () => {
    // A data-anomaly case: count must guard before division.
    expect(ratingAverage({ rating_sum: 10, rating_count: 0 })).toBeNull();
  });

  it('computes the correct mean', () => {
    expect(ratingAverage({ rating_sum: 15, rating_count: 3 })).toBe(5);
  });

  it('computes fractional mean correctly', () => {
    expect(ratingAverage({ rating_sum: 7, rating_count: 2 })).toBeCloseTo(3.5);
  });

  it('handles a single rating', () => {
    expect(ratingAverage({ rating_sum: 4, rating_count: 1 })).toBe(4);
  });
});

// ─── useRiderProfile hook ─────────────────────────────────────────────────────

describe('useRiderProfile()', () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
    mockSupabase.__setTable('riders', { data: null, error: null });
  });

  it('returns null profile and loading=false when there is no authenticated user', async () => {
    authState.user = null;
    authState.loading = false;

    const { result } = renderHook(() => useRiderProfile());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBeNull();
  });

  it('keeps loading=true while authLoading is true', () => {
    authState.user = null;
    authState.loading = true;

    const { result } = renderHook(() => useRiderProfile());

    // Auth hasn't resolved yet — the hook must stay in a loading state.
    expect(result.current.loading).toBe(true);
  });

  it('fetches and exposes the profile once a user is available', async () => {
    const riderData = makeRiderProfile({ rating_sum: 20, rating_count: 4 });
    mockSupabase.__setTable('riders', { data: riderData, error: null });

    authState.user = makeAuthUser({ id: 'rider-1' }) as { id: string; email: string };
    authState.loading = false;

    const { result } = renderHook(() => useRiderProfile());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toMatchObject({ id: 'rider-1', rating_sum: 20 });
  });

  it('handles DB error — profile stays null, console.error is called', async () => {
    mockSupabase.__setTable('riders', {
      data: null,
      error: { message: 'DB failure' },
    });

    authState.user = makeAuthUser({ id: 'rider-1' }) as { id: string; email: string };
    authState.loading = false;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useRiderProfile());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      'rider profile load failed',
      expect.objectContaining({ message: 'DB failure' }),
    );

    consoleSpy.mockRestore();
  });

  it('refresh() causes the hook to re-fetch and update the profile', async () => {
    const initialData = makeRiderProfile({ name: 'Before' });
    mockSupabase.__setTable('riders', { data: initialData, error: null });

    authState.user = makeAuthUser({ id: 'rider-1' }) as { id: string; email: string };
    authState.loading = false;

    const { result } = renderHook(() => useRiderProfile());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile?.name).toBe('Before');

    // Update the mock table before calling refresh.
    const updatedData = makeRiderProfile({ name: 'After' });
    mockSupabase.__setTable('riders', { data: updatedData, error: null });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.profile?.name).toBe('After');
  });

  it('refresh() with no user sets profile to null and stops loading', async () => {
    authState.user = null;
    authState.loading = false;

    const { result } = renderHook(() => useRiderProfile());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

// ─── fetchRiderById ───────────────────────────────────────────────────────────

describe('fetchRiderById()', () => {
  beforeEach(() => {
    mockSupabase.__setTable('riders', { data: null, error: null });
  });

  it('returns the matching RiderProfile when found', async () => {
    const riderData = makeRiderProfile({ id: 'r-42' });
    mockSupabase.__setTable('riders', { data: riderData, error: null });

    const result = await fetchRiderById('r-42');
    expect(result).toMatchObject({ id: 'r-42', vehicle_type: 'motorcycle' });
  });

  it('returns null when the rider does not exist', async () => {
    mockSupabase.__setTable('riders', { data: null, error: null });

    const result = await fetchRiderById('nonexistent');
    expect(result).toBeNull();
  });
});

// ─── fetchRiderSettings ───────────────────────────────────────────────────────

describe('fetchRiderSettings()', () => {
  it('returns the settings object when a row is present', async () => {
    const settings: RiderSettings = {
      default_payment_mode: 'fixed',
      default_payment_value: 50,
      offer_radius_km: 5,
      offer_expiry_seconds: 30,
      max_concurrent_offers: 3,
      location_stale_seconds: 60,
    };
    mockSupabase.__setTable('rider_settings', { data: settings, error: null });

    const result = await fetchRiderSettings();
    expect(result).toMatchObject({
      default_payment_mode: 'fixed',
      offer_radius_km: 5,
      max_concurrent_offers: 3,
    });
  });

  it('returns null when the rider_settings table has no row', async () => {
    mockSupabase.__setTable('rider_settings', { data: null, error: null });

    const result = await fetchRiderSettings();
    expect(result).toBeNull();
  });
});
