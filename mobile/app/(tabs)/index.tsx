import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMerchants } from '../../src/hooks/useMerchants';
import { useDebouncedValue } from '../../src/hooks/useDebouncedValue';
import { useDishSearch } from '../../src/hooks/useDishSearch';
import { useRecentSearches } from '../../src/hooks/useRecentSearches';
import { useUserLocation } from '../../src/context/LocationContext';
import { decorateAndFilterMerchantsByDistance } from '../../src/lib/merchantDistance';
import { searchMerchants, suggestMerchants } from '../../src/lib/merchantSearch';
import { MerchantCard } from '../../src/components/MerchantCard';
import { MerchantResultRow } from '../../src/components/MerchantResultRow';
import { BasketBar } from '../../src/components/BasketBar';
import { EmptyState, MerchantCardSkeleton, SectionHeader } from '../../src/components/ui';
import { colors, radius, shadows, spacing } from '../../src/theme';
import { Merchant } from '../../src/types';

const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  restaurant: { emoji: '🍽️', label: 'Restaurant' },
  cafe: { emoji: '☕', label: 'Cafe' },
  bakery: { emoji: '🥐', label: 'Bakery' },
  'fast-food': { emoji: '🍔', label: 'Fast food' },
};

const SKELETON_COUNT = 3;
const BASKET_BAR_CLEARANCE = 130;
const SEARCH_DEBOUNCE_MS = 250;
const MAX_SUGGESTIONS = 3;

const describeCategory = (category: string) =>
  CATEGORY_META[category] ?? { emoji: '🍴', label: category };

export default function HomeScreen() {
  const { merchants, isLoading, error, refetch } = useMerchants();
  const { userLocation, locationStatus, locationError, locationLabel, requestLocation } =
    useUserLocation();
  const [search, setSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const { recentSearches, rememberSearch, clearRecentSearches } = useRecentSearches();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const { dishesByMerchant, isSearching: isSearchingDishes } = useDishSearch(debouncedSearch);

  const nearbyMerchants = useMemo(
    () => decorateAndFilterMerchantsByDistance(merchants, userLocation),
    [merchants, userLocation]
  );

  const categories = useMemo(
    () => [...new Set(nearbyMerchants.map((m) => m.category))],
    [nearbyMerchants]
  );

  const query = search.trim();

  const results = useMemo(
    () =>
      searchMerchants(nearbyMerchants, query, {
        dishesByMerchant,
        category: activeCategory,
      }),
    [nearbyMerchants, query, dishesByMerchant, activeCategory]
  );

  /** Loosened "did you mean" matches, only worth computing when nothing matched. */
  const suggestions = useMemo(
    () =>
      results.length > 0 || !query
        ? []
        : suggestMerchants(nearbyMerchants, query, MAX_SUGGESTIONS, {
            dishesByMerchant,
          }),
    [results.length, nearbyMerchants, query, dishesByMerchant]
  );

  const filtered = useMemo(() => results.map((result) => result.merchant), [results]);
  const featured = useMemo(() => filtered.filter((m) => m.featured), [filtered]);
  const dishHints = useMemo(
    () => new Map(results.map((result) => [result.merchant.id, result.matchedDishes])),
    [results]
  );

  const hasQuery = Boolean(query);
  const isFiltering = hasQuery || Boolean(activeCategory);
  /** Dish matches arrive after the debounce — the merchant list is already live. */
  const isLoadingDishMatches = hasQuery && (query !== debouncedSearch || isSearchingDishes);
  const showRecentSearches = isSearchFocused && !hasQuery && recentSearches.length > 0;
  const isSearchMode = isSearchFocused || hasQuery;

  const openMerchant = useCallback(
    (merchant: Merchant) => {
      if (hasQuery) rememberSearch(search);
      router.push(`/merchant/${merchant.id}`);
    },
    [hasQuery, rememberSearch, router, search]
  );

  const clearFilters = useCallback(() => {
    setSearch('');
    setActiveCategory(null);
  }, []);

  const hero = (
    <View style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}>
      <Pressable
        style={styles.locationRow}
        onPress={() => requestLocation()}
        accessibilityRole="button"
        accessibilityLabel="Refresh your delivery location"
      >
        <View style={styles.locationIconTile}>
          <Ionicons name="location" size={13} color={colors.onPrimary} />
        </View>
        <View style={styles.locationText}>
          <Text style={styles.locationCaption}>Deliver to</Text>
          <Text style={styles.locationLabel} numberOfLines={1}>
            {locationStatus === 'locating' ? 'Detecting your location…' : locationLabel}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </Pressable>

      {/* The greeting yields its space to results once search takes over. */}
      {isSearchMode ? null : (
        <>
          <Text style={styles.greeting}>Kumusta! 👋</Text>
          <Text style={styles.tagline}>What are you craving today?</Text>
        </>
      )}

      <View style={styles.searchBox}>
        <Ionicons name="search" size={17} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search restaurants, cuisines or dishes"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          onSubmitEditing={() => rememberSearch(search)}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
          accessibilityLabel="Search restaurants, cuisines or dishes"
        />
        {isLoadingDishMatches ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : null}
        {!!search && (
          <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={17} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {showRecentSearches && (
        <View style={styles.recentBlock}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>Recent searches</Text>
            <Pressable onPress={clearRecentSearches} hitSlop={8}>
              <Text style={styles.recentClear}>Clear</Text>
            </Pressable>
          </View>
          <View style={styles.recentRow}>
            {recentSearches.map((query) => (
              <Pressable
                key={query}
                style={styles.recentChip}
                onPress={() => setSearch(query)}
                accessibilityRole="button"
                accessibilityLabel={`Search for ${query}`}
              >
                <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                <Text style={styles.recentChipText}>{query}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );

  const listHeader = (
    <View>
      {locationStatus === 'error' && !userLocation && (
        <View style={styles.locationBanner}>
          <Ionicons name="warning-outline" size={20} color={colors.accentDark} />
          <View style={styles.locationBannerBody}>
            <Text style={styles.locationBannerTitle}>
              Turn on location to see restaurants near you
            </Text>
            {locationError ? (
              <Text style={styles.locationBannerText}>{locationError}</Text>
            ) : null}
            <Pressable style={styles.locationBannerButton} onPress={() => requestLocation()}>
              <Text style={styles.locationBannerButtonText}>Try again</Text>
            </Pressable>
          </View>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRow}
      >
        <CategoryTile
          emoji="✨"
          label="All"
          isActive={activeCategory === null}
          onPress={() => setActiveCategory(null)}
        />
        {categories.map((category) => {
          const { emoji, label } = describeCategory(category);
          const isActive = activeCategory === category;
          return (
            <CategoryTile
              key={category}
              emoji={emoji}
              label={label}
              isActive={isActive}
              onPress={() => setActiveCategory(isActive ? null : category)}
            />
          );
        })}
      </ScrollView>

      {featured.length > 0 && !isFiltering && (
        <View style={styles.section}>
          <SectionHeader title="Featured" subtitle="Handpicked spots worth the wait" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featuredRow}
          >
            {featured.map((m) => (
              <View key={m.id} style={styles.featuredCard}>
                <MerchantCard merchant={m} onPress={openMerchant} variant="compact" />
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.section}>
        <SectionHeader
          title={hasQuery ? `Results for "${query}"` : userLocation ? 'Near you' : 'All restaurants'}
          subtitle={
            hasQuery
              ? `${filtered.length} ${filtered.length === 1 ? 'match' : 'matches'}${
                  isLoadingDishMatches ? ' · still checking menus…' : ''
                }`
              : `${filtered.length} ${filtered.length === 1 ? 'place' : 'places'} available`
          }
        />
      </View>
    </View>
  );

  if (isLoading && merchants.length === 0) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.skeletonContent}>
          {hero}
          <View style={styles.skeletonList}>
            {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              <MerchantCardSkeleton key={index} />
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  if (error && merchants.length === 0) {
    return (
      <View style={styles.centered}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load restaurants"
          body={error}
          actionLabel="Try again"
          onActionPress={refetch}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {hero}
      <FlatList
        data={filtered}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            {hasQuery ? (
              <MerchantResultRow
                merchant={item}
                onPress={openMerchant}
                matchedDishes={dishHints.get(item.id)}
              />
            ) : (
              <MerchantCard
                merchant={item}
                onPress={openMerchant}
                matchedDishes={dishHints.get(item.id)}
              />
            )}
          </View>
        )}
        ListHeaderComponent={listHeader}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          isLoadingDishMatches ? (
            <View style={styles.searchingBlock}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.searchingText}>Searching menus…</Text>
            </View>
          ) : (
            <View>
              <EmptyState
                icon={isFiltering ? 'search-outline' : 'storefront-outline'}
                title={isFiltering ? 'No matches' : 'Nothing nearby yet'}
                body={
                  isFiltering
                    ? activeCategory && hasQuery
                      ? `Nothing in ${describeCategory(activeCategory).label} matches "${query}".`
                      : 'Try a different search term — we also look inside menus.'
                    : userLocation
                      ? 'No restaurants deliver to your location yet.'
                      : 'No restaurants available right now.'
                }
                actionLabel={isFiltering ? 'Clear filters' : undefined}
                onActionPress={isFiltering ? clearFilters : undefined}
              />
              {suggestions.length > 0 && (
                <View style={styles.section}>
                  <SectionHeader title="You might like" subtitle="Closest matches we found" />
                  {suggestions.map(({ merchant, matchedDishes }) => (
                    <MerchantResultRow
                      key={merchant.id}
                      merchant={merchant}
                      onPress={openMerchant}
                      matchedDishes={matchedDishes}
                    />
                  ))}
                </View>
              )}
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: BASKET_BAR_CLEARANCE }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
      />
      <BasketBar />
    </View>
  );
}

function CategoryTile({
  emoji,
  label,
  isActive,
  onPress,
}: {
  emoji: string;
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      style={({ pressed }) => [styles.categoryTile, isActive && styles.categoryTileActive, pressed && { opacity: 0.75 }]}
    >
      <Text style={styles.categoryEmoji}>{emoji}</Text>
      <Text style={[styles.categoryLabel, isActive && styles.categoryLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listItem: { paddingHorizontal: spacing.lg },
  centered: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
  skeletonContent: { paddingBottom: spacing.xxl },
  skeletonList: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },

  hero: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadows.sm,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  locationIconTile: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationText: { flex: 1 },
  locationCaption: { fontSize: 11, color: colors.textMuted, fontWeight: '700', letterSpacing: 0.4 },
  locationLabel: { fontSize: 14, fontWeight: '800', color: colors.text },
  greeting: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.6,
    marginTop: spacing.lg,
  },
  tagline: { fontSize: 15, color: colors.textSecondary, marginTop: 2 },
  searchBox: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: 13, fontSize: 15, color: colors.text },
  recentBlock: { marginTop: spacing.md },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recentTitle: { fontSize: 12, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.4 },
  recentClear: { fontSize: 12, fontWeight: '800', color: colors.primary },
  recentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  recentChipText: { fontSize: 13, fontWeight: '600', color: colors.text },
  searchingBlock: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  searchingText: { fontSize: 13, color: colors.textSecondary },

  locationBanner: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.accentLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  locationBannerBody: { flex: 1 },
  locationBannerTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  locationBannerText: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },
  locationBannerButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    backgroundColor: colors.accentDark,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  locationBannerButtonText: { color: colors.onPrimary, fontSize: 13, fontWeight: '800' },

  categoryRow: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xs,
  },
  categoryTile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 78,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryTileActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  categoryEmoji: { fontSize: 22 },
  categoryLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  categoryLabelActive: { color: colors.primaryDark },

  section: { paddingHorizontal: spacing.lg },
  featuredRow: { gap: spacing.md, paddingBottom: spacing.sm },
  featuredCard: { width: 260 },
});
