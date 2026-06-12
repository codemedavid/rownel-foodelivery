import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import CustomerRiderPanel from './CustomerRiderPanel';
import { makeRiderProfile } from '../test/mocks';

// ── deliveryApi (replaces the old convex/react useQuery/useMutation mocks) ────
const mockGetPresenceById = vi.fn();
const mockListAvailableLocations = vi.fn();
const mockListByOrder = vi.fn();
const mockGetForOrder = vi.fn();
const mockSubmitRating = vi.fn();

vi.mock('../lib/deliveryApi', () => ({
  ridersApi: {
    getPresenceById: (...args: any[]) => mockGetPresenceById(...args),
    listAvailableLocations: (...args: any[]) => mockListAvailableLocations(...args),
  },
  messagesApi: {
    listByOrder: (...args: any[]) => mockListByOrder(...args),
  },
  ratingsApi: {
    getForOrder: (...args: any[]) => mockGetForOrder(...args),
    submit: (...args: any[]) => mockSubmitRating(...args),
  },
}));

// ── useRiderProfile (fetchRiderById) ──────────────────────────────────────────
const mockFetchRiderById = vi.fn();

vi.mock('../hooks/useRiderProfile', () => ({
  fetchRiderById: (...args: any[]) => mockFetchRiderById(...args),
  ratingAverage: (p: any) => (p?.rating_count > 0 ? p.rating_sum / p.rating_count : null),
}));

// ── supabase (used inside RatingPrompt and useLiveQuery) ──────────────────────
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(() => Promise.resolve({ error: null })),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
      update: vi.fn().mockReturnThis(),
    })),
  },
}));

// ── OrderChat (renders inside CustomerRiderPanel) ─────────────────────────────
// Stub it out so we don't have to mock the full chat message query.
vi.mock('./OrderChat', () => ({
  default: () => <div data-testid="order-chat">Chat stub</div>,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
type PanelProps = React.ComponentProps<typeof CustomerRiderPanel>;

function defaultProps(overrides: Partial<PanelProps> = {}): PanelProps {
  return {
    orderId: 'order-1',
    assignedRiderId: 'rider-1',
    orderStatus: 'out_for_delivery',
    contactNumber: '+639170000000',
    ...overrides,
  };
}

function renderPanel(props: Partial<PanelProps> = {}) {
  return render(
    <MemoryRouter>
      <CustomerRiderPanel {...defaultProps(props)} />
    </MemoryRouter>
  );
}

// CustomerRiderPanel reads two key queries through useLiveQuery:
//   1. ridersApi.getPresenceById   (skipped when no assignedRiderId)
//   2. ratingsApi.getForOrder
// Helper to configure both in one place.
function setupQuery(presence: any, existingRating: any) {
  mockGetPresenceById.mockResolvedValue(presence ?? null);
  mockGetForOrder.mockResolvedValue(existingRating ?? null);
}

describe('CustomerRiderPanel', () => {
  beforeEach(() => {
    mockGetPresenceById.mockReset();
    mockListAvailableLocations.mockReset();
    mockListByOrder.mockReset();
    mockGetForOrder.mockReset();
    mockSubmitRating.mockReset();
    mockFetchRiderById.mockReset();

    mockListAvailableLocations.mockResolvedValue([]);
    mockListByOrder.mockResolvedValue([]);
    mockSubmitRating.mockResolvedValue(undefined);

    // Default: no presence, no existing rating.
    setupQuery(undefined, undefined);
  });

  it('renders nothing when assignedRiderId is undefined and status is not a pre-assignment status', async () => {
    // 'cancelled' is outside PRE_ASSIGN_STATUSES (pending/confirmed/preparing/ready),
    // so with no rider assigned the panel should render nothing at all.
    mockFetchRiderById.mockResolvedValue(null);
    const { container } = renderPanel({ assignedRiderId: undefined, orderStatus: 'cancelled' });
    await waitFor(() => {}); // let effects settle
    expect(container.firstChild).toBeNull();
  });

  it('shows the "Finding your rider" state when status is ready and no riderId', async () => {
    mockFetchRiderById.mockResolvedValue(null);
    renderPanel({ assignedRiderId: undefined, orderStatus: 'ready' });
    expect(await screen.findByText(/finding your rider/i)).toBeInTheDocument();
  });

  it('renders rider name and plate when fetchRiderById resolves a profile', async () => {
    const profile = makeRiderProfile({
      name: 'Maria Santos',
      plate_number: 'XYZ-789',
      phone: '+639170000001',
      vehicle_type: 'motorcycle',
    });
    mockFetchRiderById.mockResolvedValue(profile);
    mockGetPresenceById.mockResolvedValue(null); // presence unknown

    renderPanel();

    expect(await screen.findByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText(/XYZ-789/)).toBeInTheDocument();
  });

  it('shows the phone call link with the correct href', async () => {
    const profile = makeRiderProfile({ phone: '+639171234567' });
    mockFetchRiderById.mockResolvedValue(profile);

    renderPanel();

    const callLink = await screen.findByRole('link', { name: /call/i });
    expect(callLink).toHaveAttribute('href', 'tel:+639171234567');
  });

  it('shows online indicator when presence status is "available"', async () => {
    const profile = makeRiderProfile({ name: 'Online Rider' });
    mockFetchRiderById.mockResolvedValue(profile);
    setupQuery({ status: 'available' }, undefined);

    renderPanel();

    await screen.findByText('Online Rider');
    // The header shows an "Online" label next to a green dot (bg-green-400 span).
    // Presence resolves asynchronously through useLiveQuery, so wait for it.
    expect(await screen.findByText('Online')).toBeInTheDocument();
    const dot = document.querySelector('.bg-green-400');
    expect(dot).toBeInTheDocument();
  });

  it('shows the Chat button and opens chat on click', async () => {
    const profile = makeRiderProfile();
    mockFetchRiderById.mockResolvedValue(profile);

    const user = userEvent.setup();
    renderPanel();

    const chatBtn = await screen.findByRole('button', { name: /^chat$/i });
    expect(chatBtn).toBeInTheDocument();

    await user.click(chatBtn);
    expect(screen.getByTestId('order-chat')).toBeInTheDocument();

    // Clicking again closes the chat (the toggle button now reads "Close")
    await user.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.queryByTestId('order-chat')).not.toBeInTheDocument();
  });

  it('shows the rating prompt when order is completed and no existing rating', async () => {
    const profile = makeRiderProfile();
    mockFetchRiderById.mockResolvedValue(profile);
    setupQuery(undefined, null); // null → no existing rating

    renderPanel({ orderStatus: 'completed' });

    expect(await screen.findByText(/how was your delivery/i)).toBeInTheDocument();
  });

  it('does NOT show the rating prompt when a rating already exists', async () => {
    const profile = makeRiderProfile();
    mockFetchRiderById.mockResolvedValue(profile);
    setupQuery(undefined, { rating: 5, comment: 'Great!' });

    renderPanel({ orderStatus: 'completed' });

    await screen.findByText(profile.name); // wait for profile render
    expect(screen.queryByText(/how was your delivery/i)).not.toBeInTheDocument();
  });

  it('displays average star rating when rider has ratings', async () => {
    // rating_sum=40, rating_count=8 → avg=5.0
    const profile = makeRiderProfile({ rating_sum: 40, rating_count: 8 });
    mockFetchRiderById.mockResolvedValue(profile);

    renderPanel();

    await screen.findByText(profile.name);
    // Average renders as a Star icon followed by "5.0" and the count "(8)"
    expect(screen.getByText('5.0')).toBeInTheDocument();
    expect(screen.getByText('(8)')).toBeInTheDocument();
  });
});
