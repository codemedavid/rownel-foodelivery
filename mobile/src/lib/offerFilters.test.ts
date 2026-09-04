import { isOfferLive, liveOffers, secondsRemaining } from './offerFilters';
import type { OfferWithOrder, OrderOffer } from './riderTypes';

const offer = (overrides: Partial<OrderOffer> = {}): OrderOffer => ({
  id: 'of1',
  orderId: 'o1',
  riderId: 'r1',
  status: 'pending',
  offeredAt: 0,
  expiresAt: 30_000,
  ...overrides,
});

const withOrder = (o: OrderOffer): OfferWithOrder => ({ offer: o, order: null });

describe('secondsRemaining', () => {
  it('rounds up the seconds left before expiry', () => {
    expect(secondsRemaining(offer({ expiresAt: 30_000 }), 0)).toBe(30);
    expect(secondsRemaining(offer({ expiresAt: 30_000 }), 28_500)).toBe(2);
  });

  it('never goes below zero for an expired offer', () => {
    expect(secondsRemaining(offer({ expiresAt: 1_000 }), 9_000)).toBe(0);
  });
});

describe('isOfferLive', () => {
  it('is live while pending and unexpired', () => {
    expect(isOfferLive(offer({ expiresAt: 10 }), 5)).toBe(true);
  });

  it('is dead once expired or no longer pending', () => {
    expect(isOfferLive(offer({ expiresAt: 10 }), 10)).toBe(false);
    expect(isOfferLive(offer({ status: 'rejected', expiresAt: 10 }), 5)).toBe(false);
    expect(isOfferLive(offer({ status: 'accepted', expiresAt: 10 }), 5)).toBe(false);
  });
});

describe('liveOffers', () => {
  it('drops expired offers and sorts by soonest expiry', () => {
    const list = [
      withOrder(offer({ id: 'late', expiresAt: 9_000 })),
      withOrder(offer({ id: 'gone', expiresAt: 1_000 })),
      withOrder(offer({ id: 'soon', expiresAt: 4_000 })),
    ];
    expect(liveOffers(list, 2_000).map((x) => x.offer.id)).toEqual(['soon', 'late']);
  });

  it('does not mutate the input', () => {
    const list = [withOrder(offer({ id: 'b', expiresAt: 9_000 })), withOrder(offer({ id: 'a', expiresAt: 4_000 }))];
    const copy = [...list];
    liveOffers(list, 0);
    expect(list).toEqual(copy);
  });

  it('returns an empty list when everything expired', () => {
    expect(liveOffers([withOrder(offer({ expiresAt: 1 }))], 5_000)).toEqual([]);
  });
});
