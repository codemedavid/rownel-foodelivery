import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Search, X, Clock, Info } from 'lucide-react';
import type { MenuItem } from '../../types';
import { useMerchant } from '../../contexts/MerchantContext';
import { useMenuContext } from '../../contexts/MenuContext';
import { useCartContext } from '../../contexts/CartContext';
import { useCategories } from '../../hooks/useCategories';
import { isCategoryAvailable, isMerchantOpen } from '../../lib/timeUtils';
import { supportsPasabay } from '../../lib/services';
import { scoreTextMatch, tokenizeQuery } from '../../lib/textMatch';
import OptimizedImage from '../OptimizedImage';
import MenuItemRow from './MenuItemRow';
import BasketBar from './BasketBar';
import { EmptyState, MetaChip, RatingBadge, Spinner, formatPeso } from '../ui';

const COVER_WIDTH = 900;
const LOGO_WIDTH = 128;
const STICKY_OFFSET_PX = 112;
const POPULAR_SECTION_ID = 'section-popular';

const matchesQuery = (item: MenuItem, terms: string[]) =>
  terms.every((term) => scoreTextMatch(item.name, term) > 0 || scoreTextMatch(item.description, term) > 0 || scoreTextMatch(item.category, term) > 0);

/**
 * Store page: cover header, sticky category tabs, compact menu rows with
 * quick-add, in-menu search, and a sticky basket bar.
 */
const MerchantPage: React.FC = () => {
  const navigate = useNavigate();
  const { merchantId } = useParams<{ merchantId: string }>();
  const { selectedMerchant, selectMerchantById, loading: merchantsLoading } = useMerchant();
  const { menuItems, loading: menuLoading } = useMenuContext();
  const { cartItems, addToCart, updateQuantity } = useCartContext();
  const [query, setQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');
  const tabsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (merchantId && selectedMerchant?.id !== merchantId) selectMerchantById(merchantId);
    // selectMerchantById is recreated each render; only the id matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId, selectedMerchant?.id]);

  const merchant = selectedMerchant?.id === merchantId ? selectedMerchant : null;
  const items = useMemo(() => menuItems.filter((item) => item.merchantId === merchantId), [menuItems, merchantId]);
  const { categories } = useCategories(merchantId, items);
  const openStatus = useMemo(() => isMerchantOpen(merchant?.openingHours), [merchant?.openingHours]);

  const terms = useMemo(() => tokenizeQuery(query), [query]);
  const filtered = useMemo(() => (terms.length ? items.filter((i) => matchesQuery(i, terms)) : items), [items, terms]);

  const sections = useMemo(() => {
    const known = new Set(categories.map((c) => c.id));
    const ordered = categories.map((c) => ({ id: c.id, name: c.name, start: c.start_time, end: c.end_time }));
    const extra = [...new Set(filtered.map((i) => i.category))].filter((id) => !known.has(id)).map((id) => ({ id, name: id, start: null, end: null }));
    return [...ordered, ...extra]
      .map((section) => ({ ...section, items: filtered.filter((i) => i.category === section.id) }))
      .filter((section) => section.items.length > 0);
  }, [categories, filtered]);

  const popular = useMemo(() => (terms.length ? [] : items.filter((i) => i.popular && i.available !== false).slice(0, 6)), [items, terms]);
  const tabs = useMemo(
    () => [...(popular.length ? [{ id: POPULAR_SECTION_ID, name: 'Popular' }] : []), ...sections.map((s) => ({ id: `section-${s.id}`, name: s.name }))],
    [popular.length, sections]
  );

  useEffect(() => {
    if (tabs.length === 0) return;
    const onScroll = () => {
      const y = window.scrollY + STICKY_OFFSET_PX + 8;
      let current = tabs[0].id;
      for (const tab of tabs) {
        const el = document.getElementById(tab.id);
        if (el && el.offsetTop <= y) current = tab.id;
      }
      setActiveSection(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [tabs]);

  useEffect(() => {
    const chip = tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${activeSection}"]`);
    chip?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeSection]);

  const jumpTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({ top: el.offsetTop - STICKY_OFFSET_PX, behavior: 'smooth' });
  };

  const cartEntryFor = (item: MenuItem) =>
    cartItems.find((c) => c.menuItemId === item.id && !c.selectedVariation && (!c.selectedAddOns || c.selectedAddOns.length === 0) && !c.selectedVariations);

  const openDetails = (itemId: string) => navigate(`/merchant/${merchantId}/item/${itemId}`);

  if (!merchant) {
    if (merchantsLoading || menuLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <Spinner />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState emoji="🏪" title="Store not found" body="It may be closed or no longer available." action={<button type="button" onClick={() => navigate('/')} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Back to home</button>} />
      </div>
    );
  }

  const renderRow = (item: MenuItem, sectionClosed: boolean) => {
    const entry = cartEntryFor(item);
    return (
      <MenuItemRow
        key={item.id}
        item={item}
        quantity={entry?.quantity ?? 0}
        cartItemId={entry?.id}
        disabled={!openStatus.isOpen || sectionClosed}
        onQuickAdd={(menuItem) => addToCart(menuItem, 1)}
        onUpdateQuantity={updateQuantity}
        onOpenDetails={openDetails}
      />
    );
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-36 md:pb-24">
      {/* Cover */}
      <div className="relative h-44 bg-gray-200 sm:h-56">
        {merchant.coverImageUrl || merchant.logoUrl ? (
          <OptimizedImage src={merchant.coverImageUrl || merchant.logoUrl} alt={merchant.name} width={COVER_WIDTH} isPriority className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-brand-100 text-5xl">🍽️</div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <button type="button" onClick={() => navigate('/')} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => setIsSearchOpen((v) => !v)} aria-label="Search menu" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow">
            <Search className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Store info card */}
      <div className="relative z-10 mx-auto -mt-8 max-w-2xl px-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold leading-tight text-gray-900">{merchant.name}</h1>
              <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{merchant.cuisineType || merchant.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <RatingBadge rating={merchant.rating} reviews={merchant.totalReviews} />
                <MetaChip icon="time">{merchant.estimatedDeliveryTime || '25–40 min'}</MetaChip>
                {merchant.minimumOrder > 0 && <span className="text-xs text-gray-500">Min. {formatPeso(merchant.minimumOrder)}</span>}
                {supportsPasabay(merchant) && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">Pasabay {formatPeso(merchant.fixedDeliveryFee ?? 0)}</span>}
              </div>
            </div>
            {merchant.logoUrl && (
              <OptimizedImage src={merchant.logoUrl} alt="" width={LOGO_WIDTH} className="h-14 w-14 flex-shrink-0 rounded-xl border border-gray-100 object-cover" />
            )}
          </div>
          {!openStatus.isOpen && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              <Clock className="h-4 w-4 flex-shrink-0" />
              Closed now. {openStatus.nextOpenTime}
            </div>
          )}
          {openStatus.isOpen && openStatus.closingTime && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
              <Info className="h-3.5 w-3.5" /> Open until {openStatus.closingTime}
            </div>
          )}
        </div>
      </div>

      {/* Sticky tabs + search */}
      <div className="sticky top-0 z-30 mt-4 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          {isSearchOpen && (
            <div className="relative px-4 pt-3">
              <Search className="absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search in ${merchant.name}`}
                className="w-full rounded-full border border-gray-200 bg-gray-100 py-2 pl-9 pr-9 text-sm focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              />
              <button
                type="button"
                aria-label="Close menu search"
                onClick={() => {
                  setQuery('');
                  setIsSearchOpen(false);
                }}
                className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div ref={tabsRef} className="flex gap-2 overflow-x-auto px-4 py-2.5 no-scrollbar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                data-tab={tab.id}
                type="button"
                onClick={() => jumpTo(tab.id)}
                className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  activeSection === tab.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Menu */}
      <div className="mx-auto max-w-2xl px-4 pt-4">
        {menuLoading && items.length === 0 ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : sections.length === 0 && popular.length === 0 ? (
          <EmptyState emoji="🍽️" title={terms.length ? `Nothing matches "${query.trim()}"` : 'Menu coming soon'} body={terms.length ? 'Try a different word.' : 'This store has not added items yet.'} />
        ) : (
          <div className="space-y-5">
            {popular.length > 0 && (
              <section id={POPULAR_SECTION_ID} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <h3 className="px-4 pb-1 pt-3 text-base font-bold text-gray-900">⭐ Popular</h3>
                {popular.map((item) => renderRow(item, false))}
              </section>
            )}
            {sections.map((section) => {
              const availability = isCategoryAvailable(section.start, section.end);
              return (
                <section key={section.id} id={`section-${section.id}`} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                  <div className="flex items-center justify-between px-4 pb-1 pt-3">
                    <h3 className="text-base font-bold text-gray-900">{section.name}</h3>
                    {!availability.isAvailable && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                        <Clock className="h-3 w-3" /> {availability.availableAt}
                      </span>
                    )}
                  </div>
                  {section.items.map((item) => renderRow(item, !availability.isAvailable))}
                </section>
              );
            })}
          </div>
        )}
      </div>

      <BasketBar />
    </main>
  );
};

export default MerchantPage;
