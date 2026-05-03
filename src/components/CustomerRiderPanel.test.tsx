import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import CustomerRiderPanel from './CustomerRiderPanel';
import { makeRiderProfile } from '../test/mocks';
import type { Id } from '../../convex/_generated/dataModel';

// ── convex/react ──────────────────────────────────────────────────────────────
const mockUseQuery = vi.fn();

vi.mock('convex/react', () => ({
  useQuery: (...args: any[]) => mockUseQuery(...args),
  useMutation: () => vi.fn().mockResolvedValue(undefined),
}));

// ── useRiderProfile (fetchRiderById) ──────────────────────────────────────────
const mockFetchRiderById = vi.fn();

vi.mock('../hooks/useRiderProfile', () => ({
  fetchRiderById: (...args: any[]) => mockFetchRiderById(...args),
  ratingAverage: (p: any) => (p?.rating_count > 0 ? p.rating_sum / p.rating_count : null),
}));

// ── supabase (used inside RatingPrompt) ───────────────────────────────────────
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
    orderId: 'order-1' as Id<'orders'>,
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

// CustomerRiderPanel calls useQuery twice:
//   1. api.riders.getPresenceById  (or skipped when no assignedRiderId)
//   2. api.ratings.getForOrder
// Helper to configure both in one place.
function setupQuery(presence: any, existingRating: any) {
  let callCount = 0;
  mockUseQuery.mockImplementation(() => {
    const idx = callCount++ % 2;
    return idx === 0 ? presence : existingRating;
  });
}

describe('CustomerRiderPanel', () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockFetchRiderById.mockReset();

    // Default: no presence, no existing rating.
    setupQuery(undefined, undefined);
  });

  it('renders nothing when assignedRiderId is undefined and status is not "ready"', async () => {
    mockFetchRiderById.mockResolvedValue(null);
    const { container } = renderPanel({ assignedRiderId: undefined, orderStatus: 'pending' });
    await waitFor(() => {}); // let effects settle
    expect(container.firstChild).toBeNull();
  });

  it('shows "Looking for a nearby rider" when status is ready and no riderId', async () => {
    mockFetchRiderById.mockResolvedValue(null);
    renderPanel({ assignedRiderId: undefined, orderStatus: 'ready' });
    expect(await screen.findByText(/looking for a nearby rider/i)).toBeInTheDocument();
  });

  it('renders rider name and plate when fetchRiderById resolves a profile', async () => {
    const profile = makeRiderProfile({
      name: 'Maria Santos',
      plate_number: 'XYZ-789',
      phone: '+639170000001',
      vehicle_type: 'motorcycle',
    });
    mockFetchRiderById.mockResolvedValue(profile);
    mockUseQuery.mockReturnValue(undefined); // presence = undefined

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
    // The green dot is a <span> with bg-green-500 - verify via DOM
    const dot = document.querySelector('.bg-green-500');
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

    // Clicking again closes the chat
    await user.click(screen.getByRole('button', { name: /close chat/i }));
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
    expect(screen.getByText(/★\s*5\.0/)).toBeInTheDocument();
  });
});
