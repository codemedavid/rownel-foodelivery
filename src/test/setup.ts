import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// jsdom doesn't ship geolocation — provide a controllable mock.
const geolocationMock = {
  getCurrentPosition: vi.fn(),
  watchPosition: vi.fn(() => 1),
  clearWatch: vi.fn(),
};
Object.defineProperty(globalThis.navigator, 'geolocation', {
  value: geolocationMock,
  configurable: true,
});

// Quiet import.meta.env for modules that read VITE_* at import time.
if (!('VITE_SUPABASE_URL' in import.meta.env)) {
  (import.meta.env as any).VITE_SUPABASE_URL = 'http://localhost:54321';
  (import.meta.env as any).VITE_SUPABASE_ANON_KEY = 'test-anon-key';
}
