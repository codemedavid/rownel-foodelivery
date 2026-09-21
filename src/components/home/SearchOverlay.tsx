import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock, Search, X, TrendingUp } from 'lucide-react';
import type { MenuItem } from '../../types';
import type { MerchantWithDistance } from '../../utils/merchantDistance';
import { buildDishIndex, searchDishes, searchMerchants, suggestMerchants } from '../../lib/search';
import { clearRecentSearches, readRecentSearches, rememberSearch } from '../../lib/recentSearches';
import { isMerchantOpen } from '../../lib/timeUtils';
import OptimizedImage from '../OptimizedImage';
import { MerchantListRow } from './MerchantCards';
import { EmptyState, formatPeso, formatDistance } from '../ui';

const THUMBNAIL_WIDTH = 160;
const MAX_DISH_RESULTS = 20;
const MAX_MERCHANT_RESULTS = 10;
const MAX_TRENDING = 8;

interface SearchOverlayProps {
  open: boolean;
  initialQuery?: string;
  merchants: MerchantWithDistance[];
  menuItems: MenuItem[];
  onClose: () => void;
  onSelectMerchant: (merchantId: string) => void;
  onSelectDish: (merchantId: string, itemId: string) => void;
}

type DishHit = MenuItem & { merchant: MerchantWithDistance };

const titleCase = (value: string) =>
  value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/**
 * Full-screen search (Grab style): recent searches and trending categories
 * while idle; ranked dish + merchant results as you type, with "did you mean"
 * suggestions instead of a dead end.
 */
const SearchOverlay: React.FC<SearchOverlayProps> = ({
  open,
  initialQuery = '',
  merchants,
  menuItems,
  onClose,
  onSelectMerchant,
  onSelectDish,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [recent, setRecent] = useState<string[]>(readRecentSearches);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setRecent(readRecentSearches());
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open, initialQuery]);

  const merchantById = useMemo(() => new Map(merchants.map((m) => [m.id, m])), [merchants]);
  const merchantNameById = useMemo(() => new Map(merchants.map((m) => [m.id, m.name])), [merchants]);

  const availableDishes = useMemo(
    () => menuItems.filter((item) => item.available !== false && merchantById.has(item.merchantId)),
    [menuItems, merchantById]
  );
  const dishIndex = useMemo(() => buildDishIndex(availableDishes), [availableDishes]);

  const trimmed = query.trim();

  const dishResults = useMemo<DishHit[]>(() => {
    if (!trimmed) return [];
    return searchDishes(availableDishes, trimmed, merchantNameById)
      .slice(0, MAX_DISH_RESULTS)
      .map(({ dish }) => ({ ...dish, merchant: merchantById.get(dish.merchantId) as MerchantWithDistance }));
  }, [availableDishes, trimmed, merchantNameById, merchantById]);

  const merchantResults = useMemo(
    () => (trimmed ? searchMerchants(merchants, trimmed, dishIndex).slice(0, MAX_MERCHANT_RESULTS) : []),
    [merchants, trimmed, dishIndex]
  );

  const suggestions = useMemo(
    () => (trimmed && dishResults.length === 0 && merchantResults.length === 0 ? suggestMerchants(merchants, trimmed, 3, dishIndex) : []),
    [trimmed, dishResults.length, merchantResults.length, merchants, dishIndex]
  );

  const trending = useMemo(() => {
    const counts = new Map<string, number>();
    availableDishes.forEach((item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1));
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TRENDING)
      .map(([id]) => titleCase(id));
  }, [availableDishes]);

  if (!open) return null;

  const commit = (value: string) => setRecent(rememberSearch(value));

  const pickMerchant = (id: string) => {
    if (trimmed) commit(trimmed);
    onSelectMerchant(id);
  };

  const pickDish = (hit: DishHit) => {
    if (trimmed) commit(trimmed);
    onSelectDish(hit.merchantId, hit.id);
  };

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-gray-50">
      <div className="sticky top-0 border-b border-gray-100 bg-white px-3 py-2">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <button type="button" onClick={onClose} aria-label="Close search" className="rounded-full p-2 text-gray-700 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && trimmed) commit(trimmed);
                if (e.key === 'Escape') onClose();
              }}
              placeholder="Search dishes, restaurants, cuisines"
              className="w-full rounded-full border border-gray-200 bg-gray-100 py-2.5 pl-9 pr-9 text-sm focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-4 pb-24">
        {!trimmed ? (
          <div className="space-y-6">
            {recent.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">Recent searches</h3>
                  <button
                    type="button"
                    onClick={() => {
                      clearRecentSearches();
                      setRecent([]);
                    }}
                    className="text-xs font-semibold text-gray-500"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recent.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setQuery(term)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700"
                    >
                      <Clock className="h-3.5 w-3.5 text-gray-400" /> {term}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {trending.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-bold text-gray-900">Popular near you</h3>
                <div className="flex flex-wrap gap-2">
                  {trending.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setQuery(term)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800"
                    >
                      <TrendingUp className="h-3.5 w-3.5" /> {term}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {merchants.length === 0 && (
              <EmptyState emoji="📍" title="Set your location first" body="Search shows dishes from stores that deliver to you." />
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {dishResults.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-bold text-gray-900">Dishes</h3>
                <div className="space-y-2">
                  {dishResults.map((hit) => {
                    const isOpen = isMerchantOpen(hit.merchant.openingHours).isOpen;
                    return (
                      <button
                        key={`${hit.merchantId}-${hit.id}`}
                        type="button"
                        onClick={() => pickDish(hit)}
                        className={`flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-sm ${isOpen ? '' : 'opacity-60'}`}
                      >
                        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                          {hit.image ? (
                            <OptimizedImage src={hit.image} alt={hit.name} width={THUMBNAIL_WIDTH} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xl">🍽️</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">{hit.name}</p>
                          <p className="truncate text-xs text-gray-500">
                            {hit.merchant.name} · {formatDistance(hit.merchant.distanceKm)}
                          </p>
                          <p className="mt-1 text-sm font-bold text-brand-700">{formatPeso(hit.effectivePrice ?? hit.basePrice)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {merchantResults.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-bold text-gray-900">Restaurants</h3>
                <div className="space-y-2">
                  {merchantResults.map(({ merchant, matchedDishes }) => (
                    <MerchantListRow key={merchant.id} merchant={merchant} onSelect={pickMerchant} matchedDishes={matchedDishes} />
                  ))}
                </div>
              </section>
            )}

            {dishResults.length === 0 && merchantResults.length === 0 && (
              <EmptyState
                emoji="🔍"
                title={`No results for "${trimmed}"`}
                body={suggestions.length > 0 ? 'Did you mean one of these?' : 'Try a dish name, cuisine, or restaurant.'}
                action={
                  suggestions.length > 0 ? (
                    <div className="space-y-2 text-left">
                      {suggestions.map(({ merchant, matchedDishes }) => (
                        <MerchantListRow key={merchant.id} merchant={merchant} onSelect={pickMerchant} matchedDishes={matchedDishes} />
                      ))}
                    </div>
                  ) : undefined
                }
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchOverlay;
