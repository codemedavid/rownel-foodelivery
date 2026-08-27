import React, { useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMerchants } from '../src/hooks/useMerchants';
import { MerchantCard } from '../src/components/MerchantCard';
import { BasketBar } from '../src/components/BasketBar';
import { colors, radius, spacing } from '../src/theme';
import { Merchant } from '../src/types';

const CATEGORY_EMOJI: Record<string, string> = {
  restaurant: '🍽️',
  cafe: '☕',
  bakery: '🥐',
  'fast-food': '🍔',
};

export default function HomeScreen() {
  const { merchants, isLoading, error, refetch } = useMerchants();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const categories = useMemo(
    () => [...new Set(merchants.map((m) => m.category))],
    [merchants]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return merchants.filter((m) => {
      if (activeCategory && m.category !== activeCategory) return false;
      if (!query) return true;
      return (
        m.name.toLowerCase().includes(query) ||
        (m.cuisineType ?? '').toLowerCase().includes(query)
      );
    });
  }, [merchants, search, activeCategory]);

  const featured = useMemo(() => filtered.filter((m) => m.featured), [filtered]);

  const openMerchant = (merchant: Merchant) => router.push(`/merchant/${merchant.id}`);

  const renderHeader = () => (
    <View>
      <Text style={styles.greeting}>Kumusta! 👋</Text>
      <Text style={styles.tagline}>What are you craving today?</Text>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search restaurants or cuisines"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        <Pressable
          style={[styles.chip, activeCategory === null && styles.chipActive]}
          onPress={() => setActiveCategory(null)}
        >
          <Text style={[styles.chipText, activeCategory === null && styles.chipTextActive]}>
            All
          </Text>
        </Pressable>
        {categories.map((category) => {
          const isActive = activeCategory === category;
          return (
            <Pressable
              key={category}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => setActiveCategory(isActive ? null : category)}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {CATEGORY_EMOJI[category] ?? '🍴'} {category}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {featured.length > 0 && !search && (
        <>
          <Text style={styles.sectionTitle}>Featured</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featuredRow}
          >
            {featured.map((m) => (
              <View key={m.id} style={styles.featuredCard}>
                <MerchantCard merchant={m} onPress={openMerchant} />
              </View>
            ))}
          </ScrollView>
        </>
      )}

      <Text style={styles.sectionTitle}>All restaurants</Text>
    </View>
  );

  if (isLoading && merchants.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading restaurants…</Text>
      </View>
    );
  }

  if (error && merchants.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Couldn't load restaurants.</Text>
        <Text style={styles.errorDetail}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MerchantCard merchant={item} onPress={openMerchant} />}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No restaurants match your search.</Text>
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + spacing.lg, paddingBottom: 120 },
        ]}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
      />
      <BasketBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingHorizontal: spacing.lg },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  loadingText: { marginTop: spacing.md, color: colors.textSecondary },
  errorText: { fontSize: 17, fontWeight: '700', color: colors.text },
  errorDetail: { marginTop: spacing.xs, color: colors.textSecondary, textAlign: 'center' },
  retryButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  retryText: { color: '#fff', fontWeight: '700' },
  greeting: { fontSize: 26, fontWeight: '800', color: colors.text },
  tagline: { fontSize: 15, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.lg },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: { fontSize: 15, marginRight: spacing.sm },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.text },
  chipsRow: { gap: spacing.sm, paddingVertical: spacing.lg },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.text, textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  featuredRow: { gap: spacing.md, paddingBottom: spacing.sm },
  featuredCard: { width: 280 },
  emptyText: { textAlign: 'center', color: colors.textSecondary, marginTop: spacing.xl },
});
