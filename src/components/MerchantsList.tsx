import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, MapPin, PackageSearch, Search, ChevronRight, ChevronDown, ChevronLeft, Navigation, X } from 'lucide-react';
import { useMerchant } from '../contexts/MerchantContext';
import { useUserLocation } from '../contexts/LocationContext';
import { decorateAndFilterMerchantsByDistance, type MerchantWithDistance } from '../utils/merchantDistance';
import { MenuItem } from '../types';
import AddressAutocompleteInput from './AddressAutocompleteInput';
import MapLocationPicker from './MapLocationPicker';
import { type OSMAddressSuggestion } from '../lib/osm';
import { useMenu } from '../hooks/useMenu';
import { usePromotions } from '../hooks/usePromotions';
import { isMerchantOpen } from '../lib/timeUtils';
import OptimizedImage from './OptimizedImage';

const MERCHANT_COVER_WIDTH = 600;
const BANNER_WIDTH = 900;
const THUMBNAIL_WIDTH = 160;
const LOGO_WIDTH = 120;

const MAX_SEARCH_RESULTS = 20;
const NEAR_ME_VISIBLE_LIMIT = 5;

type MenuSearchResult = MenuItem & { merchant: MerchantWithDistance };

const MerchantsList: React.FC = () => {
  const navigate = useNavigate();
  const { merchants, loading, selectMerchantById } = useMerchant();
  const { menuItems } = useMenu();
  const { promotions } = usePromotions();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPromotionIndex, setCurrentPromotionIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const exploreSectionRef = React.useRef<HTMLDivElement | null>(null);

  const {
    userLocation,
    locationStatus,
    locationError,
    locationStreet,
    locationDisplayName,
    isManualPromptRequested,
    dismissManualPrompt,
    requestLocation,
    applyLocation,
  } = useUserLocation();

  const [isLocationEditorOpen, setIsLocationEditorOpen] = useState(false);
  const [manualLocationInput, setManualLocationInput] = useState('');
  const [selectedManualLocation, setSelectedManualLocation] = useState<OSMAddressSuggestion | null>(null);
  const [manualLocationError, setManualLocationError] = useState<string | null>(null);

  const handleSelectMerchant = (merchantId: string) => {
    selectMerchantById(merchantId);
    navigate(`/merchant/${merchantId}`);
  };

  const handleSelectFoodResult = (item: MenuSearchResult) => {
    selectMerchantById(item.merchantId);
    navigate(`/merchant/${item.merchantId}/item/${item.id}`);
  };

  const openLocationEditor = () => {
    setManualLocationInput(locationDisplayName || '');
    setSelectedManualLocation(null);
    setManualLocationError(null);
    setIsLocationEditorOpen(true);
  };

  const closeLocationEditor = useCallback(() => {
    setIsLocationEditorOpen(false);
    dismissManualPrompt();
  }, [dismissManualPrompt]);

  // The provider asks for the manual editor when geolocation fails with no saved location.
  useEffect(() => {
    if (isManualPromptRequested) {
      setIsLocationEditorOpen(true);
    }
  }, [isManualPromptRequested]);

  // A successful GPS request (e.g. "Use current GPS" in the editor) closes the editor.
  useEffect(() => {
    if (locationStatus === 'ready') {
      setIsLocationEditorOpen(false);
    }
  }, [locationStatus]);

  const merchantsWithDistance = useMemo(
    () => decorateAndFilterMerchantsByDistance(merchants, userLocation),
    [merchants, userLocation]
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const searchTokens = useMemo(
    () => normalizedSearchQuery.split(/\s+/).filter(Boolean),
    [normalizedSearchQuery]
  );

  const nearbyMerchantMap = useMemo(() => {
    return new Map(merchantsWithDistance.map((merchant) => [merchant.id, merchant]));
  }, [merchantsWithDistance]);

  const foodSearchResults = useMemo(() => {
    if (!normalizedSearchQuery || !userLocation) {
      return [] as MenuSearchResult[];
    }

    return menuItems
      .filter((item) => item.available !== false)
      .map((item) => {
        const merchant = nearbyMerchantMap.get(item.merchantId);
        if (!merchant) {
          return null;
        }

        const searchableContent = [
          item.name,
          item.description,
          item.category,
          merchant.name,
          merchant.category,
          merchant.cuisineType,
          merchant.description,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const isMatch = searchTokens.every((token) => searchableContent.includes(token));
        if (!isMatch) {
          return null;
        }

        return { ...item, merchant };
      })
      .filter((item): item is MenuSearchResult => item !== null)
      .sort((a, b) => {
        const distanceA = a.merchant.distanceKm ?? Number.POSITIVE_INFINITY;
        const distanceB = b.merchant.distanceKm ?? Number.POSITIVE_INFINITY;
        return distanceA - distanceB;
      })
      .slice(0, MAX_SEARCH_RESULTS);
  }, [menuItems, nearbyMerchantMap, normalizedSearchQuery, searchTokens, userLocation]);

  const randomNearbyFoodPicks = useMemo(() => {
    if (!userLocation) return [] as MenuSearchResult[];

    const nearbyItems = menuItems
      .filter((item) => item.available !== false)
      .map((item) => {
        const merchant = nearbyMerchantMap.get(item.merchantId);
        if (!merchant) return null;
        return { ...item, merchant };
      })
      .filter((item): item is MenuSearchResult => item !== null);

    const shuffled = [...nearbyItems].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 5);
  }, [menuItems, nearbyMerchantMap, userLocation]);

  const allNearMeMerchants = useMemo(() => {
    return [...merchantsWithDistance].sort((a, b) => {
      const aOpen = isMerchantOpen(a.openingHours).isOpen;
      const bOpen = isMerchantOpen(b.openingHours).isOpen;
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      const distA = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const distB = b.distanceKm ?? Number.POSITIVE_INFINITY;
      return distA - distB;
    });
  }, [merchantsWithDistance]);

  const nearMeMerchants = useMemo(() => {
    return allNearMeMerchants.slice(0, NEAR_ME_VISIBLE_LIMIT);
  }, [allNearMeMerchants]);

  const popularMerchants = useMemo(() => {
    return [...merchantsWithDistance].sort((a, b) => b.rating - a.rating).slice(0, 5);
  }, [merchantsWithDistance]);

  const exploreMerchants = useMemo(() => {
    if (!selectedCategory) return allNearMeMerchants;
    return allNearMeMerchants.filter((m) => m.category === selectedCategory);
  }, [allNearMeMerchants, selectedCategory]);

  const scrollToExplore = useCallback(() => {
    exploreSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(merchantsWithDistance.map((m) => m.category));
    return Array.from(cats).map((c) => ({
      name: c.charAt(0).toUpperCase() + c.slice(1),
      id: c,
      icon: getCategoryIcon(c),
    }));
  }, [merchantsWithDistance]);

  useEffect(() => {
    if (promotions.length === 0) {
      setCurrentPromotionIndex(0);
      return;
    }

    if (currentPromotionIndex >= promotions.length) {
      setCurrentPromotionIndex(0);
    }
  }, [currentPromotionIndex, promotions.length]);

  useEffect(() => {
    if (promotions.length <= 1) return;

    const intervalId = window.setInterval(() => {
      setCurrentPromotionIndex((prev) => (prev + 1) % promotions.length);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [promotions.length]);

  const foodCategories = useMemo(() => {
    const counts = new Map<string, number>();

    menuItems.forEach((item) => {
      if (item.available === false) return;
      if (!nearbyMerchantMap.has(item.merchantId)) return;
      counts.set(item.category, (counts.get(item.category) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([id, count]) => ({
        id,
        count,
        name: id
          .split('-')
          .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
          .join(' '),
        icon: getCategoryIcon(id),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [menuItems, nearbyMerchantMap]);

  function getCategoryIcon(category: string) {
    const lower = category.toLowerCase();
    if (lower.includes('burger') || lower.includes('fast')) return '🍔';
    if (lower.includes('pizza')) return '🍕';
    if (lower.includes('coffee') || lower.includes('cafe')) return '☕';
    if (lower.includes('sushi') || lower.includes('japanese')) return '🍣';
    if (lower.includes('asian')) return '🍜';
    if (lower.includes('dessert') || lower.includes('cake')) return '🍰';
    if (lower.includes('healthy') || lower.includes('salad')) return '🥗';
    if (lower.includes('fruit')) return '🍉';
    return '🍴';
  }

  const saveManualLocation = () => {
    if (!selectedManualLocation) {
      setManualLocationError('Select an address suggestion so we can pin your exact location.');
      return;
    }

    const street = selectedManualLocation.displayName.split(',')[0]?.trim() || selectedManualLocation.displayName;

    applyLocation(
      {
        latitude: selectedManualLocation.latitude,
        longitude: selectedManualLocation.longitude,
        displayName: selectedManualLocation.displayName,
        street,
      },
      true
    );

    setManualLocationError(null);
    closeLocationEditor();
  };

  const openPromotionLink = (link: string | null) => {
    if (!link) return;

    if (link.startsWith('http://') || link.startsWith('https://')) {
      window.open(link, '_blank', 'noopener,noreferrer');
      return;
    }

    navigate(link);
  };

  const MerchantCardLarge = ({ merchant }: { merchant: MerchantWithDistance }) => {
    const openStatus = isMerchantOpen(merchant.openingHours);
    return (
      <button
        onClick={() => handleSelectMerchant(merchant.id)}
        className={`flex-shrink-0 w-64 sm:w-72 bg-white rounded-2xl p-0 shadow-sm hover:shadow-md transition-all text-left overflow-hidden border border-gray-100${!openStatus.isOpen ? ' opacity-60' : ''}`}
      >
        <div className="h-32 bg-gray-100 relative">
          {merchant.coverImageUrl || merchant.logoUrl ? (
            <OptimizedImage
              src={merchant.coverImageUrl || merchant.logoUrl}
              alt={merchant.name}
              width={MERCHANT_COVER_WIDTH}
              className="w-full h-full object-cover"
            />
          ) : null}
          {!openStatus.isOpen && (
            <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded-full text-xs font-bold shadow-sm">
              Closed
            </div>
          )}
          <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full text-xs font-semibold shadow-sm">
            25-35 min
          </div>
        </div>
        <div className="p-4">
          <h3 className="font-bold text-gray-900 text-lg mb-1">{merchant.name}</h3>
          <p className="text-gray-500 text-sm mb-3 line-clamp-1">{merchant.description || merchant.cuisineType}</p>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1.5 text-gray-700 font-medium">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              4.9
            </div>
            <div className="flex items-center gap-1 text-gray-500">
              <MapPin className="w-3.5 h-3.5" />
              {typeof merchant.distanceKm === 'number' ? `${merchant.distanceKm.toFixed(1)}km` : 'N/A'}
            </div>
          </div>
          {!openStatus.isOpen && openStatus.nextOpenTime && (
            <p className="text-xs text-red-500 mt-1">{openStatus.nextOpenTime}</p>
          )}
        </div>
      </button>
    );
  };

  const MerchantGridCard = ({ merchant }: { merchant: MerchantWithDistance }) => {
    const openStatus = isMerchantOpen(merchant.openingHours);
    return (
      <button
        onClick={() => handleSelectMerchant(merchant.id)}
        className={`group flex flex-col bg-white rounded-2xl shadow-sm hover:shadow-md transition-all text-left overflow-hidden border border-gray-100${!openStatus.isOpen ? ' opacity-70' : ''}`}
      >
        <div className="h-24 sm:h-28 bg-gray-100 relative">
          {merchant.coverImageUrl || merchant.logoUrl ? (
            <OptimizedImage
              src={merchant.coverImageUrl || merchant.logoUrl}
              alt={merchant.name}
              width={MERCHANT_COVER_WIDTH}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-gray-300">🍽️</div>
          )}
          {!openStatus.isOpen && (
            <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm">
              Closed
            </div>
          )}
        </div>
        <div className="p-3 flex-1 flex flex-col">
          <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-1">{merchant.name}</h3>
          <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">{merchant.cuisineType || merchant.description || 'Restaurant'}</p>
          <div className="mt-auto pt-2 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-gray-700 font-medium">
              <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
              4.9
            </div>
            <div className="flex items-center gap-0.5 text-gray-500">
              <MapPin className="w-3 h-3" />
              {typeof merchant.distanceKm === 'number' ? `${merchant.distanceKm.toFixed(1)}km` : 'N/A'}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const FoodSearchCard = ({ item }: { item: MenuSearchResult }) => (
    <button
      type="button"
      onClick={() => handleSelectFoodResult(item)}
      className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
          {item.image ? (
            <OptimizedImage src={item.image} alt={item.name} width={THUMBNAIL_WIDTH} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xl text-gray-300">🍽️</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-base font-semibold text-gray-900">{item.name}</h3>
            <span className="text-sm font-semibold text-green-900">₱{item.basePrice.toFixed(2)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-gray-600">{item.description || 'No description available.'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{item.merchant.name}</span>
            <span className="capitalize">{item.category.replace(/-/g, ' ')}</span>
            <span>{typeof item.merchant.distanceKm === 'number' ? `${item.merchant.distanceKm.toFixed(1)}km away` : 'Nearby'}</span>
          </div>
        </div>
      </div>
    </button>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-800"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      {/* Top Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <button
            type="button"
            onClick={openLocationEditor}
            className="flex flex-col text-left"
          >
            <span className="text-xs text-gray-500">Your location</span>
            <div className="flex items-center gap-1 font-semibold text-gray-900 hover:text-green-800 transition-colors">
              <span className="truncate max-w-[220px]">{locationStreet}</span>
              <ChevronDown className="w-4 h-4" />
            </div>
            {locationDisplayName && (
              <span className="truncate max-w-[220px] text-[11px] text-gray-500">{locationDisplayName}</span>
            )}
          </button>

          <button
            onClick={() => navigate('/track')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-100 rounded-full shadow-sm hover:bg-gray-50 text-sm font-medium text-gray-700"
          >
            <PackageSearch className="w-5 h-5" />
            <span className="hidden sm:inline">Track Order</span>
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {!userLocation && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Set your location to see nearby merchants.</p>
            <p className="mt-1 text-sm text-amber-800">
              We couldn't detect your location. Add it manually so stores near you can be shown.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={openLocationEditor}
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Add location
              </button>
              <button
                type="button"
                onClick={() => requestLocation(false)}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
              >
                Detect again
              </button>
            </div>
            {locationStatus === 'locating' && <p className="mt-2 text-xs text-amber-700">Detecting your location...</p>}
            {locationError && <p className="mt-2 text-xs text-red-700">{locationError}</p>}
          </section>
        )}

        {/* Search Section */}
        <section>
          <h1 className="text-3xl font-bold text-green-950 mb-6 leading-tight">Rownel Food Delivery</h1>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search restaurant, food, groceries"
              className="w-full bg-white border-none shadow-sm rounded-2xl py-4 pl-12 pr-4 text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-green-800/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </section>

        {/* Categories Section */}
        {normalizedSearchQuery ? (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Foods near you</h2>
              {userLocation && (
                <span className="text-xs text-gray-500">{foodSearchResults.length} result(s)</span>
              )}
            </div>

            {!userLocation ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Set your location first to search foods from nearby restaurants.
              </p>
            ) : foodSearchResults.length === 0 ? (
              <p className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-600">
                No foods found nearby for "{searchQuery.trim()}". Try another keyword or category.
              </p>
            ) : (
              <div className="space-y-3">
                {foodSearchResults.map((item) => (
                  <FoodSearchCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* Categories Section */}
            <section>
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 snap-x">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory(null);
                    scrollToExplore();
                  }}
                  className="flex flex-col items-center gap-2 min-w-[72px] group"
                >
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-sm border transition-all group-hover:scale-105 ${
                      selectedCategory === null
                        ? 'bg-green-800 border-green-800 text-white'
                        : 'bg-white border-gray-100'
                    }`}
                  >
                    🍽️
                  </div>
                  <span className={`text-xs font-medium ${selectedCategory === null ? 'text-green-800' : 'text-gray-700'}`}>
                    All
                  </span>
                </button>
                {categories.map((cat) => {
                  const isActive = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(isActive ? null : cat.id);
                        scrollToExplore();
                      }}
                      className="flex flex-col items-center gap-2 min-w-[72px] group"
                    >
                      <div
                        className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-sm border transition-all group-hover:scale-105 ${
                          isActive ? 'bg-green-800 border-green-800 text-white' : 'bg-white border-gray-100'
                        }`}
                      >
                        {cat.icon}
                      </div>
                      <span className={`text-xs font-medium ${isActive ? 'text-green-800' : 'text-gray-700'}`}>
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Restaurants Near Me (Horizontal Scroll – quick peek of closest) */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Closest to you</h2>
                {allNearMeMerchants.length > NEAR_ME_VISIBLE_LIMIT && (
                  <button
                    type="button"
                    onClick={scrollToExplore}
                    className="text-sm text-green-800 font-medium flex items-center hover:text-green-900"
                  >
                    Explore all <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide snap-x">
                {nearMeMerchants.map((merchant) => (
                  <MerchantCardLarge key={merchant.id} merchant={merchant} />
                ))}
                {nearMeMerchants.length === 0 && (
                  <div className="text-gray-500 text-sm py-4">No merchants found near your selected location.</div>
                )}
              </div>
            </section>

            {/* Explore All Restaurants (Responsive Grid – see everything) */}
            <section ref={exploreSectionRef} className="scroll-mt-20">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {selectedCategory
                      ? `${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} stores`
                      : 'Explore all restaurants'}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {exploreMerchants.length} {exploreMerchants.length === 1 ? 'store' : 'stores'} near you
                  </p>
                </div>
                {selectedCategory && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className="text-sm text-green-800 font-medium flex items-center hover:text-green-900"
                  >
                    Clear filter <X className="w-4 h-4 ml-0.5" />
                  </button>
                )}
              </div>
              {exploreMerchants.length === 0 ? (
                <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
                  No stores found{selectedCategory ? ' in this category' : ''} near your location.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                  {exploreMerchants.map((merchant) => (
                    <MerchantGridCard key={merchant.id} merchant={merchant} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Random food near your area</h2>
                {userLocation && randomNearbyFoodPicks.length > 0 && (
                  <span className="text-xs text-gray-500">Refresh for new picks</span>
                )}
              </div>

              {!userLocation ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Set your location to see random foods near your area.
                </p>
              ) : randomNearbyFoodPicks.length === 0 ? (
                <p className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-600">
                  No available food items found from nearby merchants yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {randomNearbyFoodPicks.map((item) => (
                    <FoodSearchCard key={`${item.merchantId}-${item.id}`} item={item} />
                  ))}
                </div>
              )}
            </section>

            {/* Food Categories */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Food categories</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {foodCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSearchQuery(category.name)}
                    className="rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="text-2xl">{category.icon}</div>
                    <p className="mt-2 text-sm font-semibold text-gray-900">{category.name}</p>
                    <p className="text-xs text-gray-500">{category.count} item(s)</p>
                  </button>
                ))}
                {foodCategories.length === 0 && (
                  <p className="col-span-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-600">
                    No food categories available in nearby stores yet.
                  </p>
                )}
              </div>
            </section>

            {/* Popular/Featured (Store near you) */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Popular stores</h2>
                <button
                  type="button"
                  onClick={scrollToExplore}
                  className="text-sm text-green-800 font-medium flex items-center hover:text-green-900"
                >
                  See all <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide snap-x">
                {popularMerchants.map((merchant) => {
                  const openStatus = isMerchantOpen(merchant.openingHours);
                  return (
                    <div key={merchant.id} onClick={() => handleSelectMerchant(merchant.id)} className={`flex flex-col items-center gap-2 cursor-pointer min-w-[80px]${!openStatus.isOpen ? ' opacity-60' : ''}`}>
                      <div className="w-20 h-20 rounded-2xl bg-white shadow-sm border border-gray-100 p-2 overflow-hidden relative">
                        <OptimizedImage src={merchant.logoUrl} alt={merchant.name} width={LOGO_WIDTH} className="w-full h-full object-contain" />
                        {!openStatus.isOpen && (
                          <div className="absolute bottom-0 left-0 right-0 bg-red-500 text-white text-[9px] font-bold text-center py-0.5">
                            Closed
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-medium text-gray-900 text-center line-clamp-1">{merchant.name}</span>
                      <span className="text-[10px] text-gray-500">
                        {typeof merchant.distanceKm === 'number' ? `${merchant.distanceKm.toFixed(1)}km` : 'N/A'}
                      </span>
                      {!openStatus.isOpen && openStatus.nextOpenTime && (
                        <span className="text-[9px] text-red-500">{openStatus.nextOpenTime}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {/* Banner/Promotion Carousel */}
        <section className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Promotion</h2>
          </div>

          {promotions.length > 0 ? (
            <div>
              <div className="relative h-44 overflow-hidden rounded-2xl shadow-lg">
                {promotions.map((promotion, index) => (
                  <div
                    key={promotion.id}
                    className={`absolute inset-0 rounded-2xl overflow-hidden text-white transition-opacity duration-500 ${
                      index === currentPromotionIndex ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                    }`}
                  >
                    {promotion.banner_image_url ? (
                      <OptimizedImage
                        src={promotion.banner_image_url}
                        alt={promotion.title}
                        width={BANNER_WIDTH}
                        isPriority
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-r from-green-700 to-green-900" />
                    )}

                    <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/35 to-transparent" />

                    <div className="relative z-10 h-full p-6 flex flex-col justify-end">
                      <h3 className="text-2xl font-bold leading-tight">{promotion.title}</h3>
                      {promotion.subtitle && (
                        <p className="text-sm opacity-90 mt-1">{promotion.subtitle}</p>
                      )}
                      {promotion.cta_text && promotion.cta_link && (
                        <button
                          type="button"
                          onClick={() => openPromotionLink(promotion.cta_link)}
                          className="mt-3 self-start bg-white text-green-800 text-xs font-bold px-4 py-2 rounded-full shadow-sm hover:bg-gray-100"
                        >
                          {promotion.cta_text}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {promotions.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentPromotionIndex((prev) => (prev - 1 + promotions.length) % promotions.length)
                      }
                      className="absolute left-3 top-1/2 -translate-y-1/2 z-20 bg-white/85 text-gray-900 p-2 rounded-full shadow hover:bg-white"
                      aria-label="Previous promotion"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentPromotionIndex((prev) => (prev + 1) % promotions.length)
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-20 bg-white/85 text-gray-900 p-2 rounded-full shadow hover:bg-white"
                      aria-label="Next promotion"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {promotions.length > 1 && (
                <div className="mt-3 h-3 flex items-center justify-center gap-2">
                  {promotions.map((promotion, index) => (
                    <button
                      key={promotion.id}
                      type="button"
                      onClick={() => setCurrentPromotionIndex(index)}
                      className={`h-2.5 rounded-full transition-all ${
                        index === currentPromotionIndex ? 'w-6 bg-green-800' : 'w-2.5 bg-gray-300'
                      }`}
                      aria-label={`Go to promotion ${index + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-40 bg-gradient-to-r from-green-700 to-green-900 rounded-2xl relative overflow-hidden flex items-center px-6 text-white shadow-lg">
              <div className="z-10">
                <h3 className="text-2xl font-bold">No promotions yet</h3>
                <p className="text-xs opacity-90 mt-1">Add banners from the admin Promotions section.</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {isLocationEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Set delivery location</h2>
              <button
                type="button"
                onClick={closeLocationEditor}
                className="rounded-full p-2 text-gray-600 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-4 text-sm text-gray-600">
              Add your address manually so we can show merchants that deliver near you.
            </p>

            <AddressAutocompleteInput
              label="My location"
              value={manualLocationInput}
              rows={1}
              placeholder="Search street, building, or area"
              className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 focus:border-green-800 focus:ring-2 focus:ring-green-800/30"
              onChange={(value) => {
                setManualLocationInput(value);
                setManualLocationError(null);
              }}
              onSelect={(suggestion) => {
                setSelectedManualLocation(suggestion);
                setManualLocationError(null);
              }}
              onClearSelection={() => {
                setSelectedManualLocation(null);
              }}
            />

            <div className="mt-3">
              <MapLocationPicker
                latitude={selectedManualLocation?.latitude ?? userLocation?.latitude ?? null}
                longitude={selectedManualLocation?.longitude ?? userLocation?.longitude ?? null}
                onLocationSelect={(lat, lng, address, placeId) => {
                  setSelectedManualLocation({
                    placeId,
                    displayName: address,
                    latitude: lat,
                    longitude: lng,
                  });
                  setManualLocationInput(address);
                  setManualLocationError(null);
                }}
                showSearch={false}
                showGpsButton={false}
                height="220px"
                zoom={15}
              />
            </div>

            {manualLocationError && <p className="mt-2 text-sm text-red-600">{manualLocationError}</p>}
            {locationError && <p className="mt-2 text-sm text-amber-700">{locationError}</p>}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => requestLocation(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Navigation className="h-4 w-4" />
                Use current GPS
              </button>
              <button
                type="button"
                onClick={saveManualLocation}
                className="rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white hover:bg-green-900"
              >
                Save location
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default MerchantsList;
