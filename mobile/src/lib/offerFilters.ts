// Pure offer-list logic. Offers expire in ~30s server-side, so the UI ticks
// locally and re-derives the visible list rather than waiting for a poll.

import type { OfferWithOrder, OrderOffer } from './riderTypes';

const MS_PER_SECOND = 1000;

/** Whole seconds left before an offer expires; never negative. */
export const secondsRemaining = (offer: OrderOffer, now: number): number =>
  Math.max(0, Math.ceil((offer.expiresAt - now) / MS_PER_SECOND));

export const isOfferLive = (offer: OrderOffer, now: number): boolean =>
  offer.status === 'pending' && offer.expiresAt > now;

/** Live offers only, soonest to expire first. Never mutates the input. */
export const liveOffers = (offers: readonly OfferWithOrder[], now: number): OfferWithOrder[] =>
  offers
    .filter(({ offer }) => isOfferLive(offer, now))
    .slice()
    .sort((a, b) => a.offer.expiresAt - b.offer.expiresAt);
