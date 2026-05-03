import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import RiderDashboard from './RiderDashboard';
import { makeRiderProfile } from '../test/mocks';

// ── convex/react ──────────────────────────────────────────────────────────────
const mockUseQuery = vi.fn();
const mockSetOnline = vi.fn();
const mockSetPermission = vi.fn();
const mockUpdateLocation = vi.fn();
const mockAcceptOffer = vi.fn();
const mockRejectOffer = vi.fn();

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: (...args: any[]) => mockUseQuery(...args),
  useMutation: (ref: any) => {
    // Return a different mock fn per mutation reference string inspection.
    // We identify by checking the ref's field name if possible, otherwise
    // return a stable no-op. The component binds each to a const name.
    return vi.fn().mockImplementation((...a: any[]) => {
      // Just return a resolved promise for all mutations by default.
      return Promise.resolve();
    });
  },
}));

// ── AuthContext ───────────────────────────────────────────────────────────────
const mockSignOut = vi.fn(() => Promise.resolve());
const mockUseAuth = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// ── useRiderProfile ───────────────────────────────────────────────────────────
const mockUseRiderProfile = vi.fn();

vi.mock('../hooks/useRiderProfile', () => ({
  useRiderProfile: () => mockUseRiderProfile(),
  ratingAverage: (p: any) => (p?.rating_count > 0 ? p.rating_sum / p.rating_count : null),
}));

// ── useRiderLocation ──────────────────────────────────────────────────────────
// We mock the whole hook so tests can control permission/coords/stale state.
const mockUseRiderLocation = vi.fn();

vi.mock('../hooks/useRiderLocation', () => ({
  useRiderLocation: (...args: any[]) => mockUseRiderLocation(...args),
}));

// ── react-router-dom ──────────────────────────────────────────────────────────
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Default return values ─────────────────────────────────────────────────────
// RiderDashboard calls useQuery 3 times in this order:
//   1. api.riders.myPresence
//   2. api.offers.listMyOffers
//   3. api.riders.myActiveOrders
// We use mockImplementation with a counter so ordering is predictable across
// re-renders (React may call hooks multiple times per render cycle).
function setupDefaults(overrides: {
  presence?: any;
  offers?: any[];
  activeOrders?: any[];
  profile?: any;
  location?: any;
} = {}) {
  const profile = overrides.profile ?? makeRiderProfile();
  const presence = 'presence' in overrides ? overrides.presence : undefined;
  const offers = overrides.offers ?? [];
  const activeOrders = overrides.activeOrders ?? [];

  mockUseAuth.mockReturnValue({ signOut: mockSignOut });
  mockUseRiderProfile.mockReturnValue({ profile });

  // Track call count so each successive useQuery call gets the right data.
  let callCount = 0;
  mockUseQuery.mockImplementation(() => {
    const idx = callCount++ % 3;
    if (idx === 0) return presence;
    if (idx === 1) return offers;
    return activeOrders;
  });

  mockUseRiderLocation.mockReturnValue(
    overrides.location ?? {
      permission: 'granted',
      coords: { latitude: 14.5995, longitude: 120.9842 },
      lastUpdate: Date.now(),
      error: null,
    }
  );
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <RiderDashboard />
    </MemoryRouter>
  );
}

describe('RiderDashboard', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue(undefined);
  });

  it('renders the rider name and plate number in the header', () => {
    setupDefaults();
    renderDashboard();
    expect(screen.getByText('Test Rider')).toBeInTheDocument();
    expect(screen.getByText(/ABC123/)).toBeInTheDocument();
  });

  it('shows the "Enable location" button when permission is unknown', () => {
    setupDefaults({
      location: { permission: 'unknown', coords: null, lastUpdate: null, error: null },
    });
    renderDashboard();
    expect(screen.getByRole('button', { name: /enable location/i })).toBeInTheDocument();
  });

  it('shows the location-blocked message when permission is denied', () => {
    setupDefaults({
      location: { permission: 'denied', coords: null, lastUpdate: null, error: null },
    });
    renderDashboard();
    expect(screen.getByText(/location blocked/i)).toBeInTheDocument();
  });

  it('shows "Go online" button when rider has GPS fix and is offline', () => {
    setupDefaults({
      // presence=undefined → isOnline=false; lastUpdate=now → not stale
      location: {
        permission: 'granted',
        coords: { latitude: 14.5995, longitude: 120.9842 },
        lastUpdate: Date.now(),
        error: null,
      },
    });
    renderDashboard();
    expect(screen.getByRole('button', { name: /go online/i })).toBeInTheDocument();
  });

  it('shows "Go offline" button when rider is online (presence=available)', async () => {
    // presence=available means isOnline=true
    setupDefaults({
      presence: { status: 'available' },
      location: {
        permission: 'granted',
        coords: { latitude: 14.5995, longitude: 120.9842 },
        lastUpdate: Date.now(),
        error: null,
      },
    });
    renderDashboard();
    expect(await screen.findByRole('button', { name: /go offline/i })).toBeInTheDocument();
  });

  it('shows "No active deliveries" when there are no active orders', () => {
    setupDefaults({ activeOrders: [] });
    renderDashboard();
    expect(screen.getByText(/no active deliveries/i)).toBeInTheDocument();
  });

  it('renders an active order card when orders are present', () => {
    setupDefaults({
      activeOrders: [
        {
          _id: 'order-1',
          customerName: 'Juan dela Cruz',
          address: '123 Main St',
          contactNumber: '+63917',
          status: 'ready',
        },
      ],
    });
    renderDashboard();
    expect(screen.getByText('Juan dela Cruz')).toBeInTheDocument();
  });

  it('calls signOut and navigates to /rider/login on sign-out click', async () => {
    setupDefaults();
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/rider/login'));
  });

  it('shows "No ratings yet" for a rider with zero ratings', () => {
    setupDefaults({ profile: makeRiderProfile({ rating_count: 0 }) });
    renderDashboard();
    expect(screen.getByText(/no ratings yet/i)).toBeInTheDocument();
  });

  it('shows star rating for a rider that has ratings', () => {
    setupDefaults({
      profile: makeRiderProfile({ rating_sum: 45, rating_count: 10 }),
    });
    renderDashboard();
    // avg = 4.5 → displayed as "★ 4.5 (10)"
    expect(screen.getByText(/★\s*4\.5/)).toBeInTheDocument();
  });

  it('shows "Batched (2)" badge when rider has more than one active order', () => {
    const now = Date.now();
    setupDefaults({
      activeOrders: [
        { _id: 'order-1', customerName: 'Juan dela Cruz', address: '123 Main St', contactNumber: '+63917', status: 'ready', riderAssignedAt: now - 120_000 },
        { _id: 'order-2', customerName: 'Maria Santos', address: '456 Oak Ave', contactNumber: '+63918', status: 'ready', riderAssignedAt: now - 60_000 },
      ],
    });
    renderDashboard();
    expect(screen.getByText(/batched.*2/i)).toBeInTheDocument();
  });

  it('does not show "Batched" badge for a single active order', () => {
    setupDefaults({
      activeOrders: [
        { _id: 'order-1', customerName: 'Juan dela Cruz', address: '123 Main St', contactNumber: '+63917', status: 'ready', riderAssignedAt: Date.now() },
      ],
    });
    renderDashboard();
    expect(screen.queryByText(/batched/i)).not.toBeInTheDocument();
  });

  it('renders active orders sorted by riderAssignedAt ASC (oldest first)', () => {
    const now = Date.now();
    setupDefaults({
      // Pass newer order first in the array — component should sort it after the older one
      activeOrders: [
        { _id: 'order-newer', customerName: 'Maria Santos', address: '456 Oak', contactNumber: '+63918', status: 'ready', riderAssignedAt: now - 30_000 },
        { _id: 'order-older', customerName: 'Juan dela Cruz', address: '123 Main', contactNumber: '+63917', status: 'ready', riderAssignedAt: now - 120_000 },
      ],
    });
    renderDashboard();
    const cards = screen.getAllByRole('link');
    // Both order cards are links; the older order should appear first in the DOM
    const juanIdx = cards.findIndex((el) => el.textContent?.includes('Juan dela Cruz'));
    const mariaIdx = cards.findIndex((el) => el.textContent?.includes('Maria Santos'));
    expect(juanIdx).toBeLessThan(mariaIdx);
  });

  it('shows RUSH badge on a priority offer card', () => {
    setupDefaults({
      offers: [
        {
          offer: { _id: 'offer-1', expiresAt: Date.now() + 30_000, distanceKm: 1.2 },
          order: {
            _id: 'order-1',
            customerName: 'Rush Customer',
            address: '789 Express Way',
            deliveryFee: 80,
            deliveryMode: 'priority',
          },
        },
      ],
    });
    renderDashboard();
    expect(screen.getByText('RUSH')).toBeInTheDocument();
  });
});
