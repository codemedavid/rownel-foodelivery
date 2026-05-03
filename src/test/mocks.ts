import { vi } from 'vitest';

export type MockSupabaseRow = Record<string, unknown> | null;

interface MockTableState {
  data: MockSupabaseRow | MockSupabaseRow[];
  error: { message: string } | null;
}

export interface MockSupabase {
  from: ReturnType<typeof vi.fn>;
  __setTable: (table: string, state: MockTableState) => void;
}

// Lightweight Supabase client mock that supports the chained query pattern
// .from(t).select(...).eq(...).maybeSingle() / .single() used in this codebase.
export function createMockSupabase(): MockSupabase {
  const tables: Record<string, MockTableState> = {};

  const builder = (table: string) => {
    const state = tables[table] ?? { data: null, error: null };
    const chain: any = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
      delete: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => state),
      single: vi.fn(async () => state),
      then: (resolve: (v: MockTableState) => unknown) => Promise.resolve(state).then(resolve),
    };
    return chain;
  };

  return {
    from: vi.fn(builder),
    __setTable(table, state) {
      tables[table] = state;
    },
  };
}

export function makeRiderProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rider-1',
    name: 'Test Rider',
    phone: '+639170000000',
    plate_number: 'ABC123',
    vehicle_type: 'motorcycle',
    photo_url: null,
    is_approved: true,
    is_active: true,
    rating_sum: 0,
    rating_count: 0,
    payment_mode: null,
    payment_value: null,
    ...overrides,
  };
}

export function makeAuthUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rider-1',
    email: 'rider@example.com',
    app_metadata: { role: 'rider' },
    user_metadata: { name: 'Test Rider' },
    ...overrides,
  };
}
