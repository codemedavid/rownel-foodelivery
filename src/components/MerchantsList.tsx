import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, MapPin, Bell, Search, ChevronRight, ChevronDown, ChevronLeft, Navigation, X } from 'lucide-react';
import { useMerchant } from '../contexts/MerchantContext';
import { calculateDistance } from '../utils/geolocation';
import { MenuItem, Merchant } from '../types';
import AddressAutocompleteInput from './AddressAutocompleteInput';
import { reverseGeocode, type OSMAddressSuggestion } from '../lib/osm';
import { useMenu } from '../hooks/useMenu';
import { usePromotions } from '../hooks/usePromotions';

const USER_LOCATION_STORAGE_KEY = 'userDeliveryLocation';
const MAX_SEARCH_RESULTS = 20;
const NEAR_ME_VISIBLE_LIMIT = 5;

interface StoredUserLocation {
  latitude: number;
  longitude: number;
  displayName: string;
  street: string;
}

type MerchantWithDistance = Merchant & { distanceKm?: number };
type MenuSearchResult = MenuItem & { merchant: MerchantWithDistance };

const MerchantsList: React.FC = () => {
  const navigate = useNavigate();
  const { merchants, loading, selectMerchantById } = useMerchant();
  const { menuItems } = useMenu();
  const { promotions } = usePromotions();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPromotionIndex, setCurrentPromotionIndex] = useState(0);
  const [showAllNearMe, setShowAllNearMe] = useState(false);

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'locating' | 'ready' | 'error'>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationStreet, setLocationStreet] = useState<string>('Set your location');
  const [locationDisplayName, setLocationDisplayName] = useState<string>('');

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

  const persistLocation = (location: StoredUserLocation | null) => {
    if (!location) {
      localStorage.removeItem(USER_LOCATION_STORAGE_KEY);
      return;
    }

    localStorage.setItem(USER_LOCATION_STORAGE_KEY, JSON.stringify(location));
  };

  const applyLocation = (location: StoredUserLocation, save = true) => {
    setUserLocation({ latitude: location.latitude, longitude: location.longitude });
    setLocationStreet(location.street);
    setLocationDisplayName(location.displayName);
    setLocationStatus('ready');
    setLocationError(null);

    if (save) {
      persistLocation(location);
    }
  };

  const openLocationEditor = () => {
    setManualLocationInput(locationDisplayName || '');
    setSelectedManualLocation(null);
    setManualLocationError(null);
    setIsLocationEditorOpen(true);
  };

  const requestLocation = useCallback((openManualPromptOnError = false) => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocationError('Location is not supported by this browser.');
      if (openManualPromptOnError) {
        setIsLocationEditorOpen(true);
      }
      return;
    }

    setLocationStatus('locating');
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const reverse = await reverseGeocode(coords.latitude, coords.longitude);
          applyLocation(
            {
              latitude: reverse.latitude,
              longitude: reverse.longitude,
              displayName: reverse.displayName,
              street: reverse.street,
            },
            true
          );
        } catch {
          applyLocation(
            {
              latitude: coords.latitude,
              longitude: coords.longitude,
              displayName: `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`,
              street: 'Current location',
            },
            true
          );
        }

        setIsLocationEditorOpen(false);
      },
      (error) => {
        setLocationStatus('error');
        setLocationError(error.message || 'Unable to get your location.');

        const hasSavedLocation = Boolean(localStorage.getItem(USER_LOCATION_STORAGE_KEY));
        if (openManualPromptOnError && !hasSavedLocation) {
          setIsLocationEditorOpen(true);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, []);

  useEffect(() => {
    const savedLocationRaw = localStorage.getItem(USER_LOCATION_STORAGE_KEY);
    if (savedLocationRaw) {
      try {
        const parsed = JSON.parse(savedLocationRaw) as Partial<StoredUserLocation>;
        if (
          typeof parsed.latitude === 'number' &&
          typeof parsed.longitude === 'number' &&
          typeof parsed.displayName === 'string' &&
          typeof parsed.street === 'string'
        ) {
          applyLocation(
            {
              latitude: parsed.latitude,
              longitude: parsed.longitude,
              displayName: parsed.displayName,
              street: parsed.street,
            },
            false
          );
          return;
        }
      } catch {
        localStorage.removeItem(USER_LOCATION_STORAGE_KEY);
      }
    }

    requestLocation(true);
  }, [requestLocation]);

  const merchantsWithDistance = useMemo(() => {
    const base = merchants;

    if (!userLocation) {
      return base as MerchantWithDistance[];
    }

    return base
      .map((m) => {
        if (typeof m.latitude === 'number' && typeof m.longitude === 'number') {
          const dist = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            m.latitude,
            m.longitude
          );
          return { ...m, distanceKm: dist } as MerchantWithDistance;
        }
        return m as MerchantWithDistance;
      })
      .filter((m) => {
        if (typeof m.distanceKm !== 'number') return false;
        const maxDistanceKm = m.maxDeliveryDistanceKm ?? null;
        return maxDistanceKm == null || m.distanceKm <= maxDistanceKm;
      });
  }, [merchants, userLocation]);

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
      const distA = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const distB = b.distanceKm ?? Number.POSITIVE_INFINITY;
      return distA - distB;
    });
  }, [merchantsWithDistance]);

  const nearMeMerchants = useMemo(() => {
    if (showAllNearMe) {
      return allNearMeMerchants;
    }

    return allNearMeMerchants.slice(0, NEAR_ME_VISIBLE_LIMIT);
  }, [allNearMeMerchants, showAllNearMe]);

  const popularMerchants = useMemo(() => {
    return [...merchantsWithDistance].sort((a, b) => b.rating - a.rating).slice(0, 5);
  }, [merchantsWithDistance]);

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
    setIsLocationEditorOpen(false);
  };

  const openPromotionLink = (link: string | null) => {
    if (!link) return;

    if (link.startsWith('http://') || link.startsWith('https://')) {
      window.open(link, '_blank', 'noopener,noreferrer');
      return;
    }

    navigate(link);
  };

  const MerchantCardLarge = ({ merchant }: { merchant: MerchantWithDistance }) => (
    <button
      onClick={() => handleSelectMerchant(merchant.id)}
      className="flex-shrink-0 w-64 sm:w-72 bg-white rounded-2xl p-0 shadow-sm hover:shadow-md transition-all text-left overflow-hidden border border-gray-100"
    >
      <div className="h-32 bg-gray-100 relative">
        {merchant.coverImageUrl || merchant.logoUrl ? (
          <img
            src={merchant.coverImageUrl || merchant.logoUrl}
            alt={merchant.name}
            className="w-full h-full object-cover"
          />
        ) : null}
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
            {merchant.rating.toFixed(1)} <span className="text-gray-400 font-normal">({merchant.totalReviews})</span>
          </div>
          <div className="flex items-center gap-1 text-gray-500">
            <MapPin className="w-3.5 h-3.5" />
            {typeof merchant.distanceKm === 'number' ? `${merchant.distanceKm.toFixed(1)}km` : 'N/A'}
          </div>
        </div>
      </div>
    </button>
  );

  const FoodSearchCard = ({ item }: { item: MenuSearchResult }) => (
    <button
      type="button"
      onClick={() => handleSelectFoodResult(item)}
      className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
          {item.image ? (
            <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
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

          <button className="p-2 bg-white border border-gray-100 rounded-full shadow-sm hover:bg-gray-50 relative">
            <Bell className="w-5 h-5 text-gray-600" />
            <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
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
                {categories.map((cat) => (
                  <div key={cat.id} className="flex flex-col items-center gap-2 min-w-[72px] cursor-pointer group">
                    <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-2xl shadow-sm border border-gray-100 group-hover:scale-105 transition-transform">
                      {cat.icon}
                    </div>
                    <span className="text-xs font-medium text-gray-700">{cat.name}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Restaurants Near Me (Horizontal Scroll) */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Restaurants near me</h2>
                {allNearMeMerchants.length > NEAR_ME_VISIBLE_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setShowAllNearMe((prev) => !prev)}
                    className="text-sm text-green-800 font-medium flex items-center hover:text-green-900"
                    aria-expanded={showAllNearMe}
                  >
                    {showAllNearMe ? 'See less' : 'See more'}{' '}
                    {showAllNearMe ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
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
                <h2 className="text-lg font-bold text-gray-900">Store near you</h2>
                <button className="text-sm text-green-800 font-medium flex items-center hover:text-green-900">
                  See more <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide snap-x">
                {popularMerchants.map((merchant) => (
                  <div key={merchant.id} onClick={() => handleSelectMerchant(merchant.id)} className="flex flex-col items-center gap-2 cursor-pointer min-w-[80px]">
                    <div className="w-20 h-20 rounded-2xl bg-white shadow-sm border border-gray-100 p-2 overflow-hidden">
                      <img src={merchant.logoUrl || ''} alt={merchant.name} className="w-full h-full object-contain" />
                    </div>
                    <span className="text-xs font-medium text-gray-900 text-center line-clamp-1">{merchant.name}</span>
                    <span className="text-[10px] text-gray-500">
                      {typeof merchant.distanceKm === 'number' ? `${merchant.distanceKm.toFixed(1)}km` : 'N/A'}
                    </span>
                  </div>
                ))}
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
                      <img
                        src={promotion.banner_image_url}
                        alt={promotion.title}
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
                onClick={() => setIsLocationEditorOpen(false)}
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
