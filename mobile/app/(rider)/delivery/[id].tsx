import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { useMerchants } from '../../../src/hooks/useMerchants';
import { riderOrdersApi } from '../../../src/lib/riderOrdersApi';
import { OrderRouteMap } from '../../../src/components/map/OrderRouteMap';
import { toMapPoint } from '../../../src/lib/map/orderPoints';
import { nextRiderAction, type RiderAction } from '../../../src/lib/riderActions';
import { openDirections } from '../../../src/lib/mapsLink';
import { openDialer } from '../../../src/lib/phoneLink';
import { statusStyle } from '../../../src/lib/statusColors';
import { colors, spacing } from '../../../src/theme';
import { Badge, Button, EmptyState } from '../../../src/components/ui';
import {
  DropOffSection,
  OrderSummarySection,
  PickupSection,
} from '../../../src/components/rider/DeliveryDetailSections';

const ACTION_LABEL: Record<RiderAction, string> = {
  pickup: 'Confirm pickup',
  deliver: 'Mark delivered',
};

const ACTION_CONFIRM: Record<RiderAction, string> = {
  pickup: 'Confirm you have collected this order from the merchant?',
  deliver: 'Confirm the customer has received this order?',
};

export default function RiderDeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isViewingAs } = useAuth();
  const { merchants } = useMerchants();
  const [isBusy, setIsBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetcher = useCallback(
    () => (id ? riderOrdersApi.getById(id) : Promise.resolve(null)),
    [id]
  );
  const { data: order, isLoading, error, refetch } = useLiveQuery(fetcher, [id], {
    enabled: !!id,
    realtime: id ? [{ table: 'orders', filter: `id=eq.${id}` }] : [],
  });

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const runAction = useCallback(
    async (action: RiderAction) => {
      if (!order || isViewingAs) return;
      setIsBusy(true);
      try {
        if (action === 'pickup') {
          await riderOrdersApi.markPickedUp(order.id);
          await refetch();
        } else {
          await riderOrdersApi.markDelivered(order.id);
          router.back();
        }
      } catch (err) {
        Alert.alert('Update failed', err instanceof Error ? err.message : 'Please try again.');
      } finally {
        setIsBusy(false);
      }
    },
    [order, isViewingAs, refetch, router]
  );

  const confirmAction = useCallback(
    (action: RiderAction) =>
      Alert.alert(ACTION_LABEL[action], ACTION_CONFIRM[action], [
        { text: 'Cancel', style: 'cancel' },
        { text: ACTION_LABEL[action], onPress: () => void runAction(action) },
      ]),
    [runAction]
  );

  const merchant = merchants.find((candidate) => candidate.id === order?.merchantId);

  const onNavigateToCustomer = useCallback(async () => {
    if (!order) return;
    const opened = await openDirections({
      latitude: order.deliveryLatitude,
      longitude: order.deliveryLongitude,
      address: order.address,
    });
    if (!opened) Alert.alert('No destination', 'This order has no delivery address or coordinates.');
  }, [order]);

  const onNavigateToStore = useCallback(async () => {
    const opened = await openDirections({
      latitude: merchant?.latitude ?? order?.merchantLatitude,
      longitude: merchant?.longitude ?? order?.merchantLongitude,
      address: merchant?.address ?? order?.merchantAddress,
    });
    if (!opened) Alert.alert('No destination', 'This store has no address or coordinates.');
  }, [merchant, order]);

  const callNumber = useCallback(async (phone: string | undefined, who: string) => {
    const opened = await openDialer(phone);
    if (!opened) {
      Alert.alert(
        'Cannot place call',
        phone ? `This device cannot dial ${phone}.` : `The ${who} has no contact number.`
      );
    }
  }, []);

  if (!order) {
    return isLoading ? null : (
      <EmptyState emoji="❓" title="Delivery not found" body={error?.message ?? 'It may have been reassigned.'} />
    );
  }

  const style = statusStyle(order.status);
  const action = nextRiderAction(order);

  // Both ends of the job on the map — where the food is collected and where
  // it is going. The order row keeps the store's coordinates as a fallback.
  const pickup = toMapPoint(
    merchant?.latitude ?? order.merchantLatitude,
    merchant?.longitude ?? order.merchantLongitude
  );
  const dropOff = toMapPoint(order.deliveryLatitude, order.deliveryLongitude);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.orderId}>Order #{order.id.slice(0, 8).toUpperCase()}</Text>
        <Badge label={style.label} color={style.color} backgroundColor={style.background} />
      </View>

      <OrderRouteMap merchant={pickup} destination={dropOff} />

      <PickupSection
        storeName={merchant?.name ?? order.merchantName}
        storeAddress={merchant?.address ?? order.merchantAddress}
        storePhone={merchant?.contactNumber}
        onNavigate={onNavigateToStore}
        onCall={() => void callNumber(merchant?.contactNumber, 'store')}
      />
      <DropOffSection
        order={order}
        onNavigate={onNavigateToCustomer}
        onCall={() => void callNumber(order.contactNumber, 'customer')}
      />
      <OrderSummarySection order={order} />

      {action && !isViewingAs && (
        <Button label={ACTION_LABEL[action]} isLoading={isBusy} onPress={() => confirmAction(action)} />
      )}
      {action && isViewingAs && (
        <Text style={styles.meta}>Read-only preview — “{ACTION_LABEL[action]}” is disabled.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  orderId: { fontSize: 16, fontWeight: '800', color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary },
});
