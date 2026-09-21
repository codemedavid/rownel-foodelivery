import React from 'react';
import type { MerchantWithDistance } from '../../utils/merchantDistance';
import { isMerchantOpen } from '../../lib/timeUtils';
import { supportsPasabay } from '../../lib/services';
import OptimizedImage from '../OptimizedImage';
import { RatingBadge, MetaChip, formatDistance } from '../ui';

const MERCHANT_COVER_WIDTH = 600;
const LOGO_WIDTH = 120;
const DEFAULT_ETA = '25–40 min';

const ClosedBadge: React.FC = () => (
  <span className="absolute left-2 top-2 rounded-full bg-gray-900/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
    Closed
  </span>
);

const PasabayTag: React.FC = () => (
  <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">Pasabay</span>
);

const CoverImage: React.FC<{ merchant: MerchantWithDistance; className: string }> = ({ merchant, className }) => {
  const src = merchant.coverImageUrl || merchant.logoUrl;
  return src ? (
    <OptimizedImage src={src} alt={merchant.name} width={MERCHANT_COVER_WIDTH} className={className} />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-brand-50 text-3xl">🍽️</div>
  );
};

/** Wide card used in horizontal carousels (Grab "near you" style). */
export const MerchantCarouselCard: React.FC<{ merchant: MerchantWithDistance; onSelect: (id: string) => void }> = ({
  merchant,
  onSelect,
}) => {
  const openStatus = isMerchantOpen(merchant.openingHours);
  return (
    <button
      type="button"
      onClick={() => onSelect(merchant.id)}
      className={`w-60 flex-shrink-0 snap-start overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-sm transition-shadow hover:shadow-md ${
        openStatus.isOpen ? '' : 'opacity-60'
      }`}
    >
      <div className="relative h-32 bg-gray-100">
        <CoverImage merchant={merchant} className="h-full w-full object-cover" />
        {!openStatus.isOpen && <ClosedBadge />}
        <span className="absolute bottom-2 right-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-gray-800 shadow-sm">
          {merchant.estimatedDeliveryTime || DEFAULT_ETA}
        </span>
      </div>
      <div className="p-3">
        <h3 className="truncate text-sm font-bold text-gray-900">{merchant.name}</h3>
        <p className="truncate text-xs text-gray-500">{merchant.cuisineType || merchant.description || 'Restaurant'}</p>
        <div className="mt-2 flex items-center justify-between">
          <RatingBadge rating={merchant.rating} />
          <MetaChip icon="distance">{formatDistance(merchant.distanceKm)}</MetaChip>
        </div>
      </div>
    </button>
  );
};

/** Full-width list row (Grab "all restaurants" style). */
export const MerchantListRow: React.FC<{
  merchant: MerchantWithDistance;
  onSelect: (id: string) => void;
  matchedDishes?: string[];
}> = ({ merchant, onSelect, matchedDishes }) => {
  const openStatus = isMerchantOpen(merchant.openingHours);
  return (
    <button
      type="button"
      onClick={() => onSelect(merchant.id)}
      className={`flex w-full gap-3 rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md ${
        openStatus.isOpen ? '' : 'opacity-60'
      }`}
    >
      <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
        <CoverImage merchant={merchant} className="h-full w-full object-cover" />
        {!openStatus.isOpen && <ClosedBadge />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-base font-bold text-gray-900">{merchant.name}</h3>
          {supportsPasabay(merchant) && <PasabayTag />}
        </div>
        <p className="truncate text-xs text-gray-500">{merchant.cuisineType || merchant.description || 'Restaurant'}</p>
        {matchedDishes && matchedDishes.length > 0 && (
          <p className="mt-1 truncate text-xs text-brand-700">Has {matchedDishes.join(', ')}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <RatingBadge rating={merchant.rating} reviews={merchant.totalReviews} />
          <MetaChip icon="distance">{formatDistance(merchant.distanceKm)}</MetaChip>
          <MetaChip icon="time">{merchant.estimatedDeliveryTime || DEFAULT_ETA}</MetaChip>
        </div>
        {!openStatus.isOpen && openStatus.nextOpenTime && (
          <p className="mt-1 text-[11px] font-medium text-red-600">{openStatus.nextOpenTime}</p>
        )}
      </div>
    </button>
  );
};

/** Small square logo tile (Grab "popular" style). */
export const MerchantLogoTile: React.FC<{ merchant: MerchantWithDistance; onSelect: (id: string) => void }> = ({
  merchant,
  onSelect,
}) => {
  const openStatus = isMerchantOpen(merchant.openingHours);
  return (
    <button
      type="button"
      onClick={() => onSelect(merchant.id)}
      className={`flex w-20 flex-shrink-0 snap-start flex-col items-center gap-1.5 text-center ${openStatus.isOpen ? '' : 'opacity-60'}`}
    >
      <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm">
        {merchant.logoUrl ? (
          <OptimizedImage src={merchant.logoUrl} alt={merchant.name} width={LOGO_WIDTH} className="h-full w-full rounded-xl object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-xl bg-brand-50 text-2xl">🍽️</div>
        )}
      </div>
      <span className="line-clamp-2 w-full text-[11px] font-semibold leading-tight text-gray-800">{merchant.name}</span>
    </button>
  );
};
