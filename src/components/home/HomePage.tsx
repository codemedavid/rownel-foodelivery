import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, MapPin, ReceiptText, Search } from 'lucide-react';
import { useMerchant } from '../../contexts/MerchantContext';
import { useUserLocation } from '../../contexts/LocationContext';
import { decorateAndFilterMerchantsByDistance, type MerchantWithDistance } from '../../utils/merchantDistance';
import { useMenu } from '../../hooks/useMenu';
import { isMerchantOpen } from '../../lib/timeUtils';
import { SERVICES, getService, merchantsForService, type ServiceDefinition, type ServiceId } from '../../lib/services';
import { readFulfilmentPreference, saveFulfilmentPreference } from '../../lib/customerPrefs';
import ServicesGrid from './ServicesGrid';
import PromoCarousel from './PromoCarousel';
import LocationEditorSheet from './LocationEditorSheet';
import ActiveOrdersBanner from './ActiveOrdersBanner';
import InstallAppBanner from './InstallAppBanner';
import SearchOverlay from './SearchOverlay';
import { MerchantCarouselCard, MerchantListRow, MerchantLogoTile } from './MerchantCards';
import { EmptyState, Pill, SectionHeader, Spinner } from '../ui';

const NEAR_ME_LIMIT = 8;
const POPULAR_LIMIT = 10;
const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  restaurant: { emoji: '🍽️', label: 'Restaurants' },
  cafe: { emoji: '☕', label: 'Cafés' },
  bakery: { emoji: '🥐', label: 'Bakery' },
  'fast-food': { emoji: '🍔', label: 'Fast food' },
  grocery: { emoji: '🛒', label: 'Grocery' },
};

const describeCategory = (category: string) =>
  CATEGORY_META[category] ?? { emoji: '🍴', label: category.charAt(0).toUpperCase() + category.slice(1) };

const serviceFromPreference = (): ServiceId => {
  const pref = readFulfilmentPreference();
  if (pref.serviceType === 'pickup') return 'pickup';
  return pref.deliveryMode === 'economy' ? 'pasabay' : 'food';
};

const byOpenThenDistance = (a: MerchantWithDistance, b: MerchantWithDistance) => {
  const aOpen = isMerchantOpen(a.openingHours).isOpen;
  const bOpen = isMerchantOpen(b.openingHours).isOpen;
  if (aOpen !== bOpen) return aOpen ? -1 : 1;
  return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
};

/**
 * Customer home. Hierarchy: Deliver-to → Services → Promos → Categories →
 * Merchants. Selecting a service changes the feed and seeds checkout.
 */
const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { merchants, loading, selectMerchantById } = useMerchant();
  const { menuItems } = useMenu();
  const { userLocation, locationStatus, locationError, locationStreet, locationDisplayName, isManualPromptRequested, requestLocation } =
    useUserLocation();

  const [activeServiceId, setActiveServiceId] = useState<ServiceId>(serviceFromPreference);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    if (isManualPromptRequested) setIsLocationOpen(true);
  }, [isManualPromptRequested]);

  const activeService = getService(activeServiceId) ?? SERVICES[0];

  const nearby = useMemo(() => decorateAndFilterMerchantsByDistance(merchants, userLocation), [merchants, userLocation]);
  const serviceMerchants = useMemo(
    () => (merchantsForService(nearby, activeService) as MerchantWithDistance[]).sort(byOpenThenDistance),
    [nearby, activeService]
  );

  const categories = useMemo(() => [...new Set(serviceMerchants.map((m) => m.category))], [serviceMerchants]);

  const feed = useMemo(
    () => (activeCategory ? serviceMerchants.filter((m) => m.category === activeCategory) : serviceMerchants),
    [serviceMerchants, activeCategory]
  );
  const closest = useMemo(() => feed.slice(0, NEAR_ME_LIMIT), [feed]);
  const popular = useMemo(
    () => [...feed].sort((a, b) => b.rating - a.rating || (b.totalReviews ?? 0) - (a.totalReviews ?? 0)).slice(0, POPULAR_LIMIT),
    [feed]
  );

  const openMerchant = useCallback(
    (merchantId: string) => {
      selectMerchantById(merchantId);
      setIsSearchOpen(false);
      navigate(`/merchant/${merchantId}`);
    },
    [navigate, selectMerchantById]
  );

  const openDish = useCallback(
    (merchantId: string, itemId: string) => {
      selectMerchantById(merchantId);
      setIsSearchOpen(false);
      navigate(`/merchant/${merchantId}/item/${itemId}`);
    },
    [navigate, selectMerchantById]
  );

  const selectService = (service: ServiceDefinition) => {
    setActiveServiceId(service.id);
    setActiveCategory(null);
    if (service.fulfilment) saveFulfilmentPreference(service.fulfilment);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Spinner />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-24 md:pb-10">
      {/* Green hero header (Grab style) */}
      <header className="bg-brand-600 pb-8 pt-3 text-white">
        <div className="mx-auto max-w-2xl px-4">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => setIsLocationOpen(true)} className="flex min-w-0 items-center gap-2 text-left">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                <MapPin className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-white/80">
                  {activeService.fulfilment?.serviceType === 'pickup' ? 'Your location' : 'Deliver to'}
                </span>
                <span className="flex items-center gap-1 text-sm font-bold">
                  <span className="truncate">{locationStatus === 'locating' ? 'Detecting…' : locationStreet}</span>
                  <ChevronDown className="h-4 w-4 flex-shrink-0" />
                </span>
                {locationDisplayName && <span className="block truncate text-[11px] text-white/80">{locationDisplayName}</span>}
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/orders')}
              aria-label="My orders"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/20 hover:bg-white/30"
            >
              <ReceiptText className="h-5 w-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="mt-4 flex w-full items-center gap-3 rounded-full bg-white px-4 py-3 text-left text-sm text-gray-500 shadow-md"
          >
            <Search className="h-5 w-5 text-brand-600" />
            <span>Search dishes, restaurants, cuisines</span>
          </button>
        </div>
      </header>

      <div className="mx-auto -mt-5 max-w-2xl space-y-6 px-4">
        {/* Services */}
        <section className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
          <ServicesGrid activeService={activeServiceId} onSelect={selectService} />
        </section>

        <ActiveOrdersBanner />

        {!userLocation && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Where should we deliver?</p>
            <p className="mt-1 text-xs text-amber-800">Set your location so we can show stores that deliver to you.</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setIsLocationOpen(true)} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white">
                Set location
              </button>
              <button type="button" onClick={() => requestLocation(false)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900">
                Use GPS
              </button>
            </div>
            {locationStatus === 'locating' && <p className="mt-2 text-xs text-amber-700">Detecting your location…</p>}
            {locationError && <p className="mt-2 text-xs text-red-700">{locationError}</p>}
          </section>
        )}

        <PromoCarousel />

        <InstallAppBanner />

        {/* Category chips */}
        {categories.length > 1 && (
          <section className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
            <Pill active={activeCategory === null} onClick={() => setActiveCategory(null)}>
              All
            </Pill>
            {categories.map((category) => {
              const meta = describeCategory(category);
              return (
                <Pill key={category} active={activeCategory === category} onClick={() => setActiveCategory(activeCategory === category ? null : category)}>
                  {meta.emoji} {meta.label}
                </Pill>
              );
            })}
          </section>
        )}

        {feed.length === 0 ? (
          <EmptyState
            emoji={activeService.emoji}
            title={`No ${activeService.name} stores near you yet`}
            body={
              activeService.id === 'pasabay'
                ? 'Pasabay is offered by stores with a fixed delivery fee. Try Food for rush delivery.'
                : 'Try another service, widen your location, or check back soon.'
            }
          />
        ) : (
          <>
            <section>
              <SectionHeader title="Closest to you" subtitle={`${activeService.name} · ${activeService.tagline}`} />
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 no-scrollbar">
                {closest.map((merchant) => (
                  <MerchantCarouselCard key={merchant.id} merchant={merchant} onSelect={openMerchant} />
                ))}
              </div>
            </section>

            {popular.length > 0 && (
              <section>
                <SectionHeader title="Popular stores" />
                <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 no-scrollbar">
                  {popular.map((merchant) => (
                    <MerchantLogoTile key={merchant.id} merchant={merchant} onSelect={openMerchant} />
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionHeader
                title={activeCategory ? describeCategory(activeCategory).label : 'All stores'}
                subtitle={`${feed.length} ${feed.length === 1 ? 'store' : 'stores'} deliver to you`}
              />
              <div className="space-y-3">
                {feed.map((merchant) => (
                  <MerchantListRow key={merchant.id} merchant={merchant} onSelect={openMerchant} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      <LocationEditorSheet open={isLocationOpen} onClose={() => setIsLocationOpen(false)} />
      <SearchOverlay
        open={isSearchOpen}
        merchants={nearby}
        menuItems={menuItems}
        onClose={() => setIsSearchOpen(false)}
        onSelectMerchant={openMerchant}
        onSelectDish={openDish}
      />
    </main>
  );
};

export default HomePage;
