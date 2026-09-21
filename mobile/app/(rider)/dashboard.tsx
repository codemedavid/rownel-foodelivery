import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useRiderPresence } from '../../src/hooks/useRiderPresence';
import { useRiderOffers } from '../../src/hooks/useRiderOffers';
import { useRiderDeliveries } from '../../src/hooks/useRiderDeliveries';
import { useRiderLocation } from '../../src/hooks/useRiderLocation';
import { riderOffersApi } from '../../src/lib/riderOffersApi';
import { riderPresenceApi } from '../../src/lib/riderPresenceApi';
import { canGoOnline } from '../../src/lib/riderActions';
import type { Order } from '../../src/lib/adminTypes';
import { colors, spacing } from '../../src/theme';
import { EmptyState } from '../../src/components/ui';
import { OnlineToggleCard } from '../../src/components/rider/OnlineToggleCard';
import { OfferCard } from '../../src/components/rider/OfferCard';
import { DeliveryCard } from '../../src/components/rider/DeliveryCard';

export default function RiderHomeScreen() {
  const router = useRouter();
  const { effectiveUserId, isViewingAs } = useAuth();
  const riderId = effectiveUserId;

  const { presence, isOnline, refetch: refetchPresence } = useRiderPresence(riderId);
  // Keep publishing while online so the fix never goes stale under dispatch.
  const [isTracking, setIsTracking] = useState(false);
  useEffect(() => {
    if (isOnline) setIsTracking(true);
  }, [isOnline]);
  // The sensor runs from the moment the dashboard opens: rider_set_online
  // refuses anyone without a fix, so waiting for "online" to start the watch
  // would leave the rider permanently stuck on "Waiting for GPS".
  // Writes are a different matter — never publish while previewing, because
  // rider_update_location writes against the caller's own auth.uid() and would
  // corrupt the admin's presence row.
  const location = useRiderLocation({
    enabled: !isViewingAs,
    publish: !isViewingAs && (isTracking || isOnline),
  });

  const { offers, now, refetch: refetchOffers } = useRiderOffers(riderId, isOnline);
  const { deliveries, isLoading, refetch: refetchDeliveries } = useRiderDeliveries(riderId);

  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [isTogglingPresence, setIsTogglingPresence] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshAll = useCallback(async () => {
    await Promise.all([refetchPresence(), refetchOffers(), refetchDeliveries()]);
  }, [refetchPresence, refetchOffers, refetchDeliveries]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshAll();
    setIsRefreshing(false);
  }, [refreshAll]);

  const onTogglePresence = useCallback(
    async (next: boolean) => {
      if (isViewingAs) return;
      setError(null);
      setIsTogglingPresence(true);
      try {
        if (next) {
          if (!location.coords) throw new Error('Waiting for a GPS fix — try again in a moment.');
          // Seed presence with a fresh fix so dispatch can see us immediately.
          await riderPresenceApi.updateLocation(location.coords.latitude, location.coords.longitude);
        }
        await riderPresenceApi.setOnline(next);
        if (!next) setIsTracking(false);
        await refetchPresence();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update your status.');
      } finally {
        setIsTogglingPresence(false);
      }
    },
    [isViewingAs, location.coords, refetchPresence]
  );

  const onAccept = useCallback(
    async (offerId: string) => {
      if (isViewingAs) return;
      setBusyOfferId(offerId);
      setError(null);
      try {
        await riderOffersApi.accept(offerId);
        await Promise.all([refetchOffers(), refetchDeliveries()]);
      } catch (err) {
        Alert.alert('Could not accept', err instanceof Error ? err.message : 'The offer may have expired.');
      } finally {
        setBusyOfferId(null);
      }
    },
    [isViewingAs, refetchOffers, refetchDeliveries]
  );

  const onReject = useCallback(
    async (offerId: string) => {
      if (isViewingAs) return;
      setBusyOfferId(offerId);
      try {
        await riderOffersApi.reject(offerId);
        await refetchOffers();
      } catch (err) {
        Alert.alert('Could not skip', err instanceof Error ? err.message : 'Please try again.');
      } finally {
        setBusyOfferId(null);
      }
    },
    [isViewingAs, refetchOffers]
  );

  const openDelivery = useCallback(
    (order: Order) => router.push({ pathname: '/(rider)/delivery/[id]', params: { id: order.id } }),
    [router]
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <OnlineToggleCard
        isOnline={isOnline}
        isBusy={isTogglingPresence}
        canGoOnline={canGoOnline(location)}
        permission={location.permission}
        hasFix={!!location.coords}
        lastFixAt={location.lastUpdate ?? presence?.lastLocationUpdate ?? null}
        searchStartedAt={location.searchStartedAt}
        locationError={location.error}
        error={error}
        isReadOnly={isViewingAs}
        onToggle={onTogglePresence}
        onRetryGps={location.retry}
      />

      <Text style={styles.sectionTitle}>New offers</Text>
      {offers.length === 0 ? (
        <EmptyState
          emoji={isOnline ? '📭' : '💤'}
          title={isOnline ? 'No offers right now' : "You're offline"}
          body={isOnline ? 'New orders near you appear here instantly.' : 'Go online to start receiving orders.'}
        />
      ) : (
        offers.map((item) => (
          <OfferCard
            key={item.offer.id}
            item={item}
            now={now}
            isBusy={busyOfferId === item.offer.id}
            isReadOnly={isViewingAs}
            onAccept={onAccept}
            onReject={onReject}
          />
        ))
      )}

      <Text style={styles.sectionTitle}>Active deliveries</Text>
      {deliveries.length === 0 ? (
        isLoading ? null : (
          <EmptyState emoji="🛵" title="Nothing to deliver" body="Accepted orders show up here." />
        )
      ) : (
        deliveries.map((order) => (
          <DeliveryCard key={order.id} order={order} onPress={openDelivery} />
        ))
      )}
      <View style={styles.tail} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  tail: { height: spacing.xxl },
});
