import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import RiderDashboard from './RiderDashboard';
import { makeRiderProfile } from '../test/mocks';

// ── lib/deliveryApi ───────────────────────────────────────────────────────────
// Query functions return plain (non-promise) values so the useLiveQuery mock
// below can surface them synchronously. Mutations resolve like the real RPCs.
const mockMyPresence = vi.fn();
const mockListMyOffers = vi.fn();
const mockMyActiveOrders = vi.fn();
const mockUnreadCount = vi.fn();
const mockListByOrder = vi.fn();
const mockSetOnline = vi.fn();
const mockSetPermission = vi.fn();
const mockUpdateLocation = vi.fn();
const mockAcceptOffer = vi.fn();
const mockRejectOffer = vi.fn();
const mockMarkPickedUp = vi.fn();
const mockMarkDelivered = vi.fn();
const mockEarningsSummary = vi.fn();
const mockMyPayouts = vi.fn();
const mockRecentDeliveries = vi.fn();

vi.mock('../lib/deliveryApi', () => ({
  ridersApi: {
    myPresence: (...a: any[]) => mockMyPresence(...a),
    myActiveOrders: (...a: any[]) => mockMyActiveOrders(...a),
    setOnline: (...a: any[]) => mockSetOnline(...a),
    setLocationPermission: (...a: any[]) => mockSetPermission(...a),
    updateLocation: (...a: any[]) => mockUpdateLocation(...a),
  },
  offersApi: {
    listMyOffers: (...a: any[]) => mockListMyOffers(...a),
    accept: (...a: any[]) => mockAcceptOffer(...a),
    reject: (...a: any[]) => mockRejectOffer(...a),
  },
  ordersApi: {
    markPickedUp: (...a: any[]) => mockMarkPickedUp(...a),
    markDelivered: (...a: any[]) => mockMarkDelivered(...a),
  },
  messagesApi: {
    unreadCountForRider: (...a: any[]) => mockUnreadCount(...a),
    listByOrder: (...a: any[]) => mockListByOrder(...a),
    send: vi.fn(() => Promise.resolve()),
    markRead: vi.fn(() => Promise.resolve()),
  },
  earningsApi: {
    myEarningsSummary: (...a: any[]) => mockEarningsSummary(...a),
    myPayouts: (...a: any[]) => mockMyPayouts(...a),
    myRecentDeliveries: (...a: any[]) => mockRecentDeliveries(...a),
  },
}));

// ── useLiveQuery ──────────────────────────────────────────────────────────────
// Synchronous stand-in: runs the fetcher immediately (the deliveryApi mocks
// above return plain values) so components render data on first paint.
vi.mock('../hooks/useLiveQuery', () => ({
  useLiveQuery: (fetcher: () => unknown, _deps: unknown[], options: { enabled?: boolean } = {}) => {
    if (options.enabled === false) {
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    }
    let data: unknown = null;
    try {
      data = fetcher();
    } catch {
      data = null;
    }
    if (data && typeof (data as { then?: unknown }).then === 'function') data = null;
    return { data, loading: false, error: null, refetch: vi.fn(() => Promise.resolve()) };
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
function setupDefaults(overrides: {
  presence?: any;
  offers?: any[];
  activeOrders?: any[];
  profile?: any;
  location?: any;
} = {}) {
  const profile = overrides.profile ?? makeRiderProfile();
  const presence = 'presence' in overrides ? overrides.presence : null;
  const offers = overrides.offers ?? [];
  const activeOrders = overrides.activeOrders ?? [];

  mockUseAuth.mockReturnValue({
    user: { id: 'rider-1', email: 'rider@example.com' },
    session: { access_token: 'token' },
    loading: false,
    signOut: mockSignOut,
  });
  mockUseRiderProfile.mockReturnValue({ profile, updateProfile: vi.fn() });

  mockMyPresence.mockReturnValue(presence);
  mockListMyOffers.mockReturnValue(offers);
  mockMyActiveOrders.mockReturnValue(activeOrders);
  mockUnreadCount.mockReturnValue(0);
  mockListByOrder.mockReturnValue([]);
  mockEarningsSummary.mockReturnValue(null);
  mockMyPayouts.mockReturnValue([]);
  mockRecentDeliveries.mockReturnValue([]);

  mockSetOnline.mockResolvedValue(undefined);
  mockSetPermission.mockResolvedValue(undefined);
  mockUpdateLocation.mockResolvedValue(undefined);
  mockAcceptOffer.mockResolvedValue('order-1');
  mockRejectOffer.mockResolvedValue(undefined);
  mockMarkPickedUp.mockResolvedValue(undefined);
  mockMarkDelivered.mockResolvedValue(undefined);

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
    vi.clearAllMocks();
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
      // presence=null → isOnline=false; lastUpdate=now → not stale
      location: {
        permission: 'granted',
        coords: { latitude: 14.5995, longitude: 120.9842 },
        lastUpdate: Date.now(),
        error: null,
      },
    });
    renderDashboard();
    expect(screen.getAllByRole('button', { name: /go online/i }).length).toBeGreaterThan(0);
  });

  it('shows "Go offline" button when rider is online (presence=available)', async () => {
    // presence=available means isOnline=true
    setupDefaults({
      presence: { riderId: 'rider-1', status: 'available' },
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
          id: 'order-1',
          customerName: 'Juan dela Cruz',
          address: '123 Main St',
          contactNumber: '+63917',
          status: 'ready',
          order_items: [],
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

    // Sign Out lives on the Profile tab.
    await user.click(screen.getByRole('button', { name: /profile/i }));
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/rider/login'));
  });

  it('does not show a star rating for a rider with zero ratings', () => {
    setupDefaults({ profile: makeRiderProfile({ rating_sum: 0, rating_count: 0 }) });
    renderDashboard();
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
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
        { id: 'order-1', customerName: 'Juan dela Cruz', address: '123 Main St', contactNumber: '+63917', status: 'ready', riderAssignedAt: now - 120_000, order_items: [] },
        { id: 'order-2', customerName: 'Maria Santos', address: '456 Oak Ave', contactNumber: '+63918', status: 'ready', riderAssignedAt: now - 60_000, order_items: [] },
      ],
    });
    renderDashboard();
    expect(screen.getByText(/batched.*2/i)).toBeInTheDocument();
  });

  it('does not show "Batched" badge for a single active order', () => {
    setupDefaults({
      activeOrders: [
        { id: 'order-1', customerName: 'Juan dela Cruz', address: '123 Main St', contactNumber: '+63917', status: 'ready', riderAssignedAt: Date.now(), order_items: [] },
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
        { id: 'order-newer', customerName: 'Maria Santos', address: '456 Oak', contactNumber: '+63918', status: 'ready', riderAssignedAt: now - 30_000, order_items: [] },
        { id: 'order-older', customerName: 'Juan dela Cruz', address: '123 Main', contactNumber: '+63917', status: 'ready', riderAssignedAt: now - 120_000, order_items: [] },
      ],
    });
    renderDashboard();
    const cards = screen.getAllByText(/dela Cruz|Santos/).map((el) => el.textContent ?? '');
    // The older order (Juan) should appear before the newer one (Maria) in the DOM
    const juanIdx = cards.findIndex((t) => t.includes('Juan dela Cruz'));
    const mariaIdx = cards.findIndex((t) => t.includes('Maria Santos'));
    expect(juanIdx).toBeLessThan(mariaIdx);
  });

  it('shows RUSH badge on a priority offer card', () => {
    setupDefaults({
      // Offers are only fetched while the rider is online.
      presence: { riderId: 'rider-1', status: 'available' },
      offers: [
        {
          offer: { id: 'offer-1', orderId: 'order-1', riderId: 'rider-1', status: 'pending', offeredAt: Date.now(), expiresAt: Date.now() + 30_000, distanceKm: 1.2 },
          order: {
            id: 'order-1',
            customerName: 'Rush Customer',
            address: '789 Express Way',
            deliveryFee: 80,
            deliveryMode: 'priority',
            order_items: [],
          },
        },
      ],
    });
    renderDashboard();
    expect(screen.getByText(/rush order/i)).toBeInTheDocument();
  });
});
