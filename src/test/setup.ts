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

if (!('VITE_MAPBOX_TOKEN' in import.meta.env)) {
  (import.meta.env as any).VITE_MAPBOX_TOKEN = 'pk.test-mapbox-token';
}

// mapbox-gl renders through WebGL, which jsdom does not implement. Components
// that embed a map are stubbed here so their surrounding UI stays testable.
vi.mock('react-map-gl/mapbox', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => children ?? null;
  return {
    __esModule: true,
    default: Passthrough,
    Map: Passthrough,
    Marker: Passthrough,
    Source: Passthrough,
    Layer: () => null,
    NavigationControl: () => null,
    Popup: Passthrough,
  };
});
